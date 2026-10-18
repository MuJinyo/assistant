// serve 用来启动 Node.js HTTP 服务，并把 Hono 应用接到网络上。
import { serve } from "@hono/node-server";
import { Hono } from "hono";
import { streamSSE } from "hono/streaming";
import type { FeedbackValue, HealthResponse } from "@knowledge/shared";
import {
  addMessage,
  createConversation,
  getConversationMessages,
  hasConversation,
  hasMessage,
  listConversations,
  removeFeedback,
  saveFeedback,
} from "./db.js";
import { streamAgent } from "./agent.js";
import { createTencentAsrUrl } from "./tencent-asr.js";

const app = new Hono();
// 给运维做健康检查的，或者监控系统
app.get("/api/health", (c) => c.json({ status: "ok" } satisfies HealthResponse));

app.get("/api/speech/tencent-url", (c) => {
  try {
    return c.json(createTencentAsrUrl());
  } catch (error) {
    return c.json(
      { error: error instanceof Error ? error.message : "腾讯云语音识别未配置。" },
      503,
    );
  }
});

app.post("/api/conversations", (c) => c.json({ id: createConversation() }, 201));

app.post("/api/conversations/:id/stream", async (c) => {
  const conversationId = c.req.param("id");
  if (!hasConversation(conversationId)) return c.json({ error: "会话不存在" }, 404);

  const body = await c.req.json<{ question?: string }>();
  const question = body.question?.trim();
  if (!question) return c.json({ error: "question 为必填项" }, 400);

  // 问题先入库，即使模型调用失败，后台也能看到用户发过什么。
  addMessage(conversationId, "user", question);

  return streamSSE(c, async (stream) => {
    // 浏览器断开时也取消上游模型请求，避免继续生成无用内容。
    const controller = new AbortController();
    stream.onAbort(() => controller.abort());

    let answer = "";
    try {
      const history = getConversationMessages(conversationId);
      for await (const text of streamAgent(history, conversationId, controller.signal)) {
        if (stream.aborted) return;
        answer += text;
        // 每个 token 单独发给浏览器，页面可以边接收边显示。
        await stream.writeSSE({ event: "token", data: JSON.stringify({ text }) });
      }

      if (!answer) throw new Error("千问没有返回文本内容。");

      // 只在完整回复生成后保存 assistant 消息，并把消息 ID 发给前端以启用赞踩。
      const messageId = addMessage(conversationId, "assistant", answer);
      await stream.writeSSE({ event: "done", data: JSON.stringify({ messageId }) });
    } catch (error) {
      if (stream.aborted) return;
      console.error(error);
      await stream.writeSSE({
        event: "error",
        data: JSON.stringify({ message: "千问调用失败，请检查 .env 配置和百炼服务状态。" }),
      });
    }
  });
});

app.put("/api/messages/:id/feedback", async (c) => {
  const messageId = c.req.param("id");
  if (!hasMessage(messageId)) return c.json({ error: "AI 消息不存在" }, 404);

  const body = await c.req.json<{ value?: FeedbackValue; reason?: string }>();
  if (body.value !== "up" && body.value !== "down") {
    return c.json({ error: "value 只能是 up 或 down" }, 400);
  }

  saveFeedback(messageId, body.value, body.reason?.trim() ?? "");
  return c.json({ status: "ok" });
});

app.delete("/api/messages/:id/feedback", (c) => {
  removeFeedback(c.req.param("id"));
  return c.json({ status: "ok" });
});

app.get("/api/admin/conversations", (c) => c.json(listConversations()));

const port = Number(process.env.PORT ?? 3000);

serve({ fetch: app.fetch, port, hostname: "127.0.0.1" }, (info) => {
  console.log(`API server listening on http://localhost:${info.port}`);
});
