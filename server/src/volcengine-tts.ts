import { randomUUID } from "node:crypto"; // 为每条连接和每个会话生成唯一标识。
import { gunzipSync } from "node:zlib"; // 解压火山引擎返回的 gzip 负载。
import WebSocket from "ws"; // 创建服务端到火山引擎的 WebSocket 连接。

// 火山引擎双向流式语音合成服务的 WebSocket 地址。
const ttsUrl = "wss://openspeech.bytedance.com/api/v3/tts/bidirection";
// 双向 TTS 协议中各类请求和响应对应的事件编号。
const event = {
  startConnection: 1, // 请求建立一条 TTS 服务连接。
  finishConnection: 2, // 通知服务端关闭这条 TTS 服务连接。
  connectionStarted: 50, // 服务端确认连接已建立。
  startSession: 100, // 在已连接的通道上创建合成会话。
  finishSession: 102, // 通知服务端本次会话的文本已发送完。
  sessionStarted: 150, // 服务端确认合成会话已准备好。
  sessionFinished: 152, // 服务端确认会话处理完成。
  sessionFailed: 153, // 服务端通知会话失败。
  taskRequest: 200, // 向会话提交一段待合成的文本。
  ttsResponse: 352, // 服务端返回的一段音频数据。
};

// 浏览器与本模块之间只传文本片段和结束信号，不传火山引擎凭证。
interface TtsMessage {
  type: "text" | "finish"; // text 表示提交增量文本，finish 表示文本发送完毕。
  text?: string; // type 为 text 时携带要合成的文字。
}

