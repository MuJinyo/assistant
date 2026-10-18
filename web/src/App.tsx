import { useState } from "react";
import { askQuestion, createConversation } from "./api";
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

      if (question) {
        const response = await askQuestion(conversation.id, question);
        setAssistantMessageId(response.messageId);
        setReply(response.answer);
      } else {
        setAssistantMessageId("");
        setReply("");
      }

      setPage("chat");
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "暂时无法开始对话。");
    }
  }

  async function sendMessage(question: string) {
    const response = await askQuestion(conversationId, question);
    setAssistantMessageId(response.messageId);
    setReply(response.answer);
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
