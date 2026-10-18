import { useState } from "react";
import { AssistantMessage } from "./AssistantMessage";
import { Composer } from "./Composer";
import { Icon } from "./Icon";

interface ChatPageProps {
  assistantMessageId: string;
  initialQuestion: string;
  onBack: () => void;
  onSend: (question: string) => Promise<string>;
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
  const [messageId, setMessageId] = useState(assistantMessageId);

  async function sendMessage(nextQuestion: string) {
    setQuestion(nextQuestion);
    setMessageId(await onSend(nextQuestion));
  }

  return (
    <>
      <button className="back-button" onClick={onBack} type="button">
        <Icon name="chevron" /> 返回
      </button>

      <section className="conversation" aria-label="对话内容">
        {question && <p className="user-question">{question}</p>}
        <AssistantMessage key={messageId} messageId={messageId} reply={reply} />
      </section>

      <Composer onSend={sendMessage} />
      <p className="disclaimer">内容由 AI 生成，仅供参考</p>
    </>
  );
}