/** 代理浏览器和火山引擎之间的实时 TTS WebSocket，避免把凭证交给浏览器。 */
export function connectVolcengineTts(client: WebSocket) {
  const appId = process.env.VOLCENGINE_TTS_APP_ID; // 从服务端环境变量读取应用 ID。
  const accessToken = process.env.VOLCENGINE_TTS_ACCESS_TOKEN; // 从服务端环境变量读取访问令牌。
  const resourceId = process.env.VOLCENGINE_TTS_RESOURCE_ID ?? "seed-tts-1.0"; // 读取资源 ID；未配置时使用默认资源。
  const voiceType = process.env.VOLCENGINE_TTS_VOICE_TYPE; // 读取要使用的发音人类型。
  const encoding = process.env.VOLCENGINE_TTS_ENCODING ?? "mp3"; // 读取音频格式；未配置时输出 MP3。

  // 建立上游连接必须有应用 ID、访问令牌和发音人配置。
  if (!appId || !accessToken || !voiceType) {
    sendClientError(client, "请先在 .env 中填写火山引擎 TTS 配置。"); // 将缺少配置的原因返回给浏览器。
    return; // 配置不全时不创建上游连接。
  }

  const sessionId = randomUUID(); // 为本轮语音合成生成会话 ID。
  const pendingText: string[] = []; // 暂存上游会话就绪前从浏览器收到的文本片段。
  let upstreamReady = false; // 记录火山引擎会话是否已经可以接收文本。
  let finishRequested = false; // 记录浏览器是否已先行请求结束本轮文本输入。
  // 使用服务端凭证连接火山引擎，凭证不会发送到浏览器。
  const upstream = new WebSocket(ttsUrl, {
    headers: {
      "X-Api-App-Id": appId, // 提供火山引擎应用 ID。
      "X-Api-Access-Key": accessToken, // 提供火山引擎访问令牌。
      "X-Api-Resource-Id": resourceId, // 指定所使用的 TTS 资源。
      "X-Api-Connect-Id": randomUUID(), // 为本条上游连接生成追踪 ID。
    },
  });

  // 上游连接建立后先发起 TTS 连接，收到确认后再创建合成会话。
  // open 事件说明 WebSocket 握手已成功，可以发送协议帧。
  upstream.on("open", () => upstream.send(createFrame(event.startConnection, {
    event: event.startConnection, // 在 JSON 负载中声明连接建立事件。
    namespace: "BidirectionalTTS", // 指定使用双向 TTS 协议命名空间。
  }, "")));

  // 浏览器只发送文字和结束信号；凭证始终留在服务端。
  client.on("message", (data, isBinary) => {
    if (isBinary) return; // 当前浏览器协议只接受 JSON 文本消息，忽略二进制输入。
    try {
      const message = JSON.parse(data.toString()) as TtsMessage; // 将 WebSocket 文本解析成约定的消息类型。
      if (message.type === "text" && message.text) {
        if (upstreamReady) sendText(message.text); // 上游就绪时立即提交文本以减少合成延迟。
        else pendingText.push(message.text); // 上游未就绪时先缓存，避免丢失早到的文本。
      }
      if (message.type === "finish") {
        finishRequested = true; // 记下结束请求，供上游会话就绪后处理。
        if (upstreamReady) finishSession(); // 若上游已就绪，立即通知其文本输入结束。
      }
    } catch {
      sendClientError(client, "无法解析语音 WebSocket 消息。"); // JSON 无法解析时向浏览器报告协议错误。
    }
  });

  // 接收火山引擎的协议响应，并按事件类型推进会话或转发音频。
  upstream.on("message", (data) => {
    try {
      const frame = parseFrame(Buffer.from(data as Buffer)); // 将 WebSocket 数据转换为 Buffer 并解析协议帧。
      if (frame.type === 0x0f || frame.event === event.sessionFailed) {
        sendClientError(client, readError(frame)); // 错误帧或会话失败时，将可读错误转发给浏览器。
        client.close(); // 结束已失败的浏览器侧语音连接。
        upstream.close(); // 释放火山引擎侧连接。
        return; // 错误处理完成后不再处理该帧。
      }

      if (frame.event === event.connectionStarted) {
        // 连接建立后配置发音人和音频格式，开始本次合成会话。
        const reqParams = {
          speaker: voiceType, // 指定当前配置的发音人。
          audio_params: { format: encoding, sample_rate: 24000 }, // 指定输出格式及 24 kHz 采样率。
        };
        upstream.send(createFrame(event.startSession, {
          event: event.startSession, // 声明这是开始会话事件。
          namespace: "BidirectionalTTS", // 指定双向 TTS 协议命名空间。
          user: { uid: "knowledge-assistant" }, // 提供本应用内稳定的用户标识。
          req_params: reqParams, // 携带发音人和音频输出参数。
        }, sessionId));
      }

      if (frame.event === event.sessionStarted) {
        upstreamReady = true; // 标记会话就绪，后续文字可以直接发送。
        client.send(JSON.stringify({ type: "ready" })); // 告知浏览器上游会话已准备完成。
        for (const text of pendingText.splice(0)) sendText(text); // 按接收顺序发送启动期间缓存的文本。
        if (finishRequested) finishSession(); // 如果浏览器已经请求结束，补发会话结束事件。
      }

      if (frame.event === event.ttsResponse && frame.payload.length && client.readyState === WebSocket.OPEN) {
        client.send(frame.payload, { binary: true }); // 将非空音频片段原样作为二进制数据转发给浏览器。
      }

      if (frame.event === event.sessionFinished) {
        client.send(JSON.stringify({ type: "done" })); // 告知浏览器本轮音频已经全部生成。
        upstream.send(createFrame(event.finishConnection, {}, "")); // 通知火山引擎关闭 TTS 连接。
        upstream.close(); // 释放已完成的上游 WebSocket。
      }
    } catch (error) {
      sendClientError(client, error instanceof Error ? error.message : "无法解析 TTS 音频数据。"); // 解析异常时优先返回具体错误信息。
      upstream.close(); // 出错后关闭上游连接，结束当前处理。
    }
  });

  // 将上游连接错误转换成浏览器可识别的 JSON 错误消息。
  upstream.on("error", () => sendClientError(client, "火山引擎 TTS WebSocket 连接失败。"));
  // 上游正常或异常关闭时，同步结束仍打开的浏览器连接。
  upstream.on("close", () => {
    if (client.readyState === WebSocket.OPEN) client.close(); // 仅在浏览器连接仍打开时调用 close。
  });
  // 浏览器离开时关闭上游连接，避免遗留语音会话。
  client.on("close", () => upstream.close());

  // 每次任务请求发送新文本片段，音频由上游 WebSocket 并行返回。
  function sendText(text: string) {
    upstream.send(createFrame(event.taskRequest, {
      event: event.taskRequest, // 声明这是文本合成任务请求。
      namespace: "BidirectionalTTS", // 使用双向 TTS 协议命名空间。
      user: { uid: "knowledge-assistant" }, // 使用本应用的用户标识。
      req_params: { text }, // 将本次收到的文本片段放入请求参数。
    }, sessionId));
  }

  // 通知火山引擎本轮文本已发完，等待其完成当前会话的音频输出。
  function finishSession() {
    upstream.send(createFrame(event.finishSession, {}, sessionId)); // 发送会话结束事件，不再提交新的文本片段。
    upstreamReady = false; // 避免结束后收到的文本被直接发往已关闭输入的会话。
  }
}

