import { useState } from "react";
import { AssistantMessage } from "./AssistantMessage";
import { Composer } from "./Composer";
import { Icon } from "./Icon";

interface ChatPageProps {
  assistantMessageId: string;
  initialQuestion: string;
  onBack: () => void;
  onSend: (question: string) => Promise<void>;
  reply: string;
}

export function ChatPage({
  assistantMessageId,
  initialQuestion,
  onBack,
  onSend,
  reply,
}: ChatPageProps) {
  const [question, setQuestion] = useState(initialQuestion);
  const [errorMessage, setErrorMessage] = useState("");

  async function sendMessage(nextQuestion: string) {
    setQuestion(nextQuestion);
    setErrorMessage("");
    try {
      await onSend(nextQuestion);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "暂时无法发送问题。");
    }
  }

  return (
    <>
      <button className="back-button" onClick={onBack} type="button">
        <Icon name="chevron" /> 返回
      </button>

      <section className="conversation" aria-label="对话内容">
        {question && <p className="user-question">{question}</p>}
        {/* 流式期间先展示文本；服务端发来完成事件后才会显示复制和反馈按钮。 */}
        {reply && (
          <AssistantMessage
            key={assistantMessageId || "streaming"}
            messageId={assistantMessageId}
            reply={reply}
          />
        )}
      </section>

      <Composer onSend={sendMessage} />
      {errorMessage && (
        <p className="request-error" role="alert">
          {errorMessage}
        </p>
      )}
      <p className="disclaimer">内容由 AI 生成，仅供参考</p>
    </>
  );
}
