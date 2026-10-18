# Docker 本地开发

Docker Compose 会在一个容器中启动 API、用户页面和后台页面，适合本项目学习和本地演示。数据库文件挂载到项目的 `data/knowledge.db`，容器重建后聊天数据仍会保留。

## 启动

首次使用时，复制环境变量模板并填写需要的服务密钥：

```sh
cp .env.example .env
```

构建镜像并启动服务：

```sh
docker compose up --build
```

访问以下地址：

- 用户页面：<http://localhost:5173>
- 管理后台：<http://localhost:5174>
- API 健康检查：<http://localhost:3000/api/health>

停止服务但保留本地数据库：

```sh
docker compose down
```

这个配置运行 Vite 开发服务器，方便边学习边改代码；它用于本地开发和演示，不是生产部署配置。
