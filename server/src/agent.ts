import type { ChatMessage, ToolCall } from "./qwen.js";
import { streamQwen } from "./qwen.js";
import { agentTools, executeTool } from "./tools.js";

const maxToolRounds = 3;

export async function* streamAgent(
  history: ChatMessage[],
  conversationId: string,
  signal: AbortSignal,
) {
  const messages: ChatMessage[] = [
    {
      role: "system",
      content:
        "你是耐心的知识助手。需要最新外部信息时可以搜索网页；回答前面聊过的内容时可以读取当前会话。使用网页搜索结果时，请说明来源标题和网址。",
    },
    ...history,
  ];

  // 每轮让模型自动选择工具；工具结果写回消息后，再请求模型组织最终回答。
  for (let round = 0; round < maxToolRounds; round += 1) {
    let toolCalls: ToolCall[] = [];

    for await (const part of streamQwen(messages, signal, agentTools)) {
      if (part.type === "text") yield part.text;
      if (part.type === "tool_calls") toolCalls = part.calls;
    }

    if (toolCalls.length === 0) return;

    // 按 OpenAI 兼容格式把模型的工具请求和工具返回值追加到同一段上下文。
    messages.push({ role: "assistant", content: null, tool_calls: toolCalls });
    for (const call of toolCalls) {
      const result = await executeTool(call, conversationId);
      messages.push({ role: "tool", tool_call_id: call.id, content: result });
    }
  }

  // 达到工具轮数上限后关闭工具，让模型基于已有结果直接回答。
  for await (const part of streamQwen(messages, signal, [])) {
    if (part.type === "text") yield part.text;
  }
}
