import { createHmac, randomInt, randomUUID } from "node:crypto";

// 生成短时有效的腾讯云 WebSocket 地址，SecretKey 只在服务端参与签名。
export function createTencentAsrUrl() {
  const appId = process.env.TENCENT_ASR_APP_ID;
  const secretId = process.env.TENCENT_ASR_SECRET_ID;
  const secretKey = process.env.TENCENT_ASR_SECRET_KEY;

  if (!appId || !secretId || !secretKey) {
    throw new Error("请先在 .env 中填写腾讯云语音识别配置。");
  }

  const timestamp = Math.floor(Date.now() / 1000);
  const parameters: Record<string, string> = {
    engine_model_type: "16k_zh",
    expired: String(timestamp + 60),
    filter_punc: "0",
    needvad: "1",
    nonce: String(randomInt(1, 1_000_000_000)),
    secretid: secretId,
    timestamp: String(timestamp),
    voice_format: "1",
    voice_id: randomUUID(),
  };

  // 腾讯云要求参数按字典序组成签名原文，再用 SecretKey 执行 HMAC-SHA1。
  const query = new URLSearchParams(
    Object.entries(parameters).sort(([left], [right]) =>
      left < right ? -1 : left > right ? 1 : 0,
    ),
  ).toString();
  const signText = `asr.cloud.tencent.com/asr/v2/${appId}?${query}`;
  const signature = createHmac("sha1", secretKey).update(signText).digest("base64");
  const url = `wss://asr.cloud.tencent.com/asr/v2/${appId}?${query}&signature=${encodeURIComponent(signature)}`;

  return { url };
}
