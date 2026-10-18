import { useState } from "react";
import { addMessage, createConversation } from "./api";
import { ChatPage } from "./components/ChatPage";
import { WelcomePage } from "./components/WelcomePage";

const sampleReply = "告诉我你想了解什么，我会结合实际情况，一步一步为你解答。";

export function App() {
  const [page, setPage] = useState<"welcome" | "chat">("welcome");
  const [initialQuestion, setInitialQuestion] = useState("");
  const [conversationId, setConversationId] = useState("");
  const [assistantMessageId, setAssistantMessageId] = useState("");

  async function startChat(question = "") {
    const conversation = await createConversation();
    if (question) await addMessage(conversation.id, "user", question);
    const assistant = await addMessage(conversation.id, "assistant", sampleReply);

    setConversationId(conversation.id);
    setAssistantMessageId(assistant.id);
    setInitialQuestion(question);
    setPage("chat");
  }

  async function sendMessage(question: string) {
    await addMessage(conversationId, "user", question);
    const assistant = await addMessage(conversationId, "assistant", sampleReply);
    setAssistantMessageId(assistant.id);
    return assistant.id;
  }

  function goBack() {
    setPage("welcome");
    setInitialQuestion("");
  }

  return (
    <main className="assistant-screen">
      <div className="portrait-background" aria-hidden="true" />
      <div className="background-fade" aria-hidden="true" />

      {page === "welcome" ? (
        <WelcomePage onStartChat={startChat} />
      ) : (
        <ChatPage
          assistantMessageId={assistantMessageId}
          initialQuestion={initialQuestion}
          onBack={goBack}
          onSend={sendMessage}
          reply={sampleReply}
        />
      )}
    </main>
  );
}
