import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

// 每次测试用独立的临时数据库，避免读写项目正在使用的聊天数据。
const originalDatabasePath = process.env.DATABASE_PATH;
const testDirectory = mkdtempSync(join(tmpdir(), "knowledge-assistant-test-"));
process.env.DATABASE_PATH = join(testDirectory, "test.db");

// 等测试数据库路径确定后再导入应用和数据库模块。
let app: (typeof import("./app.js"))["app"];
let database: typeof import("./db.js");

beforeAll(async () => {
  ({ app } = await import("./app.js"));
  database = await import("./db.js");
});

afterAll(() => {
  // 测试结束后还原环境变量并移除本次创建的临时数据库目录。
  if (originalDatabasePath === undefined) delete process.env.DATABASE_PATH;
  else process.env.DATABASE_PATH = originalDatabasePath;
  rmSync(testDirectory, { recursive: true, force: true });
});

describe("Hono API", () => {
  it("返回健康状态并创建会话", async () => {
    const healthResponse = await app.request("/api/health");
    expect(healthResponse.status).toBe(200);
    await expect(healthResponse.json()).resolves.toEqual({ status: "ok" });

    const conversationResponse = await app.request("/api/conversations", { method: "POST" });
    expect(conversationResponse.status).toBe(201);
    await expect(conversationResponse.json()).resolves.toEqual({
      id: expect.any(String),
    });
  });

  it("校验会话和问题，并保存、读取、删除反馈", async () => {
    // 不存在的会话不能开始问答。
    const missingConversation = await app.request("/api/conversations/missing/stream", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ question: "你好" }),
    });
    expect(missingConversation.status).toBe(404);

    // 创建真实会话，再验证空问题会在调用模型前被拒绝。
    const createResponse = await app.request("/api/conversations", { method: "POST" });
    const { id: conversationId } = (await createResponse.json()) as { id: string };
    const emptyQuestion = await app.request(`/api/conversations/${conversationId}/stream`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ question: "   " }),
    });
    expect(emptyQuestion.status).toBe(400);

    // 直接插入一条 AI 消息，避免测试依赖真实的千问服务。
    const messageId = database.addMessage(conversationId, "assistant", "测试回复");
    const invalidFeedback = await app.request(`/api/messages/${messageId}/feedback`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ value: "maybe" }),
    });
    expect(invalidFeedback.status).toBe(400);

    // 点踩和原因应能通过后台接口读取，并可通过删除接口清除。
    const saveResponse = await app.request(`/api/messages/${messageId}/feedback`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ value: "down", reason: "  没有回答问题  " }),
    });
    expect(saveResponse.status).toBe(200);

    const adminResponse = await app.request("/api/admin/conversations");
    const conversations = (await adminResponse.json()) as {
      id: string;
      messages: { id: string; feedback: { value: string; reason: string } | null }[];
    }[];
    const conversation = conversations.find((item) => item.id === conversationId);
    expect(conversation?.messages[0]?.feedback).toEqual({
      value: "down",
      reason: "没有回答问题",
    });

    const deleteResponse = await app.request(`/api/messages/${messageId}/feedback`, {
      method: "DELETE",
    });
    expect(deleteResponse.status).toBe(200);
    expect(database.listConversations().find((item) => item.id === conversationId)?.messages[0]?.feedback).toBeNull();
  });
});
