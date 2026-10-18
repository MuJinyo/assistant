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
    // 使用浏览器剪贴板 API 复制完整回复，并短暂显示操作结果。
    await navigator.clipboard.writeText(reply);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1400);
  }

  async function rateReply(value: "up" | "down") {
    // 再次点击当前评价时删除数据库里的反馈，作为取消操作。
    if (rating === value) {
      await removeFeedback(messageId);
      setRating(null);
      return;
    }

    // 点踩需要原因；取消输入或只输入空格时不提交反馈。
    const reason = value === "down" ? window.prompt("请告诉我们不满意的原因") : "";
    if (value === "down" && (!reason || !reason.trim())) return;

    // 服务端保存成功后再更新按钮状态，确保页面状态与数据库一致。
    await saveFeedback(messageId, value, reason?.trim() ?? "");
    setRating(value);
  }

  return (
    <article className="assistant-card">
      <p>{reply}</p>
      {/* 消息还没完整写入数据库时没有 messageId，因此先不显示需要保存的操作。 */}
      {messageId && (
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
      )}
    </article>
  );
}
