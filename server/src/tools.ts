import { getConversationMessages } from "./db.js";
import type { ToolCall, ToolDefinition } from "./qwen.js";

interface SearchResponse {
  results: { title: string; url: string; content: string }[];
}

// 工具说明和参数结构会随每次千问请求发送，让模型自行挑选要不要调用。
export const agentTools: ToolDefinition[] = [
  {
    type: "function",
    function: {
      name: "search_web",
      description: "搜索网页，回答需要最新信息或外部资料的问题时使用。",
      parameters: {
        type: "object",
        properties: { query: { type: "string", description: "要搜索的问题或关键词" } },
        required: ["query"],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "read_conversation",
      description: "读取当前会话已经保存的消息，用于回答关于之前对话的问题。",
      parameters: { type: "object", properties: {}, additionalProperties: false },
    },
  },
];

async function searchWeb(query: string) {
  const apiKey = process.env.TAVILY_API_KEY;
  if (!apiKey) return JSON.stringify({ error: "缺少 TAVILY_API_KEY，暂时无法搜索网页。" });

  // 只取三条摘要作为模型上下文，避免把整页内容塞进下一轮请求。
  const response = await fetch("https://api.tavily.com/search", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ query, search_depth: "basic", max_results: 3 }),
  });

  if (!response.ok) return JSON.stringify({ error: `网页搜索失败：${response.status}` });

  const result = (await response.json()) as SearchResponse;
  return JSON.stringify(result.results.map(({ title, url, content }) => ({ title, url, content })));
}

// 只执行代码中明确提供的工具名称；模型给出的参数先解析和检查再使用。
export async function executeTool(call: ToolCall, conversationId: string) {
  // 工具参数由模型生成，先解析 JSON；格式错误时将错误交回模型说明。
  let argumentsValue: { query?: unknown };
  try {
    argumentsValue = JSON.parse(call.function.arguments) as { query?: unknown };
  } catch {
    return JSON.stringify({ error: "工具参数不是有效 JSON。" });
  }

  if (call.function.name === "search_web") {
    if (typeof argumentsValue.query !== "string" || !argumentsValue.query.trim()) {
      return JSON.stringify({ error: "搜索关键词不能为空。" });
    }
    return searchWeb(argumentsValue.query.trim());
  }

  if (call.function.name === "read_conversation") {
    return JSON.stringify(getConversationMessages(conversationId));
  }

  return JSON.stringify({ error: `未知工具：${call.function.name}` });
}
