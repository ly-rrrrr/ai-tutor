# Ubuntu 生产部署运维手册

这份文档记录 `ai-tutor` 在当前 Ubuntu 主机上的生产部署方式，包括仓库关系、GitHub 维护策略、Docker 启动命令、重启命令、日志查看和安全注意事项。

## 当前目录关系

当前主机上有多个 Git 工作区，但它们指向同一个远程仓库：

```text
https://github.com/ly-rrrrr/ai-tutor.git
```

主要目录用途如下：

```text
/home/yea/ai-tutor-deploy
```

这是线上部署目录。Docker Compose、`.env.production`、Caddy、cloudflared 和 MySQL 都从这里启动。线上服务访问 `https://pumpkinwy.online` 时，对应的就是这个目录中的容器。

```text
/mnt/ai-tutor
```

这是源码工作区之一。它不是当前推荐的线上部署基准。如果它的 `main` 分支包含未整理提交或未提交改动，不应直接拿它覆盖生产目录。

```text
/tmp/ai-tutor-auth-rollout
```

这是整理后的功能分支工作区，对应分支：

```text
feat/auth-system-rollout
```

该分支包含当前应推送到 GitHub 的主要上线改动，包括 Cloudflare Tunnel、游客登录、注册登录改造、邮箱验证码和生产部署文档。

## 应维护的 GitHub 分支

推荐只维护这些分支：

```text
main
feat/auth-system-rollout
```

说明：

- `main`：稳定主分支，后续应从审核通过的功能分支合并而来。
- `feat/auth-system-rollout`：当前上线改造分支，建议先推到 GitHub，再通过 Pull Request 或人工审核合并到 `main`。

不建议推送或长期维护临时工作区、review 工作区、备份分支或已经被最终分支包含的中间分支。

## 不能提交到 GitHub 的文件和内容

严禁提交真实生产密钥，包括：

```text
.env.production
Cloudflare Tunnel token
Tencent SES SecretId
Tencent SES SecretKey
COS / S3 AccessKey
COS / S3 SecretKey
MySQL 密码
Better Auth Secret
AI API Key
```

可以提交的是示例文件，例如：

```text
.env.production.example
.env.example
```

示例文件中只能放占位符，不能放真实密钥。

## 进入线上部署目录

所有线上服务操作默认都在这个目录执行：

```bash
cd /home/yea/ai-tutor-deploy
```

## 查看服务状态

```bash
sg docker -c 'docker compose --env-file .env.production -f docker-compose.yml ps'
```

正常情况下应看到这些服务：

```text
mysql
app
caddy
cloudflared
```

其中 `app` 和 `mysql` 应为 healthy。

## 启动所有服务

适用于机器重启后、服务未自动启动、或需要手动拉起全部容器：

```bash
cd /home/yea/ai-tutor-deploy
sg docker -c 'docker compose --env-file .env.production -f docker-compose.yml up -d'
```

## 重启所有服务

适用于服务卡住、配置已加载但希望重新启动容器的情况：

```bash
cd /home/yea/ai-tutor-deploy
sg docker -c 'docker compose --env-file .env.production -f docker-compose.yml restart'
```

## 修改环境变量后的重启

如果只修改了 `.env.production`，通常不需要重新构建镜像，直接强制重建容器：

```bash
cd /home/yea/ai-tutor-deploy
sg docker -c 'docker compose --env-file .env.production -f docker-compose.yml up -d --force-recreate'
```

## 修改代码后的重新部署

如果修改了代码、依赖、Dockerfile 或前后端构建内容，执行：

```bash
cd /home/yea/ai-tutor-deploy
sg docker -c 'docker compose --env-file .env.production -f docker-compose.yml build app'
sg docker -c 'docker compose --env-file .env.production -f docker-compose.yml run --rm app pnpm db:deploy'
sg docker -c 'docker compose --env-file .env.production -f docker-compose.yml up -d'
```

## 只执行数据库迁移

适用于已经更新代码，但只想单独执行数据库迁移：

