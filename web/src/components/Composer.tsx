import {
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type FormEvent,
  type PointerEvent,
} from "react";
import { startTencentAsr, type TencentAsrSession } from "../speech/tencentAsr";
import { Icon } from "./Icon";

interface ComposerProps {
  disabled: boolean;
  focusTextInputOnMount?: boolean;
  inputMode: "voice" | "text";
  onInputModeChange: (mode: "voice" | "text") => void;
  onSend: (message: string) => Promise<void>;
  stopSignal: number;
}

export function Composer({
  disabled,
  focusTextInputOnMount = false,
  inputMode,
  onInputModeChange,
  onSend,
  stopSignal,
}: ComposerProps) {
  const [draft, setDraft] = useState("");
  const [isHolding, setIsHolding] = useState(false);
  const [isFinalizing, setIsFinalizing] = useState(false);
  const [inputVolume, setInputVolume] = useState(0);
  const [speechError, setSpeechError] = useState("");
  const textInputRef = useRef<HTMLTextAreaElement>(null);
  const shouldFocusTextInputRef = useRef(false);
  const holdingRef = useRef(false);
  const cancelledRef = useRef(false);
  const pointerStartYRef = useRef(0);
  const pressTimerRef = useRef<number | null>(null);
  const speechSessionRef = useRef<TencentAsrSession | null>(null);
  const recordingControllerRef = useRef<AbortController | null>(null);

  useEffect(
    () => () => {
      clearPressTimer();
      recordingControllerRef.current?.abort();
      speechSessionRef.current?.cancel();
    },
    [],
  );
  useEffect(() => {
    if (stopSignal === 0) return;
    cancelHolding();
    setSpeechError("");
  }, [stopSignal]);
  useEffect(() => {
    if ((!shouldFocusTextInputRef.current && !focusTextInputOnMount) || inputMode !== "text") {
      return;
    }
    shouldFocusTextInputRef.current = false;
    textInputRef.current?.focus();
  }, [focusTextInputOnMount, inputMode]);

  async function sendDraft(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const message = draft.trim();
    if (!message || disabled) return;

    await onSend(message);
    setDraft("");
  }

  function clearPressTimer() {
    if (pressTimerRef.current === null) return;
    window.clearTimeout(pressTimerRef.current);
    pressTimerRef.current = null;
  }

  async function finishRecording(session: TencentAsrSession) {
    if (speechSessionRef.current !== session) return;
    const controller = recordingControllerRef.current;
    setIsFinalizing(true);
    setInputVolume(0);

    try {
      // 只在松手结束录音后提交最终识别结果，不把中间识别文字显示在页面上。
      const question = (await session.stop()).trim();
      speechSessionRef.current = null;
      recordingControllerRef.current = null;
      if (question) {
        await onSend(question);
      }
    } catch (error) {
      if (controller?.signal.aborted) return;
      setSpeechError(error instanceof Error ? error.message : "语音识别失败，请重试。");
    } finally {
      if (speechSessionRef.current === session) speechSessionRef.current = null;
      if (recordingControllerRef.current === controller) recordingControllerRef.current = null;
      setIsFinalizing(false);
    }
  }

  async function startRecording() {
    if (holdingRef.current || isFinalizing || disabled) return;
    holdingRef.current = true;
    cancelledRef.current = false;
    setIsHolding(true);
    setSpeechError("");
    const controller = new AbortController();
    recordingControllerRef.current = controller;

    try {
      const session = await startTencentAsr(setInputVolume, controller.signal);
      speechSessionRef.current = session;
      if (cancelledRef.current || controller.signal.aborted) {
        session.cancel();
        speechSessionRef.current = null;
        return;
      }
      // 权限弹窗期间如果已经松手，连接建立后立即取回最终识别结果。
      if (!holdingRef.current) await finishRecording(session);
    } catch (error) {
      if (controller.signal.aborted) return;
      holdingRef.current = false;
      setIsHolding(false);
      setIsFinalizing(false);
      setInputVolume(0);
      setSpeechError(error instanceof Error ? error.message : "无法启动语音识别。");
      recordingControllerRef.current = null;
    } finally {
      if (controller.signal.aborted) recordingControllerRef.current = null;
    }
  }

  function stopHolding(event: PointerEvent<HTMLButtonElement>) {
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    if (pressTimerRef.current !== null) {
      clearPressTimer();
      return;
    }
    if (!holdingRef.current) return;
    holdingRef.current = false;
    setIsHolding(false);
    setIsFinalizing(true);
    if (speechSessionRef.current) void finishRecording(speechSessionRef.current);
  }

  function cancelHolding() {
    clearPressTimer();
    holdingRef.current = false;
    cancelledRef.current = true;
    setIsHolding(false);
    setIsFinalizing(false);
    setInputVolume(0);
    recordingControllerRef.current?.abort();
    recordingControllerRef.current = null;
    speechSessionRef.current?.cancel();
    speechSessionRef.current = null;
  }

  function toggleInputMode() {
    if (disabled || isFinalizing) return;
    if (holdingRef.current) cancelHolding();
    const nextMode = inputMode === "voice" ? "text" : "voice";
    shouldFocusTextInputRef.current = nextMode === "text";
    onInputModeChange(nextMode);
  }

  return (
    <div className="composer-area">
      {inputMode === "voice" && (
        <p className="hold-hint" aria-live="polite">
          {speechError ||
            (isFinalizing ? "正在识别…" : isHolding ? "松手发送 · 上滑取消" : "按住说话")}
        </p>
      )}

      <div className="composer-row">
        {inputMode === "voice" ? (
          <button
            className="voice-button"
            disabled={disabled || isFinalizing}
            onPointerDown={(event) => {
              event.currentTarget.setPointerCapture(event.pointerId);
              pointerStartYRef.current = event.clientY;
              // 短按不录音；按住一小段时间后才启动语音识别。
              pressTimerRef.current = window.setTimeout(() => {
                pressTimerRef.current = null;
                void startRecording();
              }, 220);
            }}
            onPointerMove={(event) => {
              if (pointerStartYRef.current - event.clientY > 60) {
                if (pressTimerRef.current !== null) clearPressTimer();
                if (holdingRef.current) cancelHolding();
                if (event.currentTarget.hasPointerCapture(event.pointerId)) {
                  event.currentTarget.releasePointerCapture(event.pointerId);
                }
              }
            }}
            onPointerUp={stopHolding}
            onPointerCancel={cancelHolding}
            type="button"
          >
            <span className="sr-only">按住说话</span>
            <span className="waveform" aria-hidden="true">
              {Array.from({ length: 25 }, (_, index) => {
                const shape = 0.28 + Math.abs(Math.sin(index * 0.72)) * 0.72;
                const height = isHolding ? 7 + inputVolume * shape * 34 : 9 + shape * 15;
                return <i key={index} style={{ "--bar-height": `${height}px` } as CSSProperties} />;
              })}
            </span>
          </button>
        ) : (
          <form className="text-composer" onSubmit={sendDraft}>
            <textarea
              aria-label="输入育儿问题"
              disabled={disabled}
              onChange={(event) => setDraft(event.target.value)}
              placeholder="聊聊你遇到的育儿问题…"
              ref={textInputRef}
              rows={1}
              value={draft}
            />
            <button aria-label="发送" disabled={!draft.trim() || disabled} type="submit">
              <Icon name="arrow" />
            </button>
          </form>
        )}
        <button
          aria-label={inputMode === "voice" ? "切换文字输入" : "切换语音输入"}
          className="mode-switch"
          disabled={disabled || isFinalizing}
          onClick={toggleInputMode}
          title={inputMode === "voice" ? "文字输入" : "语音输入"}
          type="button"
        >
          <Icon name={inputMode === "voice" ? "keyboard" : "microphone"} />
        </button>
      </div>
    </div>
  );
}
