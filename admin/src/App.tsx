import { useEffect, useState } from "react";
import type { ConversationRecord } from "@knowledge/shared";
import { getConversations } from "./api";
import { ConversationCard } from "./components/ConversationCard";

export function App() {
  const [conversations, setConversations] = useState<ConversationRecord[]>([]);

  useEffect(() => {
    getConversations().then(setConversations);
  }, []);

  return (
    <main>
      <header className="admin-header">
        <div>
          <h1>聊天记录</h1>
          <p>查看用户对话和回复反馈</p>
        </div>
        <span>{conversations.length} 个会话</span>
      </header>

      {conversations.length === 0 ? (
        <p className="empty-state">还没有聊天记录</p>
      ) : (
        <section className="conversation-list" aria-label="聊天记录列表">
          {conversations.map((conversation) => (
            <ConversationCard conversation={conversation} key={conversation.id} />
          ))}
        </section>
      )}
    </main>
  );
}
