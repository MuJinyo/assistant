import type { ConversationRecord } from "@knowledge/shared";

export async function getConversations() {
  const response = await fetch("/api/admin/conversations");
  if (!response.ok) throw new Error(`读取聊天记录失败：${response.status}`);
  return response.json() as Promise<ConversationRecord[]>;
}
