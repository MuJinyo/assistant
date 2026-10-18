// 前后端共用的接口返回类型集中放在这里。
export type HealthResponse = {
  status: "ok";
};

export type MessageRole = "user" | "assistant";
export type FeedbackValue = "up" | "down";

export type ConversationRecord = {
  id: string;
  createdAt: string;
  messages: {
    id: string;
    role: MessageRole;
    content: string;
    createdAt: string;
    feedback: {
      value: FeedbackValue;
      reason: string;
    } | null;
  }[];
};
