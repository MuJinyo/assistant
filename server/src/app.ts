// Hono 提供轻量的 HTTP 路由，并支持直接通过 app.request 测试接口。
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

// 创建 HTTP API 应用；WebSocket 升级由 index.ts 的 Node 服务负责。
export const app = new Hono();

// 给开发者或监控系统提供服务健康状态。
app.get("/api/health", (c) => c.json({ status: "ok" } satisfies HealthResponse));

// 为浏览器生成腾讯云语音识别需要的短时 WebSocket 地址。
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

// 创建一个新的聊天会话，并将会话 ID 返回给浏览器。
app.post("/api/conversations", (c) => c.json({ id: createConversation() }, 201));

// 接收问题并用 SSE 转发 Agent 逐段生成的回答。
app.post("/api/conversations/:id/stream", async (c) => {
  const conversationId = c.req.param("id"); // 从 URL 读取当前会话 ID。
  if (!hasConversation(conversationId)) return c.json({ error: "会话不存在" }, 404); // 不允许向不存在的会话追加问题。

  const body = await c.req.json<{ question?: string }>(); // 解析浏览器提交的问题。
  const question = body.question?.trim(); // 去掉首尾空格，拒绝空问题。
  if (!question) return c.json({ error: "question 为必填项" }, 400); // 缺少有效问题时返回请求错误。

  // 问题先入库，即使模型调用失败，后台也能看到用户发过什么。
  addMessage(conversationId, "user", question);

  return streamSSE(c, async (stream) => {
    // 浏览器断开时也取消上游模型请求，避免继续生成无用内容。
    const controller = new AbortController();
    stream.onAbort(() => controller.abort());

    let answer = ""; // 汇总完整回答，生成完成后写入数据库。
    try {
      const history = getConversationMessages(conversationId); // 读取当前会话历史供 Agent 理解上下文。
      for await (const text of streamAgent(history, conversationId, controller.signal)) {
        if (stream.aborted) return; // 客户端已断开时停止写入。
        answer += text; // 累积回答内容。
        // 每个 token 单独发给浏览器，页面可以边接收边显示。
        await stream.writeSSE({ event: "token", data: JSON.stringify({ text }) });
      }

      if (!answer) throw new Error("千问没有返回文本内容。"); // 空回答不能作为成功消息保存。

      // 只在完整回复生成后保存 assistant 消息，并把消息 ID 发给前端以启用赞踩。
      const messageId = addMessage(conversationId, "assistant", answer);
      await stream.writeSSE({ event: "done", data: JSON.stringify({ messageId }) });
    } catch (error) {
      if (stream.aborted) return; // 浏览器已离开时不再写错误事件。
      console.error(error); // 在服务端日志保留模型调用或数据库错误用于排查。
      await stream.writeSSE({
        event: "error",
        data: JSON.stringify({ message: "千问调用失败，请检查 .env 配置和百炼服务状态。" }),
      });
    }
  });
});

// 为 AI 消息新增或更新赞踩反馈。
app.put("/api/messages/:id/feedback", async (c) => {
  const messageId = c.req.param("id"); // 从 URL 读取目标 AI 消息 ID。
  if (!hasMessage(messageId)) return c.json({ error: "AI 消息不存在" }, 404); // 反馈只能关联已保存的 AI 消息。

  const body = await c.req.json<{ value?: FeedbackValue; reason?: string }>(); // 解析反馈类型和用户填写的原因。
  if (body.value !== "up" && body.value !== "down") {
    return c.json({ error: "value 只能是 up 或 down" }, 400); // 仅接受赞同或点踩两种反馈值。
  }

  saveFeedback(messageId, body.value, body.reason?.trim() ?? ""); // 保存反馈并去掉原因首尾空格。
  return c.json({ status: "ok" }); // 告知浏览器保存成功。
});

// 删除指定 AI 消息的赞踩反馈。
app.delete("/api/messages/:id/feedback", (c) => {
  removeFeedback(c.req.param("id")); // 删除该消息当前保存的反馈。
  return c.json({ status: "ok" }); // 告知浏览器删除请求已完成。
});

// 为后台页面返回会话、消息及其反馈记录。
app.get("/api/admin/conversations", (c) => c.json(listConversations()));
