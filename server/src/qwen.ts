interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

interface QwenChunk {
  choices?: {
    delta?: {
      content?: unknown;
    };
  }[];
}

export async function* streamQwen(messages: ChatMessage[], signal: AbortSignal) {
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
    body: JSON.stringify({ model, messages, stream: true }),
    signal,
  });

  if (!response.ok) {
    throw new Error(`千问接口返回 ${response.status}：${await response.text()}`);
  }

  if (!response.body) throw new Error("千问接口没有返回流式数据。");
  //  用来从响应体中拿到数据，常用于流式响应。
  const reader = response.body.getReader();
  // 将受到的字节流转换为文本 ，new 一个解码器
  const decoder = new TextDecoder();
  let buffer = "";

  // 网络分块不一定刚好落在换行处，所以先缓存，再按 SSE 的空行切分事件。
  /*
  每次从网络读到一部分内容，就把它追加到 buffer 末尾。
  检查 buffer 里有没有 "\n\n"。
  找到了，就取出这一条完整消息，解析出其中的“我这边无法……”并交给页面显示，然后从 buffer 删除已处理的部分。
  如果还没找到 "\n\n"，说明这次只收到半条消息，先留在 buffer 里，等下一批数据到达后接着拼。
  */
  while (true) {
    const { value, done } = await reader.read();
    // 将bites字节转换成字符串。就将数据存到buffer里面
    buffer += decoder.decode(value, { stream: !done });
    buffer = buffer.replace(/\r\n/g, "\n");

    let frameEnd = buffer.indexOf("\n\n");
    // 找到行换，说明是完整的一行，
    while (frameEnd !== -1) {
      const frame = buffer.slice(0, frameEnd);
      buffer = buffer.slice(frameEnd + 2);
      const data = frame
        .split("\n")
        .filter((line) => line.startsWith("data:"))
        .map((line) => line.slice(5).trim());

      if (data.length > 0 && data[0] !== "[DONE]") {
        const chunk = JSON.parse(data.join("\n")) as QwenChunk;
        const text = chunk.choices?.[0]?.delta?.content;
        if (typeof text === "string" && text) yield text;
      }

      frameEnd = buffer.indexOf("\n\n");
    }

    if (done) break;
  }
}
