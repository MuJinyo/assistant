# TTS 实时播报流程

本文按当前代码说明 AI 回复文字如何变成浏览器中的流式语音。前端通过项目自己的 WebSocket 连接后端；后端再连接火山引擎 TTS，并将音频片段转发给前端。火山引擎凭证只保存在服务端。

相关代码：

- `web/src/speech/useAssistantSpeech.ts`
- `server/src/index.ts`
- `server/src/volcengine-tts.ts`

## 自动播报完整流程

```mermaid
flowchart TD
  A[AI 回复更新] --> B[hook 截取本次新增文字]
  B --> C{自动播报已开启且有新文字？}
  C -- 否 --> D[不发送这段文字]
  C -- 是 --> E[openSocket 创建或复用前端语音连接]

  E --> F{已有 WebSocket？}
  F -- 是 --> G[复用当前连接]
  F -- 否 --> H{浏览器支持 audio/mpeg？}
  H -- 否 --> H1[显示浏览器不支持流式 MP3]
  H -- 是 --> I[new MediaSource()]
  I --> J[URL.createObjectURL(mediaSource)]
  J --> K[new Audio(audioUrl)]
  K --> L[new WebSocket 到 /api/speech/stream]
  L --> M[设置 binaryType 为 arraybuffer]

  I -. 异步等待 .-> N[sourceopen 事件]
  N --> O[addSourceBuffer audio/mpeg]
  O --> P[设置 SourceBuffer mode 为 sequence]
  P --> Q[注册 updateend 事件，继续处理音频队列]

  B --> R[send text JSON]
  R --> S{浏览器 WebSocket 已打开？}
  S -- 否 --> T[放入前端 outgoingQueue]
  S -- 是 --> U[立即发送给项目服务端]
  T --> V[WebSocket onopen 后按顺序发送队列]
  V --> U
  U --> W[服务端升级 /api/speech/stream]
  W --> X[connectVolcengineTts 建立火山引擎连接]
  X --> Y[上游 open 后发送 startConnection]
  Y --> Y1[收到 connectionStarted]
  Y1 --> Y2[发送 startSession 和发音人、音频参数]

  U --> Z{火山引擎会话已就绪？}
  Z -- 否 --> ZA[服务端放入 pendingText]
  Z -- 是 --> ZB[服务端发送 taskRequest 文本片段]
  Y2 --> ZC[收到 sessionStarted]
  ZC --> ZD[发送 ready 给前端并冲刷 pendingText]
  ZA --> ZD
  ZD --> ZB
  ZB --> AA[火山引擎流式生成音频]
  AA --> AB[服务端转发二进制音频帧]
  AB --> AC[前端收到 ArrayBuffer 并放入 audioQueue]
  AC --> AG[更新播放状态并尝试 audio.play]
  AC --> AD{SourceBuffer 已就绪且空闲？}
  AD -- 否 --> AE[等待 sourceopen 或 updateend]
  AE --> AD
  AD -- 是 --> AD1{audioQueue 中有片段？}
  AD1 -- 有 --> AF[shift 队首并 appendBuffer]
  AF -. 追加完成后 updateend .-> AD
  AD1 -- 没有 --> AD2{服务端已发送 done 且 MediaSource 仍打开？}
  AD2 -- 是 --> AP[调用 mediaSource.endOfStream]
  AD2 -- 否 --> AD3[等待下一段音频或 done 消息]

  A --> AH{回复结束且播报仍开启、已发送过文字？}
  AH -- 否 --> A
  AH -- 是且已发送过文字 --> AI[前端发送 finish]
  AI --> AJ{火山引擎会话已就绪？}
  AJ -- 否 --> AK[服务端记录 finishRequested]
  AJ -- 是 --> AL[服务端发送 finishSession]
  AK --> ZC
  ZC --> AL
  AL --> AM[火山引擎完成剩余音频]
  AM --> AN[服务端转发剩余音频并发送 done]
  AN --> AO[前端标记 isFinished 并继续排空队列]
  AO --> AD
  AP --> AQ[audio 播放结束，触发 audio.onended]
  AQ --> AR{isFinished 已标记？}
  AR -- 是 --> AS[stop 清理连接、播放器和临时 URL]
  AR -- 否 --> AT[状态暂时回到 idle，等待后续音频]
```

## `MediaSource` 播放步骤

1. `new MediaSource()` 创建可追加音频数据的媒体源。
2. `URL.createObjectURL(mediaSource)` 创建供播放器使用的临时地址。
3. `new Audio(audioUrl)` 创建音频播放器。
4. 等到 `sourceopen` 事件后，调用 `mediaSource.addSourceBuffer("audio/mpeg")`。
5. 设置 `sourceBuffer.mode = "sequence"`，让片段按追加顺序连续播放。
6. 每个音频帧先放进 `audioQueue`。只有 `SourceBuffer` 存在且不在更新时，才取一段调用 `appendBuffer()`。
7. `appendBuffer()` 完成后触发 `updateend`，处理队列中的下一段。
8. 收到服务端 `done` 后设置完成标记。队列清空且 `MediaSource` 仍打开时，调用 `endOfStream()`。
9. 播放结束后调用 `stop()`，关闭 WebSocket、暂停播放器并释放 `URL.createObjectURL()` 创建的地址。

`sourceopen` 和 WebSocket 握手是两条并行的异步流程。音频可以先到达并进入 `audioQueue`；等 `SourceBuffer` 可用后再追加。文本消息也有两层排队：浏览器连接尚未打开时由前端暂存；火山引擎会话尚未就绪时由服务端暂存。

## 按钮行为

- AI 正在生成时，按钮切换自动播报。关闭时停止当前语音；重新开启时只发送之前尚未发送的文字。
- AI 回复完成后，播报进行中点击按钮会停止播放。
- AI 回复完成且处于空闲时，点击按钮会把整段回复重新发送给 TTS，并发送 `finish`，用于重播。
- 播放被浏览器自动播放策略拦截时，界面提示用户手动点击语音按钮。

## 错误与清理

- 浏览器不支持 `audio/mpeg`、WebSocket 连接失败、服务端或火山引擎返回错误、音频播放失败时，hook 会记录错误供界面显示。
- 服务端收到浏览器 WebSocket 关闭事件时，会关闭对应的火山引擎 WebSocket。
- 前端调用 `stop()` 时会清空待发送和待播放队列，并释放音频资源。
