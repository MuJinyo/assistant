import { useState } from "react";
import { removeFeedback, saveFeedback } from "../api";
import { Icon } from "./Icon";

interface AssistantMessageProps {
  messageId: string;
  reply: string;
}

export function AssistantMessage({ messageId, reply }: AssistantMessageProps) {
  const [copied, setCopied] = useState(false);
  const [rating, setRating] = useState<"up" | "down" | null>(null);

  async function copyReply() {
    await navigator.clipboard.writeText(reply);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1400);
  }

  async function rateReply(value: "up" | "down") {
    if (rating === value) {
      await removeFeedback(messageId);
      setRating(null);
      return;
    }

    const reason = value === "down" ? window.prompt("请告诉我们不满意的原因") : "";
    if (value === "down" && (!reason || !reason.trim())) return;

    await saveFeedback(messageId, value, reason?.trim() ?? "");
    setRating(value);
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
          onClick={() => rateReply("up")}
          type="button"
        >
          <Icon name="thumb" />
        </button>
        <button
          aria-label="不赞同回复"
          aria-pressed={rating === "down"}
          className={rating === "down" ? "selected" : ""}
          onClick={() => rateReply("down")}
          type="button"
        >
          <Icon name="thumb" down />
        </button>
      </div>
    </article>
  );
}
