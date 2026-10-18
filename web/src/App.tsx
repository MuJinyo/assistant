import { useRef, useState } from "react";
import { createConversation, streamQuestion } from "./api";
import { ChatPage } from "./components/ChatPage";
import { Icon } from "./components/Icon";
import { WelcomePage } from "./components/WelcomePage";

interface ConversationTurn {
  id: string;
  question: string;
  reply: string;
  assistantMessageId: string;
  isStreaming: boolean;
}

export function App() {
  const conversationRef = useRef("");
  const requestControllerRef = useRef<AbortController | null>(null);
  const [isStarted, setIsStarted] = useState(false);
  const [turns, setTurns] = useState<ConversationTurn[]>([]);
  const [isReplyStreaming, setIsReplyStreaming] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [stopSignal, setStopSignal] = useState(0);
  const [composerMode, setComposerMode] = useState<"voice" | "text">("voice");

  // 第一次开始或发送推荐问题时创建会话，后续问题沿用同一个会话。
  async function ensureConversation(signal: AbortSignal) {
    if (conversationRef.current) return conversationRef.current;
    const conversation = await createConversation(signal);
    conversationRef.current = conversation.id;
    return conversation.id;
  }

  async function sendMessage(question: string) {
    if (isReplyStreaming || !question.trim()) return;

    setErrorMessage("");
    setIsStarted(true);
    setIsReplyStreaming(true);
    const controller = new AbortController();
    requestControllerRef.current = controller;
    const turnId = crypto.randomUUID();
    setTurns((current) => [
      ...current,
      { id: turnId, question, reply: "", assistantMessageId: "", isStreaming: true },
    ]);

    try {
      const conversationId = await ensureConversation(controller.signal);
      const response = await streamQuestion(
        conversationId,
        question,
        (reply) => {
          setTurns((current) =>
            current.map((turn) => (turn.id === turnId ? { ...turn, reply } : turn)),
          );
        },
        controller.signal,
      );
      setTurns((current) =>
        current.map((turn) =>
          turn.id === turnId
            ? { ...turn, assistantMessageId: response.messageId, isStreaming: false }
            : turn,
        ),
      );
    } catch (error) {
      if (!controller.signal.aborted) {
        setErrorMessage(error instanceof Error ? error.message : "暂时无法发送问题。");
      }
      setTurns((current) =>
        current.map((turn) => (turn.id === turnId ? { ...turn, isStreaming: false } : turn)),
      );
    } finally {
      if (requestControllerRef.current === controller) {
        requestControllerRef.current = null;
        setIsReplyStreaming(false);
      }
    }
  }

  function stopEverything() {
    requestControllerRef.current?.abort();
    requestControllerRef.current = null;
    setIsReplyStreaming(false);
    setTurns((current) => current.map((turn) => ({ ...turn, isStreaming: false })));
    setStopSignal((current) => current + 1);
  }

  return (
    <main className="assistant-screen">
      <div className="portrait-background" aria-hidden="true" />
      <div className="background-fade" aria-hidden="true" />
      <button
        aria-label="停止所有活动"
        className="stop-all-button"
        onClick={stopEverything}
        title="停止语音、播放和生成"
        type="button"
      >
        <Icon name="stop" />
        停止
      </button>
      <WelcomePage onAsk={sendMessage} disabled={isReplyStreaming} />
      <ChatPage
        composerMode={composerMode}
        errorMessage={errorMessage}
        isReplyStreaming={isReplyStreaming}
        isStarted={isStarted}
        onInputModeChange={setComposerMode}
        onSend={sendMessage}
        onSpeechError={setErrorMessage}
        stopSignal={stopSignal}
        turns={turns}
      />
    </main>
  );
}
