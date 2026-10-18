import type { ConversationRecord } from "@knowledge/shared";

interface ConversationCardProps {
  conversation: ConversationRecord;
}

export function ConversationCard({ conversation }: ConversationCardProps) {
  return (
    <article className="conversation-card">
      <p className="conversation-date">会话 · {conversation.createdAt}</p>
      <ol className="message-list">
        {conversation.messages.map((message) => (
          <li className={`message ${message.role}`} key={message.id}>
            <div className="message-heading">
              <strong>{message.role === "user" ? "用户" : "AI"}</strong>
              <time>{message.createdAt}</time>
            </div>
            <p>{message.content}</p>
            {message.feedback && (
              <div className={`feedback ${message.feedback.value}`}>
                {message.feedback.value === "up" ? "赞同" : "点踩"}
                {message.feedback.reason && ` · ${message.feedback.reason}`}
              </div>
            )}
          </li>
        ))}
      </ol>
    </article>
  );
}
