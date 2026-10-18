import { useState } from "react";
import { Icon } from "./Icon";

interface AssistantMessageProps {
  reply: string;
}

export function AssistantMessage({ reply }: AssistantMessageProps) {
  const [copied, setCopied] = useState(false);
  const [rating, setRating] = useState<"up" | "down" | null>(null);

  async function copyReply() {
    await navigator.clipboard.writeText(reply);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1400);
  }

  return (
    <article className="assistant-card">
      <p>{reply}</p>
      <div className="message-actions">
        <button aria-label="复制回复" onClick={copyReply} type="button">
          <Icon name="copy" />
          <span className="action-feedback">{copied ? "已复制" : ""}</span>
        </button>
        <button
          aria-label="赞同回复"
          aria-pressed={rating === "up"}
          className={rating === "up" ? "selected" : ""}
          onClick={() => setRating(rating === "up" ? null : "up")}
          type="button"
        >
          <Icon name="thumb" />
        </button>
        <button
          aria-label="不赞同回复"
          aria-pressed={rating === "down"}
          className={rating === "down" ? "selected" : ""}
          onClick={() => setRating(rating === "down" ? null : "down")}
          type="button"
        >
          <Icon name="thumb" down />
        </button>
      </div>
    </article>
  );
}
