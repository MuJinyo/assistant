import { stringify } from "querystring";

interface QwenResponse {
  choices?: {
    message?: {
      content?: unknown;
    };
  }[];
}

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

export async function askQwen(messages: ChatMessage[]) {
  const apiKey = process.env.DASHSCOPE_API_KEY;
  if (!apiKey) throw new Error("缺少 DASHSCOPE_API_KEY，请在项目根目录 .env 中填写百炼 API Key。");

  const baseUrl =
    process.env.DASHSCOPE_BASE_URL ?? "https://dashscope.aliyuncs.com/compatible-mode/v1";
  const model = process.env.QWEN_MODEL ?? "qwen-plus";
  const response = await fetch(`${baseUrl.replace(/\/$/, "")}/chat/completions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      messages,
    }),
  });

  if (!response.ok) {
    throw new Error(`千问接口返回 ${response.status}：${await response.text()}`);
  }

  const result = (await response.json()) as QwenResponse;
  console.log('千问', JSON.stringify(result.choices, null, 1) )
  const answer = result.choices?.[0]?.message?.content;
  if (typeof answer !== "string") throw new Error("千问接口没有返回文本内容。");

  return answer;
}
