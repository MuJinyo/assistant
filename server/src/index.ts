// serve 用来启动 Node.js HTTP 服务，并把 Hono 应用接到网络上。
import { serve } from "@hono/node-server";
import { WebSocketServer } from "ws";
import { app } from "./app.js";
import { connectVolcengineTts } from "./volcengine-tts.js";

// 本地只监听回环地址；Docker 容器通过 HOST 环境变量改为监听所有网卡。
const hostname = process.env.HOST ?? "127.0.0.1";
const port = Number(process.env.PORT ?? 3000);

// 启动 HTTP 服务并输出实际监听地址。
const server = serve({ fetch: app.fetch, port, hostname }, (info) => {
  console.log(`API server listening on http://${hostname}:${info.port}`);
});

// 浏览器通过本项目的 WebSocket 收发文本和音频，服务端代持火山引擎凭证。
const speechSockets = new WebSocketServer({ noServer: true });
speechSockets.on("connection", connectVolcengineTts);

// 只把语音播报路径升级为 WebSocket，其他未知升级请求直接关闭。
server.on("upgrade", (request, socket, head) => {
  if (request.url !== "/api/speech/stream") {
    socket.destroy();
    return;
  }

  speechSockets.handleUpgrade(request, socket, head, (client) => {
    speechSockets.emit("connection", client, request);
  });
});
