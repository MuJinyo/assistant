# 知识助手

一个用于学习和演示的 AI 知识助手。项目采用 pnpm monorepo，包含 React 用户页面、Hono API、管理后台和 SQLite 数据库。

## 功能

- 通过千问进行多轮对话，使用 SSE 实时显示回复。
- Agent 可根据问题自动选择网页搜索或读取当前会话数据。
- 按住说话可通过腾讯云语音识别输入；回复可通过火山引擎 TTS 实时播报。
- 会话、消息和赞踩反馈保存在 SQLite；点踩可以填写原因。
- 管理后台可查看会话记录和反馈。

## 快速开始

需要 Node.js 24 和 pnpm 12。安装依赖并启动三个开发服务：

```sh
pnpm install
pnpm dev
```

打开以下地址：

- 用户页面：<http://localhost:5173>
- 管理后台：<http://localhost:5174>
- API 健康检查：<http://localhost:3000/api/health>

按 `Ctrl+C` 会同时停止 API、用户页面和管理后台。

## 配置 AI 服务

复制环境变量模板，并填写要体验的服务凭证：

```sh
cp .env.example .env
```

千问 API Key 是真实对话必需项。Tavily Key 用于网页搜索；腾讯云语音识别和火山引擎 TTS 凭证分别用于语音输入和播报。仅体验文字页面和 API 健康检查时，可以先不配置语音服务。

`.env` 只保存在本地，不要提交到 GitHub。SQLite 数据默认写入 `data/knowledge.db`。

## Docker 演示

配置好 `.env` 后，在项目根目录运行：

```sh
docker compose up --build
```

页面和 API 使用与本地开发相同的地址。按 `Ctrl+C` 后运行 `docker compose down` 停止容器；聊天数据保存在本地 `data` 目录。详细说明见[Docker 本地开发](docs/docker.md)。当前 Docker 配置用于本地开发和演示。

## 项目结构

```text
web/                  React 用户页面与语音输入、播报
admin/                React 管理后台
server/               Hono API、Agent、工具、SSE、WebSocket 和 SQLite
packages/shared/      前后端共享类型
docs/                 Docker 和 TTS 流程说明
scripts/dev.mjs       同时启动并统一停止三个开发服务
```

页面组件按职责拆分到独立文件，数据库表和关键 SQL 附有中文注释。技术选择和分步记录见[学习计划](PLAN.md)。

## 常用命令

```sh
pnpm lint       # Oxc 代码检查
pnpm format     # Oxfmt 格式化
pnpm typecheck  # 检查所有 workspace 的 TypeScript
pnpm test       # 运行 Vitest 测试
```

TTS 的 `MediaSource`、音频队列和 WebSocket 过程见[TTS 实时播报流程](docs/tts-flow.md)。
