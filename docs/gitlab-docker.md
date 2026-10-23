# 本地 GitLab（Docker）

本项目提供独立的 GitLab Compose 配置，不会和应用的 `docker-compose.yml` 合并启动。

## 启动

在仓库根目录运行：

```sh
docker compose -f docker-compose.gitlab.yml up -d
```

首次启动需要几分钟。查看初始化进度：

```sh
docker compose -f docker-compose.gitlab.yml logs -f gitlab
```

打开 <http://localhost:8929>，用户名为 `root`。获取初始密码：

```sh
docker compose -f docker-compose.gitlab.yml exec gitlab grep 'Password:' /etc/gitlab/initial_root_password
```

初始密码文件会在创建后 24 小时自动删除，首次登录后请设置自己的密码。

SSH 克隆地址使用端口 `2224`，例如：

```sh
git clone ssh://git@localhost:2224/group/project.git
```

## 停止与数据

停止容器但保留 GitLab 配置、日志和仓库数据：

```sh
docker compose -f docker-compose.gitlab.yml down
```

数据保存在 Docker 命名卷 `gitlab-config`、`gitlab-logs` 和 `gitlab-data` 中。需要在 Docker Desktop 或 OrbStack 中给 GitLab 容器分配足够的内存和磁盘空间；GitLab 的单机基线为 16 GB 内存，资源受限的个人实例可按官方指南调整。

GitLab CI job 还需要 Runner。把本机实例用于 CI 时，可在 GitLab 管理界面创建 Runner 并注册本机 Runner；CI 配置中的 Docker-in-Docker 任务要求 Runner 允许特权容器。
