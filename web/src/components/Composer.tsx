import { useEffect, useRef, useState, type FormEvent, type PointerEvent } from "react";
import { startTencentAsr, type TencentAsrSession } from "../speech/tencentAsr";
import { Icon } from "./Icon";

interface ComposerProps {
  onSend: (message: string) => Promise<void>;
}

export function Composer({ onSend }: ComposerProps) {
  const [inputMode, setInputMode] = useState<"voice" | "text">("voice");
  const [draft, setDraft] = useState("");
  const [isHolding, setIsHolding] = useState(false);
  const [speechText, setSpeechText] = useState("");
  const [speechError, setSpeechError] = useState("");
  const holdingRef = useRef(false);
  const cancelledRef = useRef(false);
  const pointerStartYRef = useRef(0);
  const speechSessionRef = useRef<TencentAsrSession | null>(null);

  useEffect(() => () => speechSessionRef.current?.cancel(), []);

  async function sendDraft(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!draft.trim()) return;

    await onSend(draft.trim());
    setDraft("");
  }

  async function finishRecording(session: TencentAsrSession) {
    if (speechSessionRef.current !== session) return;
    speechSessionRef.current = null;

    try {
      const question = (await session.stop()).trim();
      setSpeechText("");
      if (question) await onSend(question);
    } catch (error) {
      setSpeechError(error instanceof Error ? error.message : "语音识别失败，请重试。");
    }
  }

  async function startRecording() {
    if (holdingRef.current) return;
    holdingRef.current = true;
    cancelledRef.current = false;
    setIsHolding(true);
    setSpeechError("");
    setSpeechText("");

    try {
      const session = await startTencentAsr(setSpeechText);
      speechSessionRef.current = session;
      if (cancelledRef.current) {
        session.cancel();
        speechSessionRef.current = null;
        return;
      }
      // 如果用户在麦克风权限弹窗期间已经松手，连接成功后马上结束录音。
      if (!holdingRef.current) await finishRecording(session);
    } catch (error) {
      holdingRef.current = false;
      setIsHolding(false);
      setSpeechError(error instanceof Error ? error.message : "无法启动语音识别。");
    }
  }

  function stopHolding(event: PointerEvent<HTMLButtonElement>) {
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    holdingRef.current = false;
    setIsHolding(false);
    if (speechSessionRef.current) void finishRecording(speechSessionRef.current);
  }

  function cancelHolding() {
    holdingRef.current = false;
    cancelledRef.current = true;
    setIsHolding(false);
    speechSessionRef.current?.cancel();
    speechSessionRef.current = null;
    setSpeechText("");
  }

  return (
    <div className="composer-area">
      <p className="hold-hint" aria-live="polite">
        {speechError ||
          (speechText
            ? `正在识别：${speechText}`
            : isHolding
              ? "松手发送，上移取消"
              : "按住说话，松开结束")}
      </p>

      {inputMode === "voice" ? (
        <button
          className={`voice-button${isHolding ? " is-holding" : ""}`}
          onPointerDown={(event) => {
            event.currentTarget.setPointerCapture(event.pointerId);
            pointerStartYRef.current = event.clientY;
            void startRecording();
          }}
          onPointerMove={(event) => {
            if (holdingRef.current && pointerStartYRef.current - event.clientY > 60) {
              cancelHolding();
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
            {Array.from({ length: 25 }, (_, index) => (
              <i
                key={index}
                style={
                  {
                    "--bar": index,
                    "--bar-height": `${12 + ((index * 7) % 22)}px`,
                  } as React.CSSProperties
                }
              />
            ))}
          </span>
        </button>
      ) : (
        <form className="text-composer" onSubmit={sendDraft}>
          <textarea
            aria-label="输入问题"
            onChange={(event) => setDraft(event.target.value)}
            placeholder="输入你想了解的问题…"
            rows={1}
            value={draft}
          />
          <button aria-label="发送" disabled={!draft.trim()} type="submit">
            <Icon name="arrow" />
          </button>
        </form>
      )}

      <button
        className="mode-switch"
        onClick={() => {
          setIsHolding(false);
          holdingRef.current = false;
          cancelledRef.current = true;
          speechSessionRef.current?.cancel();
          speechSessionRef.current = null;
          setInputMode(inputMode === "voice" ? "text" : "voice");
        }}
        type="button"
      >
        {inputMode === "voice" ? "文字输入" : "语音输入"}
      </button>
    </div>
  );
}
