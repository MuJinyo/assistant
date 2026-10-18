export interface ChatMessage {
  role: "system" | "user" | "assistant" | "tool";
  content: string | null;
  tool_call_id?: string;
  tool_calls?: ToolCall[];
}

export interface ToolCall {
  id: string;
  type: "function";
  function: {
    name: string;
    arguments: string;
  };
}

export interface ToolDefinition {
  type: "function";
  function: {
    name: string;
    description: string;
    parameters: Record<string, unknown>;
  };
}

interface QwenChunk {
  choices?: {
    delta?: {
      content?: unknown;
      tool_calls?: {
        index: number;
        id?: string;
        type?: "function";
        function?: { name?: string; arguments?: string };
      }[];
    };
  }[];
}

export type QwenStreamPart =
  | { type: "text"; text: string }
  | { type: "tool_calls"; calls: ToolCall[] };

export async function* streamQwen(
  messages: ChatMessage[],
  signal: AbortSignal,
  tools: ToolDefinition[],
) {
  const apiKey = process.env.DASHSCOPE_API_KEY;
  if (!apiKey) throw new Error("缺少 DASHSCOPE_API_KEY，请在项目根目录 .env 中填写百炼 API Key。");

  const baseUrl =
    process.env.DASHSCOPE_BASE_URL ?? "https://dashscope.aliyuncs.com/compatible-mode/v1";
  const model = process.env.QWEN_MODEL ?? "qwen-plus";
  // stream: true 让百炼按 SSE 分段返回 token，而不是等整段回复生成完。
  const response = await fetch(`${baseUrl.replace(/\/$/, "")}/chat/completions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      messages,
      stream: true,
      ...(tools.length > 0 ? { tools, tool_choice: "auto" } : {}),
    }),
    signal,
  });

  if (!response.ok) {
    throw new Error(`千问接口返回 ${response.status}：${await response.text()}`);
  }

  if (!response.body) throw new Error("千问接口没有返回流式数据。");
  // reader 逐块读取响应体；TextDecoder 负责把网络字节解码成 UTF-8 文本。
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  const toolCalls = new Map<number, ToolCall>();

  // 网络分块不一定刚好落在换行处，所以先缓存，再按 SSE 的空行切分事件。
  /*
   * 每次网络读取到的内容都追加到 buffer。
   * SSE 用空行分隔事件；找到完整事件后再解析，半条事件留到下一次读取继续拼接。
   */
  while (true) {
    const { value, done } = await reader.read();
    // 使用 stream 选项保留尚未解码完整的多字节字符，避免中文被截断。
    buffer += decoder.decode(value, { stream: !done });
    buffer = buffer.replace(/\r\n/g, "\n");

    let frameEnd = buffer.indexOf("\n\n");
    while (frameEnd !== -1) {
      const frame = buffer.slice(0, frameEnd);
      buffer = buffer.slice(frameEnd + 2);
      const data = frame
        .split("\n")
        .filter((line) => line.startsWith("data:"))
        .map((line) => line.slice(5).trim());

      if (data.length > 0 && data[0] !== "[DONE]") {
        const chunk = JSON.parse(data.join("\n")) as QwenChunk;
        const delta = chunk.choices?.[0]?.delta;
        if (typeof delta?.content === "string" && delta.content) {
          yield { type: "text", text: delta.content } satisfies QwenStreamPart;
        }

        // 工具名称和 JSON 参数可能拆在多个网络块里，按 index 把片段拼成完整调用。
        for (const part of delta?.tool_calls ?? []) {
          const call = toolCalls.get(part.index) ?? {
            id: "",
            type: "function" as const,
            function: { name: "", arguments: "" },
          };
          if (part.id) call.id = part.id;
          if (part.function?.name) call.function.name = part.function.name;
          if (part.function?.arguments) call.function.arguments += part.function.arguments;
          toolCalls.set(part.index, call);
        }
      }

      frameEnd = buffer.indexOf("\n\n");
    }

    if (done) break;
  }

  if (toolCalls.size > 0) {
    const calls = [...toolCalls.entries()]
      .sort(([left], [right]) => left - right)
      .map(([, call]) => call);
    yield { type: "tool_calls", calls } satisfies QwenStreamPart;
  }
}
