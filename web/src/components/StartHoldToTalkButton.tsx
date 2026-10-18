import { useEffect, useRef, useState, type CSSProperties, type PointerEvent } from "react";
import { startTencentAsr, type TencentAsrSession } from "../speech/tencentAsr";
import { Icon } from "./Icon";

interface StartHoldToTalkButtonProps {
  disabled: boolean;
  onError: (message: string) => void;
  onSend: (message: string) => Promise<void>;
  onSwitchToText: () => void;
  stopSignal: number;
}

export function StartHoldToTalkButton({
  disabled,
  onError,
  onSend,
  onSwitchToText,
  stopSignal,
}: StartHoldToTalkButtonProps) {
  const [isHolding, setIsHolding] = useState(false);
  const [isFinalizing, setIsFinalizing] = useState(false);
  const [inputVolume, setInputVolume] = useState(0);
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
    cancelRecording();
  }, [stopSignal]);

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
      // 松手后只提交最终识别结果，识别期间不展示中间文字。
      const question = (await session.stop()).trim();
      speechSessionRef.current = null;
      recordingControllerRef.current = null;
      if (question) await onSend(question);
    } catch (error) {
      if (!controller?.signal.aborted) {
        onError(error instanceof Error ? error.message : "语音识别失败，请重试。");
      }
    } finally {
      if (speechSessionRef.current === session) speechSessionRef.current = null;
      if (recordingControllerRef.current === controller) recordingControllerRef.current = null;
      setIsFinalizing(false);
    }
  }

  async function startRecording() {
    if (holdingRef.current || disabled || isFinalizing) return;
    holdingRef.current = true;
    cancelledRef.current = false;
    setIsHolding(true);
    onError("");
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
      // 麦克风权限弹窗期间已经松手时，连接成功后马上结束录音。
      if (!holdingRef.current) await finishRecording(session);
    } catch (error) {
      if (controller.signal.aborted) return;
      holdingRef.current = false;
      setIsHolding(false);
      setIsFinalizing(false);
      setInputVolume(0);
      onError(error instanceof Error ? error.message : "无法启动语音识别。");
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

  function cancelRecording() {
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

  return (
    <div className="composer-row start-hold-row">
      <button
        aria-label={isHolding ? "正在录音，松开后发送" : "按住说话"}
        className="start-button"
        disabled={disabled || isFinalizing}
        onPointerDown={(event) => {
          if (!event.isPrimary || event.button !== 0) return;
          event.currentTarget.setPointerCapture(event.pointerId);
          pointerStartYRef.current = event.clientY;
          // 短按当作点击忽略；长按达到 220 毫秒后才开始录音并显示波形。
          pressTimerRef.current = window.setTimeout(() => {
            pressTimerRef.current = null;
            void startRecording();
          }, 220);
        }}
        onPointerMove={(event) => {
          if (pointerStartYRef.current - event.clientY > 60) {
            if (pressTimerRef.current !== null) clearPressTimer();
            if (holdingRef.current) cancelRecording();
            if (event.currentTarget.hasPointerCapture(event.pointerId)) {
              event.currentTarget.releasePointerCapture(event.pointerId);
            }
          }
        }}
        onPointerUp={stopHolding}
        onPointerCancel={cancelRecording}
        type="button"
      >
        {isFinalizing ? (
          "正在识别…"
        ) : isHolding ? (
          <span className="waveform" aria-hidden="true">
            {Array.from({ length: 25 }, (_, index) => {
              const shape = 0.28 + Math.abs(Math.sin(index * 0.72)) * 0.72;
              const height = 7 + inputVolume * shape * 34;
              return <i key={index} style={{ "--bar-height": `${height}px` } as CSSProperties} />;
            })}
          </span>
        ) : (
          "按住说话"
        )}
      </button>
      <button
        aria-label="切换文字输入"
        className="mode-switch"
        disabled={disabled || isFinalizing || isHolding}
        onClick={onSwitchToText}
        title="文字输入"
        type="button"
      >
        <Icon name="keyboard" />
      </button>
    </div>
  );
}
