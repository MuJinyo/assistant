import { useState } from "react";
import { ChatPage } from "./components/ChatPage";
import { WelcomePage } from "./components/WelcomePage";

export function App() {
  const [page, setPage] = useState<"welcome" | "chat">("welcome");
  const [initialQuestion, setInitialQuestion] = useState("");

  function startChat(question = "") {
    setInitialQuestion(question);
    setPage("chat");
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
        <ChatPage initialQuestion={initialQuestion} onBack={goBack} />
      )}
    </main>
  );
}
