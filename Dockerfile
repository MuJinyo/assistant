# 使用体积较小的 Node.js 24 基础镜像。
FROM node:24-bookworm-slim

# 容器内项目的工作目录。
WORKDIR /app

# 固定 pnpm 版本，保证容器与项目使用相同的包管理器版本。
# COREPACK_NPM_REGISTRY 和 NPM_REGISTRY 可在构建时覆盖，用于选择 npm 镜像；默认使用官方源。
ARG COREPACK_NPM_REGISTRY
ARG NPM_REGISTRY=https://registry.npmjs.org
RUN corepack enable && corepack prepare pnpm@12.3.4 --activate

# 先复制依赖清单。源码变化时，Docker 可以复用这一层的依赖安装缓存。
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY web/package.json web/package.json
COPY admin/package.json admin/package.json
COPY server/package.json server/package.json
COPY packages/shared/package.json packages/shared/package.json
# 按锁文件安装所有 workspace 依赖，避免依赖版本漂移。
RUN pnpm install --frozen-lockfile --registry=${NPM_REGISTRY}

# 再复制应用源码；.dockerignore 会排除本机密钥、依赖和数据库文件。
COPY . .

# 声明 API、用户页面和管理页面使用的容器端口。
EXPOSE 3000 5173 5174

# 启动开发脚本，同时运行 API、用户页面和管理页面。
CMD ["pnpm", "dev"]
