# GitLab 分支部署

## 分支和环境对应关系

| 分支 | GitLab 环境 | Compose 项目 | 访问端口 |
| --- | --- | --- | --- |
| `develop` | development | `zhushou-development` | `13000` |
| `staging` | staging | `zhushou-staging` | `23000` |
| `main` | production | `zhushou-production` | `3000` |

推送到这三个分支时，CI 先运行代码检查和集成检查；都通过后，再自动部署对应环境。部署地址为 `http://<服务器地址>:<访问端口>`。每套 Compose 项目使用独立容器和 `data` 目录，环境之间不会共用 SQLite 数据库。

本 monorepo 按一个版本整体发布：Vite 分别构建用户页面和管理后台，Hono 服务提供 API、用户页面以及 `/admin/` 管理后台。因此不用为 `web`、`admin`、`server` 分别配置部署任务。

## 远程服务器准备

1. 准备一台已安装 Docker Engine 和 Docker Compose 插件的 Linux 服务器，并创建一个可通过 SSH 登录、可以执行 Docker 命令的部署用户。
2. 在服务器上创建部署目录和环境变量目录，并确保部署用户可以写入：

   ```sh
   mkdir -p /srv/zhushou /srv/zhushou-secrets
   ```

3. 在 `/srv/zhushou-secrets/` 中创建 `development.env`、`staging.env`、`production.env`。每份文件按环境填写所需的模型、搜索和语音服务密钥。不要把这些文件提交到 Git。
4. 限制环境文件的权限：

   ```sh
   chmod 600 /srv/zhushou-secrets/*.env
   ```

5. 确保服务器防火墙允许访问端口 `13000`、`23000` 和 `3000`。如果线上使用域名或 HTTPS，应在服务器前配置反向代理和 TLS，再将对应端口转为仅内网可访问。

## GitLab CI/CD 变量

在 GitLab 项目打开 **Settings > CI/CD > Variables**，添加以下变量：

| 变量 | 类型 | 示例或说明 |
| --- | --- | --- |
| `DEPLOY_HOST` | Variable | 服务器 IP 或 SSH 域名 |
| `DEPLOY_USER` | Variable | 上面创建的部署用户名 |
| `DEPLOY_ROOT` | Variable | `/srv/zhushou` |
| `DEPLOY_ENV_ROOT` | Variable | `/srv/zhushou-secrets` |
| `SSH_PRIVATE_KEY` | File | 部署用户对应的 SSH 私钥文件 |
| `SSH_KNOWN_HOSTS` | File | 已核验过的服务器 SSH host key 行 |

私钥和 host key 都应设为 **File** 类型。不要关闭 host key 校验；通过可信渠道核实服务器指纹后，再将对应的 `known_hosts` 行作为 `SSH_KNOWN_HOSTS` 文件变量保存。变量需要对 `develop`、`staging` 和 `main` 的部署流水线可用；如果将它们标记为 Protected，这三个分支也必须在 GitLab 中设为 Protected。

部署作业只通过 SSH 传输代码并在目标服务器执行 Compose 构建。环境密钥文件单独保存在服务器上，不会随代码同步，也不会写入镜像。

## Monorepo 生产镜像

`Dockerfile.release` 会在构建阶段安装 workspace 依赖并构建 `web` 和 `admin`，运行阶段再通过 Hono 提供 API 和静态页面。日常本地开发仍使用原来的 `Dockerfile` 和 `docker-compose.yml`；CI 集成检查继续使用临时的 DinD 环境，持久部署使用单独的 `docker-compose.release.yml`。
