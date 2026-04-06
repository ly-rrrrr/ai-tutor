# 腾讯云香港 Lighthouse 部署指南

## 目标

本指南对应当前项目的最小可部署形态：

- 腾讯云香港 Lighthouse 运行 `Docker Compose`
- 同机 MySQL 8
- Caddy 负责 HTTPS
- AiHubMix 提供 LLM / STT / TTS
- 腾讯云 COS 存语音文件
- 腾讯云 SES SMTP 发送 magic link 登录邮件

这条路线不要求中国大陆备案，适合先上线、先给真实用户试用。

## 前置准备

你需要先准备好以下资源：

- 1 台腾讯云香港 Lighthouse，推荐 `2C4G Ubuntu 24.04 LTS`
- 1 个已实名认证的域名
- 1 个 AiHubMix API Key
- 1 个腾讯云 COS 私有桶
- 1 组腾讯云 COS SecretId / SecretKey
- 1 个腾讯云 SES 已验证发信域名和 SMTP 凭证

## 云服务配置

### 1. 域名和 DNS

- 给 `app.example.com` 添加 `A` 记录，指向 Lighthouse 公网 IP
- 如果邮件域名单独管理，建议再准备 `mail.example.com`

### 2. AiHubMix

- 在 AiHubMix 控制台生成 API Key
- 推荐模型：
  - `AI_CHAT_MODEL=gemini-2.5-flash-lite`
  - `AI_STT_MODEL=whisper-1`
  - `AI_TTS_MODEL=gpt-4o-mini-tts`

### 3. 腾讯云 COS

- 地域选 `ap-hongkong`
- 桶权限选 `私有读写`
- 记录以下参数：
  - `S3_ENDPOINT`
  - `S3_REGION`
  - `S3_BUCKET`
  - `S3_ACCESS_KEY_ID`
  - `S3_SECRET_ACCESS_KEY`

COS 还要补一个浏览器播放音频必须的 CORS 规则：

- AllowedOrigin: `https://app.example.com`
- AllowedMethod: `GET`, `HEAD`
- AllowedHeader: `*`
- ExposeHeader: `ETag`
- MaxAgeSeconds: `3600`

### 4. 腾讯云 SES SMTP

- 完成发信域名验证
- 按控制台提示补齐 SPF / DKIM / DMARC
- 开启 SMTP 服务并生成 SMTP 用户名和密码
- 记录：
  - `SMTP_HOST`
  - `SMTP_PORT`
  - `SMTP_USER`
  - `SMTP_PASS`
  - `SMTP_FROM_EMAIL`

## 服务器初始化

在服务器上执行：

```bash
sudo apt update
sudo apt install -y ca-certificates curl git
curl -fsSL https://get.docker.com | sh
sudo usermod -aG docker $USER
newgrp docker
docker --version
docker compose version
```

## 获取代码

建议部署到 `/opt/ai-tutor`：

```bash
sudo mkdir -p /opt/ai-tutor
sudo chown $USER:$USER /opt/ai-tutor
git clone https://github.com/ly-rrrrr/ai-tutor.git /opt/ai-tutor
cd /opt/ai-tutor
```

默认按主分支部署：

```bash
git checkout main
git pull --ff-only
```

## 生产环境文件

复制模板：

```bash
cp .env.production.example .env.production
```

然后至少填这几项：

- `APP_DOMAIN`
- `APP_ORIGIN`
- `MYSQL_PASSWORD`
- `MYSQL_ROOT_PASSWORD`
- `DATABASE_URL`
- `BETTER_AUTH_SECRET`
- `AI_API_KEY`
- `S3_ENDPOINT`
- `S3_REGION`
- `S3_BUCKET`
- `S3_ACCESS_KEY_ID`
- `S3_SECRET_ACCESS_KEY`
- `SMTP_HOST`
- `SMTP_PORT`
- `SMTP_USER`
- `SMTP_PASS`
- `SMTP_FROM_EMAIL`

注意：

- `DATABASE_URL` 里的密码必须和 `MYSQL_PASSWORD` 一致
- `APP_ORIGIN` 必须是公网 HTTPS 域名，例如 `https://app.example.com`

## 首次部署

先检查 Compose 配置能否展开：

```bash
docker compose --env-file .env.production config
```

先启动 MySQL：

```bash
docker compose --env-file .env.production up -d mysql
```

等待 MySQL 变成 healthy：

```bash
docker compose --env-file .env.production ps
```

执行数据库迁移：

```bash
docker compose --env-file .env.production run --rm app pnpm db:deploy
```

然后启动全栈：

```bash
docker compose --env-file .env.production up -d --build
```

查看服务状态：

```bash
docker compose --env-file .env.production ps
docker compose --env-file .env.production logs -f app
```

## 上线后验证

先看健康检查：

```bash
curl https://app.example.com/healthz
```

预期返回：

```json
{"ok":true}
```

再做一轮人工烟测：

- 输入陌生邮箱，确认能收到 magic link
- 点击 magic link 后能登录
- 能创建 free conversation
- 能创建 scenario conversation
- 能发送文本消息并收到 AI 回复
- 能上传英语录音并成功转写
- 能播放 AI TTS 音频
- 刷新后历史消息仍存在
- 历史音频仍能播放

## 常用运维命令

重新拉起服务：

```bash
docker compose --env-file .env.production up -d --build
```

查看应用日志：

```bash
docker compose --env-file .env.production logs -f app
```

查看 Caddy 日志：

```bash
docker compose --env-file .env.production logs -f caddy
```

查看 MySQL 日志：

```bash
docker compose --env-file .env.production logs -f mysql
```

手动执行迁移：

```bash
docker compose --env-file .env.production run --rm app pnpm db:deploy
```

## 低成本备份建议

当前方案不引入额外付费服务，最小可行做法是定期导出数据库：

```bash
docker compose --env-file .env.production exec mysql \
  sh -lc 'mysqldump -uroot -p"$MYSQL_ROOT_PASSWORD" --databases ai_tutor' \
  > backup-$(date +%F).sql
```

再把导出的 `.sql` 文件手动拉回你自己的电脑。

## 已知边界

- 单机部署，不具备高可用
- COS 没有接 CDN，大陆访问速度一般
- 只做了进程内限流，不是专业风控
- 不做自动告警，需要你自己看日志和健康检查
