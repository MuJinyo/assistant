import { useState, type FormEvent, type PointerEvent } from "react";
import { Icon } from "./Icon";

interface ComposerProps {
  onSend: (message: string) => void;
}

export function Composer({ onSend }: ComposerProps) {
  const [inputMode, setInputMode] = useState<"voice" | "text">("voice");
  const [draft, setDraft] = useState("");
  const [isHolding, setIsHolding] = useState(false);

  function sendDraft(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!draft.trim()) return;

    onSend(draft.trim());
    setDraft("");
  }

  function stopHolding(event: PointerEvent<HTMLButtonElement>) {
    event.currentTarget.releasePointerCapture(event.pointerId);
    setIsHolding(false);
  }

  return (
    <div className="composer-area">
      <p className="hold-hint">{isHolding ? "松手发送，上移取消" : "按住说话，松开结束"}</p>

      {inputMode === "voice" ? (
        <button
          className={`voice-button${isHolding ? " is-holding" : ""}`}
          onPointerDown={(event) => {
            event.currentTarget.setPointerCapture(event.pointerId);
            setIsHolding(true);
          }}
          onPointerUp={stopHolding}
          onPointerCancel={() => setIsHolding(false)}
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
          setInputMode(inputMode === "voice" ? "text" : "voice");
        }}
        type="button"
      >
        {inputMode === "voice" ? "文字输入" : "语音输入"}
      </button>
    </div>
  );
}
