// serve 用来启动 Node.js HTTP 服务，并把 Hono 应用接到网络上。
import { serve } from "@hono/node-server";
import { Hono } from "hono";
import type { FeedbackValue, HealthResponse, MessageRole } from "@knowledge/shared";
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
import { askQwen } from "./qwen.js";

const app = new Hono();
// 给运维做健康检查的，或者监控系统
app.get("/api/health", (c) => c.json({ status: "ok" } satisfies HealthResponse));

app.post("/api/conversations", (c) => c.json({ id: createConversation() }, 201));

app.post("/api/conversations/:id/chat", async (c) => {
  const conversationId = c.req.param("id");
  if (!hasConversation(conversationId)) return c.json({ error: "会话不存在" }, 404);

  const body = await c.req.json<{ question?: string }>();
  const question = body.question?.trim();
  if (!question) return c.json({ error: "question 为必填项" }, 400);

  // 问题先入库，即使模型调用失败，后台也能看到用户发过什么。
  addMessage(conversationId, "user", question);

  try {
    const answer = await askQwen(getConversationMessages(conversationId));
    const messageId = addMessage(conversationId, "assistant", answer);
    return c.json({ answer, messageId });
  } catch (error) {
    console.error(error);
    return c.json({ error: "千问调用失败，请检查 .env 配置和百炼服务状态。" }, 502);
  }
});

app.post("/api/conversations/:id/messages", async (c) => {
  const conversationId = c.req.param("id");
  if (!hasConversation(conversationId)) return c.json({ error: "会话不存在" }, 404);

  const body = await c.req.json<{ role?: MessageRole; content?: string }>();
  if ((body.role !== "user" && body.role !== "assistant") || !body.content?.trim()) {
    return c.json({ error: "role 和 content 为必填项" }, 400);
  }

  const id = addMessage(conversationId, body.role, body.content.trim());
  return c.json({ id }, 201);
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