```bash
cd /home/yea/ai-tutor-deploy
sg docker -c 'docker compose --env-file .env.production -f docker-compose.yml run --rm app pnpm db:deploy'
```

## 停止服务

临时停止服务但保留数据：

```bash
cd /home/yea/ai-tutor-deploy
sg docker -c 'docker compose --env-file .env.production -f docker-compose.yml stop'
```

再次启动：

```bash
cd /home/yea/ai-tutor-deploy
sg docker -c 'docker compose --env-file .env.production -f docker-compose.yml up -d'
```

不要随意执行：

```bash
docker compose down -v
```

`down -v` 会删除 Compose 管理的数据卷。如果数据目录配置错误，可能造成数据库数据丢失。

## 查看日志

查看全部日志：

```bash
cd /home/yea/ai-tutor-deploy
sg docker -c 'docker compose --env-file .env.production -f docker-compose.yml logs -f'
```

只看应用日志：

```bash
cd /home/yea/ai-tutor-deploy
sg docker -c 'docker compose --env-file .env.production -f docker-compose.yml logs -f app'
```

只看 Cloudflare Tunnel 日志：

```bash
cd /home/yea/ai-tutor-deploy
sg docker -c 'docker compose --env-file .env.production -f docker-compose.yml logs -f cloudflared'
```

只看最近 100 行应用日志：

```bash
cd /home/yea/ai-tutor-deploy
sg docker -c 'docker compose --env-file .env.production -f docker-compose.yml logs --tail=100 app'
```

## 健康检查

本机检查：

```bash
curl -I -H 'Host: pumpkinwy.online' http://127.0.0.1/healthz
```

公网检查：

```bash
curl -I https://pumpkinwy.online/healthz
```

预期返回：

```text
HTTP/2 200
```

或：

```text
HTTP/1.1 200 OK
```

## 开机自启动

`docker-compose.yml` 中各服务使用了：

```yaml
restart: unless-stopped
```

因此只要 Docker 服务随系统启动，容器通常会自动恢复。

确认 Docker 开机自启动：

```bash
sudo systemctl enable --now docker
```

如果重启机器后网站不可访问，执行：

```bash
cd /home/yea/ai-tutor-deploy
sg docker -c 'docker compose --env-file .env.production -f docker-compose.yml up -d'
sg docker -c 'docker compose --env-file .env.production -f docker-compose.yml ps'
curl -I https://pumpkinwy.online/healthz
```

## Cloudflare Tunnel 路径

当前公网访问链路是：

```text
浏览器 -> Cloudflare -> Cloudflare Tunnel -> 本机 cloudflared -> caddy -> app
```

这个方案不依赖校园网或实验室网络开放公网入站 `80/443`，只要求本机能够主动访问 Cloudflare。

Cloudflare Dashboard 中的 Published Application Route 应指向：

```text
Hostname: pumpkinwy.online
Service Type: HTTP
Service URL: http://caddy:80
```

## 邮件登录与游客登录

如果 `.env.production` 中配置：

```env
EMAIL_PROVIDER=disabled
GUEST_ACCESS_ENABLED=true
```

表示暂时关闭邮件发送，但保留游客登录能力，用户仍可访问核心功能。

如果腾讯云 SES 模板审核通过，切换为：

```env
EMAIL_PROVIDER=tencent_ses_api
TENCENT_SES_ALLOW_SIMPLE_CONTENT=false
TENCENT_SES_VERIFICATION_OTP_TEMPLATE_ID=已审核通过的验证码模板 ID
```

然后执行：

```bash
cd /home/yea/ai-tutor-deploy
sg docker -c 'docker compose --env-file .env.production -f docker-compose.yml up -d --force-recreate'
```

## 推送整理后的功能分支

推送最终功能分支：

```bash
cd /tmp/ai-tutor-auth-rollout
git push -u origin feat/auth-system-rollout
```

不要从脏的生产目录直接 `git add -A` 后提交，也不要把 `.env.production` 推到远程仓库。
