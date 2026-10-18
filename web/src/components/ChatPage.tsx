import { useEffect, useRef, useState } from "react";
import { AssistantMessage } from "./AssistantMessage";
import { Composer } from "./Composer";
import { StartHoldToTalkButton } from "./StartHoldToTalkButton";

interface ConversationTurn {
  id: string;
  question: string;
  reply: string;
  assistantMessageId: string;
  isStreaming: boolean;
}

interface ChatPageProps {
  composerMode: "voice" | "text";
  errorMessage: string;
  isReplyStreaming: boolean;
  isStarted: boolean;
  onInputModeChange: (mode: "voice" | "text") => void;
  onSend: (question: string) => Promise<void>;
  onSpeechError: (message: string) => void;
  stopSignal: number;
  turns: ConversationTurn[];
}

export function ChatPage({
  composerMode,
  errorMessage,
  isReplyStreaming,
  isStarted,
  onInputModeChange,
  onSend,
  onSpeechError,
  stopSignal,
  turns,
}: ChatPageProps) {
  const lastTurnRef = useRef<HTMLDivElement>(null);
  const [focusTextInputOnMount, setFocusTextInputOnMount] = useState(false);

  useEffect(() => {
    lastTurnRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }, [turns.length]);

  function switchToTextInput() {
    setFocusTextInputOnMount(true);
    onInputModeChange("text");
  }

  return (
    <>
      <section className="conversation" aria-label="对话内容" aria-live="polite">
        {turns.map((turn, index) => (
          <div
            className="conversation-turn"
            key={turn.id}
            ref={index === turns.length - 1 ? lastTurnRef : null}
          >
            <p className="user-question">{turn.question}</p>
            {(turn.reply || turn.isStreaming) && (
              <AssistantMessage
                isStreaming={turn.isStreaming}
                messageId={turn.assistantMessageId}
                reply={turn.reply}
                stopSignal={stopSignal}
              />
            )}
          </div>
        ))}
        {errorMessage && (
          <p className="request-error" role="alert">
            {errorMessage}
          </p>
        )}
      </section>

      <div className="composer-dock">
        {isStarted || composerMode === "text" ? (
          <Composer
            disabled={isReplyStreaming}
            focusTextInputOnMount={focusTextInputOnMount}
            inputMode={composerMode}
            onInputModeChange={onInputModeChange}
            onSend={onSend}
            stopSignal={stopSignal}
          />
        ) : (
          <StartHoldToTalkButton
            disabled={isReplyStreaming}
            onError={onSpeechError}
            onSend={onSend}
            onSwitchToText={switchToTextInput}
            stopSignal={stopSignal}
          />
        )}
        <p className="disclaimer">内容由 AI 生成，仅供参考</p>
      </div>
    </>
  );
}
