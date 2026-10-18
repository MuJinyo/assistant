import { useState } from "react";
import { createConversation, streamQuestion } from "./api";
import { ChatPage } from "./components/ChatPage";
import { WelcomePage } from "./components/WelcomePage";

export function App() {
  const [page, setPage] = useState<"welcome" | "chat">("welcome");
  const [initialQuestion, setInitialQuestion] = useState("");
  const [conversationId, setConversationId] = useState("");
  const [assistantMessageId, setAssistantMessageId] = useState("");
  const [errorMessage, setErrorMessage] = useState("");
  const [reply, setReply] = useState("");

  async function startChat(question = "") {
    setErrorMessage("");
    try {
      const conversation = await createConversation();
      setConversationId(conversation.id);
      setInitialQuestion(question);
      setAssistantMessageId("");
      setReply("");
      // 先切到聊天页，让后续到达的每段文本都能立即渲染出来。
      setPage("chat");

      if (question) {
        const response = await streamQuestion(conversation.id, question, setReply);
        setAssistantMessageId(response.messageId);
      }
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "暂时无法开始对话。");
    }
  }

  async function sendMessage(question: string) {
    // 新一轮回复开始前清空上一条，避免把两轮回答拼在一起。
    setAssistantMessageId("");
    setReply("");
    const response = await streamQuestion(conversationId, question, setReply);
    setAssistantMessageId(response.messageId);
  }

  function goBack() {
    setPage("welcome");
    setInitialQuestion("");
  }

  return (
    <main className="assistant-screen">
      <div className="portrait-background" aria-hidden="true" />
      <div className="background-fade" aria-hidden="true" />
      {errorMessage && (
        <p className="request-error" role="alert">
          {errorMessage}
        </p>
      )}

      {page === "welcome" ? (
        <WelcomePage onStartChat={startChat} />
      ) : (
        <ChatPage
          assistantMessageId={assistantMessageId}
          initialQuestion={initialQuestion}
          onBack={goBack}
          onSend={sendMessage}
          reply={reply}
        />
      )}
    </main>
  );
}