/** 按火山引擎协议构造带事件和会话 ID 的客户端二进制帧。 */
function createFrame(eventId: number, payloadValue: object, sessionId: string) {
  const payload = Buffer.from(JSON.stringify(payloadValue)); // 将请求对象序列化为协议负载字节。
  const session = Buffer.from(sessionId); // 将会话 ID 转成字节，写入协议帧。
  const hasSession = sessionId.length > 0; // 连接级事件没有会话 ID，其余会话事件包含会话 ID。
  // 预先计算并分配帧长度：头部、事件号、可选会话信息、负载长度和负载。
  const frame = Buffer.alloc(4 + 4 + (hasSession ? 4 + session.length : 0) + 4 + payload.length);
  frame.set([0x11, 0x14, 0x10, 0x00]); // 写入协议版本、消息类型、序列化方式和压缩方式标记。
  frame.writeInt32BE(eventId, 4); // 在帧头之后写入 4 字节的大端序事件编号。
  let offset = 8; // 从事件编号之后开始写入可选会话信息。
  if (hasSession) {
    frame.writeUInt32BE(session.length, offset); // 先写会话 ID 的字节长度。
    session.copy(frame, offset + 4); // 再把会话 ID 字节复制到帧中。
    offset += 4 + session.length; // 将游标移到会话信息之后的负载长度字段。
  }
  frame.writeUInt32BE(payload.length, offset); // 写入 JSON 负载的字节长度。
  payload.copy(frame, offset + 4); // 将 JSON 负载写到长度字段之后。
  return frame; // 返回完整的二进制协议帧供 WebSocket 发送。
}

/** 解析火山引擎响应帧，分离事件、音频负载和错误信息。 */
function parseFrame(frame: Buffer) {
  const type = frame[1] >> 4; // 从第二个字节高 4 位读取消息类型。
  const flags = frame[1] & 0x0f; // 从第二个字节低 4 位读取标志位。
  const compression = frame[2] & 0x0f; // 从第三个字节低 4 位读取压缩方式。
  let offset = 4; // 跳过固定协议头，游标指向可变字段的起始位置。
  if (type === 0x0f) {
    const code = frame.readUInt32BE(offset); // 错误帧在负载前包含 4 字节错误码。
    const size = frame.readUInt32BE(offset + 4); // 读取错误负载的字节长度。
    // 错误负载从错误码和长度字段之后开始，并按协议压缩标记解码。
    return { type, code, payload: decode(frame.subarray(offset + 8, offset + 8 + size), compression) };
  }

  const eventId = flags & 0x04 ? frame.readInt32BE(offset) : undefined; // 标志位表示有事件号时读取 4 字节事件编号。
  if (eventId !== undefined) offset += 4; // 有事件号时，游标前进到会话信息长度字段。
  if (eventId !== undefined) offset += 4 + frame.readUInt32BE(offset); // 跳过会话 ID 长度字段及会话 ID 内容。
  const size = frame.readUInt32BE(offset); // 读取当前响应负载的字节长度。
  return {
    type, // 返回协议消息类型，供上层判断消息类别。
    event: eventId, // 返回事件编号，供上层推进会话状态。
    payload: decode(frame.subarray(offset + 4, offset + 4 + size), compression), // 取出并解压实际负载。
  };
}

/** 根据协议头压缩标记还原音频或 JSON 负载。 */
function decode(payload: Buffer, compression: number) {
  return compression === 0x01 ? gunzipSync(payload) : payload; // 压缩标记为 gzip 时解压，否则直接返回原始字节。
}

/** 从错误帧中读取火山引擎返回的可读原因。 */
function readError(frame: { payload: Buffer; code?: number; event?: number }) {
  try {
    const result = JSON.parse(frame.payload.toString()) as { message?: string; status_code?: number }; // 尝试把错误负载按 JSON 读取。
    return result.message ?? `火山引擎 TTS 调用失败（${frame.code ?? result.status_code ?? frame.event}）。`; // 优先展示服务端错误文本，否则展示可用错误编号。
  } catch {
    return `火山引擎 TTS 调用失败（${frame.code ?? frame.event}）。`; // 负载不是 JSON 时仍用错误码或事件号说明失败。
  }
}

/** 用 JSON 错误消息通知浏览器，并保持客户端 WebSocket 协议一致。 */
function sendClientError(client: WebSocket, message: string) {
  if (client.readyState === WebSocket.OPEN) client.send(JSON.stringify({ type: "error", message })); // 仅向仍打开的浏览器连接发送结构化错误。
}
