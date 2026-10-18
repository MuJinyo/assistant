import { randomUUID } from "node:crypto";
import { DatabaseSync } from "node:sqlite";
import { mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type { ConversationRecord, FeedbackValue, MessageRole } from "@knowledge/shared";

// 数据库文件默认放在项目根目录 data 下，也可以用 DATABASE_PATH 指定路径。
/**
randomUUID：生成唯一 ID，用来标识会话、消息等记录。
DatabaseSync：Node.js 内置的 SQLite 数据库接口，用来读写数据库。
mkdirSync：同步创建文件夹。这里用于确保数据库文件的目录存在。
dirname：从文件路径中取出所在目录。
resolve：把多个路径片段合并成绝对路径。
fileURLToPath：把 import.meta.url 这种文件 URL 转成普通文件路径。
 */
const databasePath =
  process.env.DATABASE_PATH ??
  resolve(dirname(fileURLToPath(import.meta.url)), "../../data/knowledge.db");
mkdirSync(dirname(databasePath), { recursive: true });

const database = new DatabaseSync(databasePath);

// SQLite 默认不检查外键，这里打开后，消息和反馈就不能指向不存在的记录。
database.exec("PRAGMA foreign_keys = ON");

// IF NOT EXISTS 让服务每次启动都能安全地确认表结构已经准备好。
database.exec(`
  -- 一次对话对应一个会话；不需要账号，所以会话 ID 由服务端生成。
  CREATE TABLE IF NOT EXISTS conversations (
    id TEXT PRIMARY KEY,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );

  -- 用户问题和 AI 回复都存成消息，role 用来区分说话方。
  CREATE TABLE IF NOT EXISTS messages (
    id TEXT PRIMARY KEY,
    conversation_id TEXT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
    role TEXT NOT NULL CHECK (role IN ('user', 'assistant')),
    content TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );

  -- 每条 AI 消息最多有一条反馈；点踩原因作为普通文本保存。
  CREATE TABLE IF NOT EXISTS feedback (
    id TEXT PRIMARY KEY,
    message_id TEXT NOT NULL UNIQUE REFERENCES messages(id) ON DELETE CASCADE,
    value TEXT NOT NULL CHECK (value IN ('up', 'down')),
    reason TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );

  -- 后台按会话和消息时间读取数据，给这两个常用查询加索引。
  CREATE INDEX IF NOT EXISTS messages_conversation_id_idx ON messages(conversation_id);
  CREATE INDEX IF NOT EXISTS feedback_message_id_idx ON feedback(message_id);
`);

export function createConversation() {
  const id = randomUUID();
  database.prepare("INSERT INTO conversations (id) VALUES (?)").run(id);
  return id;
}

export function addMessage(conversationId: string, role: MessageRole, content: string) {
  const id = randomUUID();
  // 参数通过占位符传入，避免把用户文本拼进 SQL。
  database
    .prepare("INSERT INTO messages (id, conversation_id, role, content) VALUES (?, ?, ?, ?)")
    .run(id, conversationId, role, content);
  return id;
}

export function getConversationMessages(conversationId: string) {
  // 让千问收到当前会话的历史消息，才能理解用户的追问。
  return database
    .prepare("SELECT role, content FROM messages WHERE conversation_id = ? ORDER BY rowid ASC")
    .all(conversationId) as { role: MessageRole; content: string }[];
}

export function hasConversation(id: string) {
  return database.prepare("SELECT 1 FROM conversations WHERE id = ?").get(id) !== undefined;
}

export function hasMessage(id: string) {
  return (
    database.prepare("SELECT 1 FROM messages WHERE id = ? AND role = 'assistant'").get(id) !==
    undefined
  );
}

export function saveFeedback(messageId: string, value: FeedbackValue, reason: string) {
  // 再次提交同一条消息时更新原反馈，保证赞踩不会重复累积。
  database
    .prepare(`
      INSERT INTO feedback (id, message_id, value, reason)
      VALUES (?, ?, ?, ?)
      ON CONFLICT(message_id) DO UPDATE SET value = excluded.value, reason = excluded.reason
    `)
    .run(randomUUID(), messageId, value, reason);
}

export function removeFeedback(messageId: string) {
  database.prepare("DELETE FROM feedback WHERE message_id = ?").run(messageId);
}

export function listConversations(): ConversationRecord[] {
  // 一次联表读出会话、消息和反馈，再按会话 ID 组合成后台页面使用的结构。
  const rows = database
    .prepare(`
      SELECT
        c.id AS conversation_id,
        c.created_at AS conversation_created_at,
        m.id AS message_id,
        m.role AS message_role,
        m.content AS message_content,
        m.created_at AS message_created_at,
        f.value AS feedback_value,
        f.reason AS feedback_reason
      FROM conversations c
      LEFT JOIN messages m ON m.conversation_id = c.id
      LEFT JOIN feedback f ON f.message_id = m.id
      ORDER BY c.created_at DESC, m.created_at ASC
    `)
    .all() as {
    conversation_id: string;
    conversation_created_at: string;
    message_id: string | null;
    message_role: MessageRole | null;
    message_content: string | null;
    message_created_at: string | null;
    feedback_value: FeedbackValue | null;
    feedback_reason: string | null;
  }[];

  const conversations = new Map<string, ConversationRecord>();

  for (const row of rows) {
    let conversation = conversations.get(row.conversation_id);

    if (!conversation) {
      conversation = {
        id: row.conversation_id,
        createdAt: row.conversation_created_at,
        messages: [],
      };
      conversations.set(conversation.id, conversation);
    }

    if (row.message_id && row.message_role && row.message_content && row.message_created_at) {
      conversation.messages.push({
        id: row.message_id,
        role: row.message_role,
        content: row.message_content,
        createdAt: row.message_created_at,
        feedback:
          row.feedback_value === null
            ? null
            : { value: row.feedback_value, reason: row.feedback_reason ?? "" },
      });
    }
  }

  return [...conversations.values()];
}
