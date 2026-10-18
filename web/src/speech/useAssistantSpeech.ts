import { useEffect, useRef, useState } from "react"; // 使用 effect 同步回复变化，并用 ref 保存异步事件需要的最新值。

// 描述语音播报当前所处的界面状态。
type SpeechStatus = "idle" | "loading" | "playing";

/** 通过项目 WebSocket 发送回复文字，并用 MediaSource 播放返回的 MP3 音频流。 */
export function useAssistantSpeech(reply: string, isStreaming: boolean) {
  const [status, setStatus] = useState<SpeechStatus>("idle"); // 记录当前状态，供界面显示语音按钮状态。
  const [autoEnabled, setAutoEnabled] = useState(true); // 记录是否允许回答生成时自动播报。
  const [error, setError] = useState(""); // 保存 WebSocket 或音频播放错误供界面展示。
  const socketRef = useRef<WebSocket | null>(null); // 保存当前语音服务 WebSocket 实例。
  const audioRef = useRef<HTMLAudioElement | null>(null); // 保存负责播放流式音频的 Audio 元素。
  const sourceBufferRef = useRef<SourceBuffer | null>(null); // 保存 MediaSource 的音频缓冲区。
  const mediaSourceRef = useRef<MediaSource | null>(null); // 保存本轮播放所用的 MediaSource。
  const audioUrlRef = useRef(""); // 保存临时音频地址，停止时用于释放它。
  const audioQueueRef = useRef<ArrayBuffer[]>([]); // 缓存尚未追加到 SourceBuffer 的音频片段。
  const outgoingQueueRef = useRef<string[]>([]); // 缓存 WebSocket 建立前要发送的消息。
  const previousLengthRef = useRef(0); // 记录上次观察到的回复长度，用来截取新生成文字。
  const sentLengthRef = useRef(0); // 记录已发送给语音服务的回复长度，避免恢复播报时重复发送。
  const autoEnabledRef = useRef(true); // 在异步回调中同步读取自动播报开关的最新值。
  const isStreamingRef = useRef(isStreaming); // 在点击回调中读取回复是否仍在生成。
  const isFinishedRef = useRef(false); // 标记服务端是否已经发完本轮音频。
  isStreamingRef.current = isStreaming; // 每次渲染都更新 ref，避免回调读到旧的生成状态。

  useEffect(() => {
    const newText = reply.slice(previousLengthRef.current); // 只取本次新增的回复文字，逐段交给 TTS。
    previousLengthRef.current = reply.length; // 更新已观察的回复长度，供下一次 effect 使用。

    if (newText && autoEnabledRef.current) {
      openSocket(); // 确保自动播报有可用的服务连接。
      send({ type: "text", text: newText }); // 将刚生成的文字片段发送给 TTS。
      sentLengthRef.current = reply.length; // 记录目前已经提交到 TTS 的文本位置。
    }

    if (!isStreaming && sentLengthRef.current > 0 && autoEnabledRef.current) {
      openSocket(); // 确保结束事件可以发送到当前语音连接。
      send({ type: "finish" }); // 回复生成完成后通知 TTS 不会再有新文本。
    }
  }, [reply, isStreaming]);

  // 组件卸载时关闭连接并清理音频资源。
  useEffect(() => () => stop(), []);

  // 创建浏览器到项目服务端的 WebSocket，发送文字并接收音频帧。
  function openSocket() {
    if (socketRef.current) return; // 已有连接时直接复用，避免重复创建 WebSocket。
    setError(""); // 新一轮播报开始时清除上次错误。
    setStatus("loading"); // 将按钮状态切换为正在连接或准备音频。
    isFinishedRef.current = false; // 重置上一轮的结束标记。

    if (!MediaSource.isTypeSupported("audio/mpeg")) {
      setError("当前浏览器不支持流式 MP3 播放。"); // 浏览器不支持 MP3 MediaSource 时提示用户。
      setStatus("idle"); // 播放无法开始，恢复按钮的空闲状态。
      return; // 不创建无法使用的音频资源和 WebSocket。
    }

    const mediaSource = new MediaSource(); // 创建可持续追加音频数据的媒体源。
    const audioUrl = URL.createObjectURL(mediaSource); // 为媒体源创建 Audio 元素可读取的临时地址。
    const audio = new Audio(audioUrl); // 创建用于播放流式 MP3 的音频元素。
    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:"; // 页面使用 HTTPS 时也通过安全 WebSocket 连接。
    const socket = new WebSocket(`${protocol}//${window.location.host}/api/speech/stream`); // 连接项目服务端的实时语音代理接口。
    socket.binaryType = "arraybuffer"; // 让音频二进制帧以 ArrayBuffer 形式交给前端处理。
    socketRef.current = socket; // 保存连接，供其他方法发送数据和关闭连接。
    audioRef.current = audio; // 保存播放器，供音频到达时启动或停止。
    mediaSourceRef.current = mediaSource; // 保存媒体源，供后续追加数据和结束流。
    audioUrlRef.current = audioUrl; // 保存临时地址，停止播放时释放。

    // MediaSource 打开后才能创建 SourceBuffer 并开始追加音频。
    mediaSource.addEventListener("sourceopen", () => {
      if (socketRef.current !== socket || mediaSource.readyState !== "open") return; // 忽略过期连接或已经关闭的媒体源事件。
      const sourceBuffer = mediaSource.addSourceBuffer("audio/mpeg"); // 创建 MP3 数据缓冲区。
      sourceBuffer.mode = "sequence"; // 按追加顺序连续播放各个音频片段。
      sourceBufferRef.current = sourceBuffer; // 保存缓冲区，供音频队列处理方法使用。
      sourceBuffer.addEventListener("updateend", appendNextAudio); // 每次追加结束后继续处理下一段排队音频。
      appendNextAudio(); // 处理可能已在媒体源打开前到达的音频片段。
    });

    // WebSocket 建立成功后，发送连接阶段暂存的消息。
    socket.onopen = () => {
      for (const message of outgoingQueueRef.current.splice(0)) socket.send(message); // 按顺序清空发送队列并写入当前连接。
    };
    // 根据二进制音频帧或 JSON 状态消息执行不同处理。
    socket.onmessage = (message) => {
      if (message.data instanceof ArrayBuffer) {
        audioQueueRef.current.push(message.data); // 将新到达的音频片段排入播放队列。
        appendNextAudio(); // 如果缓冲区当前空闲，立即追加这段音频。
        setStatus("playing"); // 更新界面状态，表示已经开始收到并处理音频。
        void audio.play().catch(() => setError("浏览器拦截了自动播放，请点击语音图标开始。")); // 尝试自动播放，失败时提示用户手动开始。
        return; // 二进制帧处理完毕，不再按 JSON 状态消息解析。
      }

      const event = JSON.parse(String(message.data)) as { type: string; message?: string }; // 将状态帧转换为服务器约定的 JSON 事件。
      if (event.type === "error") {
        setError(event.message ?? "语音合成失败。"); // 展示服务端返回的错误信息，或使用通用提示。
        stop(); // 出错后关闭连接并释放本轮音频资源。
      }
      if (event.type === "done") {
        isFinishedRef.current = true; // 标记服务端已经发送完本轮音频。
        appendNextAudio(); // 若队列已空，结束 MediaSource 的输入流。
      }
    };
    socket.onerror = () => setError("语音 WebSocket 连接失败。"); // WebSocket 发生连接错误时向界面提供提示。
    socket.onclose = () => {
      if (socketRef.current === socket) socketRef.current = null; // 只清除当前连接的引用，避免旧连接覆盖新连接。
    };
    audio.onended = () => {
      if (isFinishedRef.current) stop(); // 全部音频播放完毕后清理本轮资源。
      else setStatus("idle"); // 服务端尚未结束时暂时恢复空闲提示，等待后续音频。
    };
    audio.onerror = () => setError("音频播放失败，请重试。"); // 音频元素无法播放时提示用户。
  }

  // 将服务端收到的文字或结束事件写入 WebSocket，连接建立前先排队。
  function send(message: { type: "text"; text: string } | { type: "finish" }) {
    const serialized = JSON.stringify(message); // 将文本片段或结束信号编码成 JSON 字符串。
    const socket = socketRef.current; // 读取当前 WebSocket 实例。
    if (socket?.readyState === WebSocket.OPEN) socket.send(serialized); // 连接已打开时立即发送。
    else outgoingQueueRef.current.push(serialized); // 连接尚未打开时先缓存，待 open 事件到达后发送。
  }

  // SourceBuffer 一次只能追加一段数据，因此按收到顺序逐段追加。
  function appendNextAudio() {
    const sourceBuffer = sourceBufferRef.current; // 读取当前媒体缓冲区。
    const mediaSource = mediaSourceRef.current; // 读取当前媒体源。
    if (!sourceBuffer || sourceBuffer.updating || !mediaSource) return; // 缓冲区不存在、正在更新或媒体源不存在时暂不追加。

    const audioChunk = audioQueueRef.current.shift(); // 取出最早到达且尚未处理的音频片段。
    if (audioChunk) {
      sourceBuffer.appendBuffer(audioChunk); // 将片段追加到媒体缓冲区，完成后由 updateend 触发下一次处理。
    } else if (isFinishedRef.current && mediaSource.readyState === "open") {
      mediaSource.endOfStream(); // 队列已空且服务器已结束时，通知浏览器音频流输入结束。
    }
  }

  // 关闭前后端 WebSocket，并释放音频和 MediaSource 地址。
  function stop() {
    const socket = socketRef.current; // 暂存当前连接，后续清理引用后仍可调用 close。
    socketRef.current = null; // 先清空引用，避免关闭回调误认为仍是活动连接。
    socket?.close(); // 连接存在时关闭浏览器到服务端的 WebSocket。
    audioRef.current?.pause(); // 停止当前音频播放。
    audioRef.current = null; // 释放音频元素引用。
    sourceBufferRef.current = null; // 释放音频缓冲区引用。
    mediaSourceRef.current = null; // 释放媒体源引用。
    audioQueueRef.current = []; // 清空尚未追加的音频数据。
    outgoingQueueRef.current = []; // 清空尚未发送的文本和结束消息。
    isFinishedRef.current = false; // 重置本轮完成标记，为下一轮播报做准备。
    if (audioUrlRef.current) URL.revokeObjectURL(audioUrlRef.current); // 释放为 MediaSource 创建的临时 URL。
    audioUrlRef.current = ""; // 清空已释放的临时 URL。
    setStatus("idle"); // 将界面按钮恢复为空闲状态。
  }

  // 流式时切换自动播报；回答结束后点击可重播或停止。
  function toggle() {
    if (isStreamingRef.current) {
      const nextEnabled = !autoEnabledRef.current; // 反转自动播报开关。
      autoEnabledRef.current = nextEnabled; // 同步更新 ref，供异步回调立即读取。
      setAutoEnabled(nextEnabled); // 更新界面状态。
      if (nextEnabled) {
        const newText = reply.slice(sentLengthRef.current); // 计算暂停期间尚未发送到语音服务的文字。
        if (newText) {
          openSocket(); // 用户重新开启播报时重新创建语音连接。
          send({ type: "text", text: newText }); // 只补发此前未播报的文字。
          sentLengthRef.current = reply.length; // 更新已发送位置，避免后续重复发送这段文字。
        }
      } else {
        stop(); // 用户关闭自动播报时停止播放并清理连接。
      }
      return; // 流式回答阶段只切换自动播报，不走回答结束后的重播逻辑。
    }

    if (status !== "idle") {
      autoEnabledRef.current = false; // 停止当前播报，并禁止后续生成文字自动开启播报。
      setAutoEnabled(false); // 同步更新界面中的播报开关状态。
      stop(); // 关闭当前连接并停止音频。
      return; // 本次点击已经执行停止操作，不继续重播。
    }

    autoEnabledRef.current = true; // 用户主动重播时重新启用播报。
    setAutoEnabled(true); // 同步更新界面开关状态。
    previousLengthRef.current = reply.length; // 从当前完整回复末尾开始观察后续变化，避免重复处理。
    sentLengthRef.current = reply.length; // 标记现有回复将作为整段重播。
    openSocket(); // 创建新的语音 WebSocket 和播放资源。
    send({ type: "text", text: reply }); // 将整段已完成的回复提交给 TTS。
    send({ type: "finish" }); // 随后通知服务端文本输入已经结束。
  }

  return { status, autoEnabled, error, toggle }; // 暴露播放状态、开关、错误和点击处理函数给组件。
}
