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

export function createConversation(signal?: AbortSignal) {
  return request<{ id: string }>("/api/conversations", { method: "POST", signal });
}

interface SseFrame {
  event: string;
  data: string;
}

function parseSseFrame(frame: string): SseFrame {
  const lines = frame.split("\n");
  return {
    event:
      lines
        .find((line) => line.startsWith("event:"))
        ?.slice(6)
        .trim() ?? "message",
    data: lines
      .filter((line) => line.startsWith("data:"))
      .map((line) => line.slice(5).trim())
      .join("\n"),
  };
}

// 发起 POST 请求读取 SSE；相比 EventSource，它也支持携带 JSON 请求体。
export async function streamQuestion(
  conversationId: string,
  question: string,
  onToken: (answer: string) => void,
  signal?: AbortSignal,
) {
  const response = await fetch(`/api/conversations/${conversationId}/stream`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "text/event-stream" },
    body: JSON.stringify({ question }),
    signal,
  });

  if (!response.ok) {
    const error = (await response.json()) as { error?: string };
    throw new Error(error.error ?? `接口请求失败：${response.status}`);
  }
  if (!response.body) throw new Error("浏览器没有收到 SSE 数据流。");

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let answer = "";
  let messageId = "";

  // 一个 HTTP 数据块不一定对应一个完整事件，因此缓存内容并按空行切出 SSE 帧。
  function handleFrame(frame: string) {
    const { event, data } = parseSseFrame(frame);
    if (!data) return;

    // token 事件只带新增片段，前端在这里累加成当前完整文本。
    if (event === "token") {
      const token = JSON.parse(data) as { text: string };
      answer += token.text;
      onToken(answer);
    }

    // done 事件包含数据库中的回复 ID，收到后才允许复制和提交反馈。
    if (event === "done") {
      messageId = (JSON.parse(data) as { messageId: string }).messageId;
    }

    // error 事件在 HTTP 流已经开始后传递错误信息。
    if (event === "error") {
      const error = JSON.parse(data) as { message: string };
      throw new Error(error.message);
    }
  }

  // 持续读取服务端推送的 token，拼成完整回复并实时通知 React 更新页面。
  while (true) {
    const { value, done } = await reader.read();
    buffer += decoder.decode(value, { stream: !done });
    buffer = buffer.replace(/\r\n/g, "\n");
    let frameEnd = buffer.indexOf("\n\n");
    while (frameEnd !== -1) {
      handleFrame(buffer.slice(0, frameEnd));
      buffer = buffer.slice(frameEnd + 2);
      frameEnd = buffer.indexOf("\n\n");
    }

    if (done) break;
  }

  if (buffer.trim()) handleFrame(buffer);
  if (!messageId) throw new Error("SSE 数据流提前结束，没有收到完成事件。");
  return { answer, messageId };
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
