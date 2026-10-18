import { useState } from "react";
import { removeFeedback, saveFeedback } from "../api";
import { useAssistantSpeech } from "../speech/useAssistantSpeech";
import { Icon } from "./Icon";

interface AssistantMessageProps {
  messageId: string;
  reply: string;
  isStreaming: boolean;
  stopSignal: number;
}

export function AssistantMessage({
  messageId,
  reply,
  isStreaming,
  stopSignal,
}: AssistantMessageProps) {
  const [copied, setCopied] = useState(false);
  const [rating, setRating] = useState<"up" | "down" | null>(null);
  const speech = useAssistantSpeech(reply, isStreaming, stopSignal);

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

  const speechLabel = isStreaming
    ? speech.autoEnabled
      ? "关闭自动语音播报"
      : "开启自动语音播报"
    : speech.status === "idle"
      ? "重播语音"
      : "停止语音播报";

  return (
    <article className="assistant-card">
      <p className={reply ? undefined : "thinking-indicator"}>{reply || "正在思考…"}</p>
      {reply && (
        <div className="message-actions">
          <button
            aria-label={speechLabel}
            aria-pressed={isStreaming ? speech.autoEnabled : speech.status === "playing"}
            className={
              (isStreaming && speech.autoEnabled) || speech.status === "playing" ? "selected" : ""
            }
            onClick={speech.toggle}
            title={speechLabel}
            type="button"
          >
            <Icon name="volume" />
          </button>
          {/* 复制和反馈需要消息写入数据库后返回 messageId。 */}
          {messageId && (
            <>
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
            </>
          )}
        </div>
      )}
      {speech.error && (
        <p className="speech-error" role="alert">
          {speech.error}
        </p>
      )}
    </article>
  );
}
