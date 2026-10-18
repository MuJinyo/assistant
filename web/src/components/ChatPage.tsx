import { useState } from "react";
import { AssistantMessage } from "./AssistantMessage";
import { Composer } from "./Composer";
import { Icon } from "./Icon";

const sampleReply = "告诉我你想了解什么，我会结合实际情况，一步一步为你解答。";

interface ChatPageProps {
  initialQuestion: string;
  onBack: () => void;
}

export function ChatPage({ initialQuestion, onBack }: ChatPageProps) {
  const [question, setQuestion] = useState(initialQuestion);

  return (
    <>
      <button className="back-button" onClick={onBack} type="button">
        <Icon name="chevron" /> 返回
      </button>

      <section className="conversation" aria-label="对话内容">
        {question && <p className="user-question">{question}</p>}
        <AssistantMessage reply={sampleReply} />
      </section>

      <Composer onSend={setQuestion} />
      <p className="disclaimer">内容由 AI 生成，仅供参考</p>
    </>
  );
}
