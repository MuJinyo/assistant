interface TencentAsrResult {
  /** 腾讯云返回的状态码，0 表示正常。 */
  code: number;
  /** 识别状态说明或错误原因。 */
  message: string;
  /** 返回 1 时表示这次音频流已经识别完成。 */
  final?: number;
  /** 当前返回的句子识别结果。 */
  result?: {
    /** 句子在整段音频里的序号，用于替换正在变化的识别结果。 */
    index: number;
    /** 腾讯云返回的句子文本。 */
    voice_text_str: string;
  };
}

export interface TencentAsrSession {
  /** 停止录音并等待腾讯云返回最终识别文字。 */
  stop: () => Promise<string>;
  /** 直接取消录音和连接，不提交识别结果。 */
  cancel: () => void;
}

/**
 * 连接腾讯云实时识别并开始采集麦克风音频。
 * 识别过程会持续通过 onText 通知调用方，返回的会话对象用于结束或取消识别。
 */
export async function startTencentAsr(onText: (text: string) => void): Promise<TencentAsrSession> {
  // 浏览器必须支持麦克风访问；localhost 和 HTTPS 页面才允许调用该接口。
  if (!navigator.mediaDevices?.getUserMedia) {
    throw new Error("当前浏览器无法访问麦克风，请使用 HTTPS 或 localhost。");
  }

  // 先向自己的服务端获取签名地址，避免把腾讯云 SecretKey 放到浏览器。
  const { url } = await fetchTencentUrl();
  // 浏览器会弹出麦克风授权提示；用户拒绝时这里会抛出浏览器错误。
  const media = await navigator.mediaDevices.getUserMedia({ audio: true });
  const socket = new WebSocket(url);
  // 按句子序号保存结果，收到同一句的新识别内容时会覆盖旧内容。
  const sentenceByIndex = new Map<number, string>();
  // 音频节点在 WebSocket 握手完成后创建，并在停止或出错时释放。
  let audioContext: AudioContext | undefined;
  let processor: ScriptProcessorNode | undefined;
  let source: MediaStreamAudioSourceNode | undefined;
  let mutedOutput: GainNode | undefined;
  // 暂存降采样后的音频，凑够 200ms 后发送一个数据包。
  let pendingSamples: number[] = [];
  // 记录 WebSocket 是否完成腾讯云握手，以及本次录音是否已经结束。
  let isReady = false;
  let isStopped = false;
  let hasFinalResult = false;
  // 保存异步识别过程中的错误，以及 stop() 所等待的完成回调。
  let sessionError: Error | null = null;
  let resolveFinal: ((text: string) => void) | undefined;
  let rejectFinal: ((error: Error) => void) | undefined;
  let rejectHandshake: ((error: Error) => void) | undefined;

  /** 断开音频节点、关闭音频上下文，并停止浏览器麦克风轨道。 */
  function stopMicrophone() {
    processor?.disconnect();
    source?.disconnect();
    mutedOutput?.disconnect();
    // 停止所有媒体轨道会释放系统麦克风占用。
    media.getTracks().forEach((track) => track.stop());
    void audioContext?.close();
  }

  /** 按句子序号排序并拼接识别结果，生成当前完整预览文字。 */
  function currentText() {
    // 腾讯云会重复返回尚未稳定的句子，因此按句子序号替换，再拼成预览文本。
    return [...sentenceByIndex.entries()]
      .sort(([left], [right]) => left - right)
      .map(([, sentence]) => sentence)
      .join("");
  }

  /** 处理腾讯云的握手、识别结果和最终完成消息。 */
  function handleMessage(event: MessageEvent<string>) {
    const message = JSON.parse(event.data) as TencentAsrResult;
    if (message.code !== 0) {
      const error = new Error(message.message || "腾讯云语音识别失败。");
      sessionError = error;
      stopMicrophone();
      rejectHandshake?.(error);
      rejectFinal?.(error);
      return;
    }

    // 成功消息首先确认握手；后续消息会带来实时识别文本或最终完成标记。
    isReady = true;
    if (message.result) {
      sentenceByIndex.set(message.result.index, message.result.voice_text_str);
      // 通知页面刷新“正在识别”的预览内容。
      onText(currentText());
    }

    if (message.final === 1) {
      hasFinalResult = true;
      resolveFinal?.(currentText());
    }
  }

  try {
    // 腾讯云先通过 WebSocket 返回握手结果；握手成功前不能发送音频。
    await new Promise<void>((resolve, reject) => {
      rejectHandshake = reject;
      // 收到成功的握手消息后结束等待，下面才创建并启动音频采集节点。
      socket.onmessage = (event) => {
        handleMessage(event);
        if (isReady) resolve();
      };
      // WebSocket 错误时同时结束握手等待和可能正在等待的识别结果。
      socket.onerror = () => {
        const error = new Error("无法连接腾讯云语音识别，请检查网络和云服务配置。");
        sessionError = error;
        reject(error);
        rejectFinal?.(error);
      };
      // 如果腾讯云在最终结果到达前断开连接，提示本次识别失败。
      socket.onclose = () => {
        if (!isReady || !hasFinalResult) {
          const error = new Error("腾讯云语音识别连接已关闭。");
          sessionError = error;
          reject(error);
          rejectFinal?.(error);
        }
      };
    });

    audioContext = new AudioContext();
    source = audioContext.createMediaStreamSource(media);
    processor = audioContext.createScriptProcessor(4096, 1, 1);
    mutedOutput = audioContext.createGain();
    // 音频处理节点需要连接到输出才能触发回调；将音量设为 0 可避免麦克风回放。
    mutedOutput.gain.value = 0;

    // 浏览器每次提供一段麦克风音频，在这里转换采样率和格式并按包发送。
    processor.onaudioprocess = (event) => {
      if (isStopped || socket.readyState !== WebSocket.OPEN) return;

      const input = event.inputBuffer.getChannelData(0);
      // 把浏览器当前采样率降到腾讯云需要的 16kHz，再转换成有符号 16 位整数。
      const ratio = audioContext!.sampleRate / 16000;
      for (let index = 0; index < input.length; index += ratio) {
        const sample = input[Math.floor(index)];
        pendingSamples.push(Math.max(-1, Math.min(1, sample)) * (sample < 0 ? 32768 : 32767));
      }

      // 每包发送 200ms 的 PCM，也就是 3200 个 16 位采样点。
      while (pendingSamples.length >= 3200) {
        const samples = pendingSamples.splice(0, 3200);
        socket.send(new Int16Array(samples).buffer);
      }
    };

    source.connect(processor);
    processor.connect(mutedOutput);
    mutedOutput.connect(audioContext.destination);
  } catch (error) {
    stopMicrophone();
    socket.close();
    throw error;
  }

  /** 取消本次识别，释放麦克风并关闭 WebSocket，不提交识别文字。 */
  function cancel() {
    if (isStopped) return;
    isStopped = true;
    stopMicrophone();
    socket.close();
  }

  return {
    cancel,
    /** 结束音频流，通知腾讯云收尾，并返回最终识别出的文字。 */
    stop: async () => {
      if (isStopped) return currentText();
      isStopped = true;
      stopMicrophone();

      // 把不足 200ms 的最后一包也发出，再通知腾讯云结束识别。
      if (pendingSamples.length && socket.readyState === WebSocket.OPEN) {
        socket.send(new Int16Array(pendingSamples).buffer);
        pendingSamples = [];
      }
      if (sessionError) throw sessionError;
      // 在发送结束消息前注册回调，等待腾讯云发来 final=1 的完成消息。
      const finalText = new Promise<string>((resolve, reject) => {
        resolveFinal = resolve;
        rejectFinal = reject;
      });
      // 这是腾讯云实时识别协议规定的音频结束通知。
      socket.send(JSON.stringify({ type: "end" }));
      return finalText;
    },
  };
}

/** 从项目服务端获取腾讯云签名后的 WebSocket 地址。 */
async function fetchTencentUrl() {
  const response = await fetch("/api/speech/tencent-url");
  const result = (await response.json()) as { url?: string; error?: string };
  if (!response.ok || !result.url) throw new Error(result.error ?? "无法获取语音识别连接地址。");
  return { url: result.url };
}
