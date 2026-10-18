async function request<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, {
    ...init,
    headers: { "Content-Type": "application/json", ...init?.headers },
  });

  if (!response.ok) {
    const error = (await response.json()) as { error?: string };
    throw new Error(error.error ?? `接口请求失败：${response.status}`);
  }
  return response.json() as Promise<T>;
}

export function createConversation() {
  return request<{ id: string }>("/api/conversations", { method: "POST" });
}

export function askQuestion(conversationId: string, question: string) {
  return request<{ answer: string; messageId: string }>(
    `/api/conversations/${conversationId}/chat`,
    {
      method: "POST",
      body: JSON.stringify({ question }),
    },
  );
}

export function saveFeedback(messageId: string, value: "up" | "down", reason = "") {
  return request<{ status: string }>(`/api/messages/${messageId}/feedback`, {
    method: "PUT",
    body: JSON.stringify({ value, reason }),
  });
}

export function removeFeedback(messageId: string) {
  return request<{ status: string }>(`/api/messages/${messageId}/feedback`, {
    method: "DELETE",
  });
}
