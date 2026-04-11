<div align="center">

# AI Tutor

AI-powered English speaking practice platform with scenario courses, voice conversations, learning analytics, guest access, and production-ready Docker deployment.

AI 英语口语陪练平台，支持场景课程、语音对话、学习看板、游客模式，以及可直接上线的 Docker 部署方案。

[![GitHub stars](https://img.shields.io/github/stars/ly-rrrrr/ai-tutor?style=flat-square)](https://github.com/ly-rrrrr/ai-tutor/stargazers)
[![GitHub forks](https://img.shields.io/github/forks/ly-rrrrr/ai-tutor?style=flat-square)](https://github.com/ly-rrrrr/ai-tutor/forks)
[![GitHub issues](https://img.shields.io/github/issues/ly-rrrrr/ai-tutor?style=flat-square)](https://github.com/ly-rrrrr/ai-tutor/issues)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg?style=flat-square)](package.json)
[![Made with TypeScript](https://img.shields.io/badge/TypeScript-5.9-blue?style=flat-square)](https://www.typescriptlang.org/)

[Live Demo](https://pumpkinwy.online) · [中文](#中文指南) · [English](#english-guide) · [Deployment](docs/deployment/ubuntu-production-runbook.md)

</div>

## 中文指南

### 项目简介

AI Tutor 是一个面向英语学习者的 AI 口语练习系统。用户可以选择真实场景课程，也可以直接进入自由对话，与 AI 英语老师进行文本或语音交流。系统会保存学习记录、对话历史，并提供学习看板，适合个人学习、课程原型、AI 教育产品验证和二次开发。

在线体验地址：

```text
https://pumpkinwy.online
```

体验站点用于展示产品能力，服务配置可能随开发阶段调整。请不要在公开体验站点输入敏感个人信息。

### 核心功能

- AI 英语对话：支持自由对话和场景化口语练习。
- 真实场景课程：覆盖日常、旅行、商务、学术、社交等练习场景。
- 语音输入与语音输出：支持语音转文字、AI 回复、TTS 音频播放和音频持久化。
- 学习看板：跟踪学习记录、练习历史、统计数据和推荐内容。
- 用户系统：支持用户名/邮箱登录、密码注册、邮箱验证码、人机验证配置。
- 游客模式：邮件服务未配置时仍可开放核心体验，可通过环境变量关闭。
- 生产部署：内置 Docker Compose、MySQL、Caddy、Cloudflare Tunnel 部署路径。
- 邮件服务：支持 SMTP 和腾讯云 SES API，适配个人账号无法使用腾讯云 SMTP 的场景。
- 对象存储：支持 S3 兼容存储，用于音频文件等持久化资源。

### 技术栈

- 前端：React 19、Vite、TypeScript、Tailwind CSS、Radix UI、Wouter、TanStack Query。
- 后端：Node.js、Express、tRPC、Better Auth、Zod。
- 数据库：MySQL 8.4、Drizzle ORM、Drizzle Kit。
- AI 能力：OpenAI-compatible API、语音识别、文本生成、文本转语音。
- 部署：Docker Compose、Caddy、Cloudflare Tunnel。
- 测试：Vitest、Testing Library、jsdom。

### 在线体验使用指南

访问：

```text
https://pumpkinwy.online
```

使用流程：

1. 打开首页，点击 Get Started。
2. 如果游客模式已开启，可以直接进入应用体验核心功能。
3. 如果邮件服务已配置，可以使用用户名/邮箱和密码登录。
4. 新用户注册时填写用户名、邮箱、密码和验证码。
5. 进入应用后，可以选择 Free Conversation 开始自由对话。
6. 也可以进入 Courses 页面，选择一个真实场景课程。
7. 在对话页中输入文字或使用语音进行练习。
8. 在 History 页面查看历史对话。
9. 在 Dashboard 页面查看学习统计和推荐内容。

### 本地开发指南

前置要求：

- Node.js 20.19+ 或 22.12+。
- pnpm 10.x。
- Docker 和 Docker Compose。
- MySQL 8.4，推荐直接使用本仓库的 Compose 配置启动。

克隆仓库：

```bash
git clone git@github.com:ly-rrrrr/ai-tutor.git
cd ai-tutor
```

安装依赖：

```bash
corepack enable
pnpm install
```

准备环境变量：

```bash
cp .env.production.example .env.production
```

至少需要配置：

```text
APP_DOMAIN
APP_ORIGIN
DATABASE_URL
MYSQL_PASSWORD
MYSQL_ROOT_PASSWORD
BETTER_AUTH_SECRET
AI_BASE_URL
AI_API_KEY
S3_ENDPOINT
S3_BUCKET
S3_REGION
S3_ACCESS_KEY_ID
S3_SECRET_ACCESS_KEY
EMAIL_PROVIDER
```

如果只是本地试跑，可以先设置：

```env
EMAIL_PROVIDER=disabled
GUEST_ACCESS_ENABLED=true
```

启动数据库：

```bash
docker compose --env-file .env.production up -d mysql
```

执行数据库迁移：

```bash
docker compose --env-file .env.production run --rm app pnpm db:deploy
```

启动开发服务：

```bash
pnpm dev
```

运行测试：

```bash
pnpm test
```

类型检查：

```bash
pnpm check
```

生产构建：

```bash
pnpm build
```

### Docker 部署指南

生产部署目录建议使用独立目录，例如：

```text
/home/yea/ai-tutor-deploy
```

首次启动：

```bash
cd /home/yea/ai-tutor-deploy
sg docker -c 'docker compose --env-file .env.production -f docker-compose.yml build app'
sg docker -c 'docker compose --env-file .env.production -f docker-compose.yml up -d mysql'
sg docker -c 'docker compose --env-file .env.production -f docker-compose.yml run --rm app pnpm db:deploy'
sg docker -c 'docker compose --env-file .env.production -f docker-compose.yml up -d'
```

服务器重启后快速恢复：

```bash
cd /home/yea/ai-tutor-deploy
sg docker -c 'docker compose --env-file .env.production -f docker-compose.yml up -d'
sg docker -c 'docker compose --env-file .env.production -f docker-compose.yml ps'
curl -I https://pumpkinwy.online/healthz
```

从 GitHub 拉取新代码并重新部署：

```bash
cd /home/yea/ai-tutor-deploy
git pull
sg docker -c 'docker compose --env-file .env.production -f docker-compose.yml build app'
sg docker -c 'docker compose --env-file .env.production -f docker-compose.yml run --rm app pnpm db:deploy'
sg docker -c 'docker compose --env-file .env.production -f docker-compose.yml up -d'
curl -I https://pumpkinwy.online/healthz
```

查看服务状态：

```bash
cd /home/yea/ai-tutor-deploy
sg docker -c 'docker compose --env-file .env.production -f docker-compose.yml ps'
```

查看应用日志：

```bash
cd /home/yea/ai-tutor-deploy
sg docker -c 'docker compose --env-file .env.production -f docker-compose.yml logs -f app'
```

更完整的生产运维说明见：

```text
docs/deployment/ubuntu-production-runbook.md
docs/deployment/cloudflare-tunnel-ubuntu.md
```

### 环境变量说明

认证和站点：

```text
APP_DOMAIN
APP_ORIGIN
BETTER_AUTH_SECRET
GUEST_ACCESS_ENABLED
CLOUDFLARE_TURNSTILE_SITE_KEY
CLOUDFLARE_TURNSTILE_SECRET_KEY
```

数据库：

```text
MYSQL_PASSWORD
MYSQL_ROOT_PASSWORD
MYSQL_DATA_DIR
DATABASE_URL
```

AI 服务：

```text
AI_BASE_URL
AI_API_KEY
AI_CHAT_MODEL
AI_STT_MODEL
AI_TTS_MODEL
```

对象存储：

```text
S3_ENDPOINT
S3_REGION
S3_BUCKET
S3_ACCESS_KEY_ID
S3_SECRET_ACCESS_KEY
S3_PUBLIC_BASE_URL
```

邮件服务：

```text
EMAIL_PROVIDER
EMAIL_FROM
SMTP_HOST
SMTP_PORT
SMTP_USER
SMTP_PASS
TENCENT_SES_SECRET_ID
TENCENT_SES_SECRET_KEY
TENCENT_SES_REGION
TENCENT_SES_VERIFICATION_OTP_TEMPLATE_ID
```

Cloudflare Tunnel：

```text
CLOUDFLARE_TUNNEL_TOKEN
```

### 安全说明

- 不要提交 `.env.production`。
- 不要提交腾讯云密钥、S3 密钥、AI API Key、数据库密码或 Cloudflare Tunnel Token。
- 公开体验站点建议开启限流、人机验证和游客访问隔离。
- 生产环境建议使用 Cloudflare Tunnel 或反向代理，不要直接暴露数据库端口。
- 如果密钥曾经出现在聊天、截图或公开仓库中，应立即在云平台轮换。

### 常见问题

如果 GitHub 无法连接：

```bash
git remote -v
git ls-remote origin HEAD
```

如果 Docker 服务未启动：

```bash
sudo systemctl enable --now docker
```

如果网站不可访问：

```bash
cd /home/yea/ai-tutor-deploy
sg docker -c 'docker compose --env-file .env.production -f docker-compose.yml ps'
sg docker -c 'docker compose --env-file .env.production -f docker-compose.yml logs --tail=100 app'
sg docker -c 'docker compose --env-file .env.production -f docker-compose.yml logs --tail=100 cloudflared'
curl -I https://pumpkinwy.online/healthz
```

如果邮件验证码不可用：

```text
EMAIL_PROVIDER=disabled
GUEST_ACCESS_ENABLED=true
```

这样可以先开放游客体验，再等待邮件服务配置完成。

### Star History

<picture>
  <source
    media="(prefers-color-scheme: dark)"
    srcset="https://api.star-history.com/svg?repos=ly-rrrrr/ai-tutor&type=Date&theme=dark"
  />
  <source
    media="(prefers-color-scheme: light)"
    srcset="https://api.star-history.com/svg?repos=ly-rrrrr/ai-tutor&type=Date"
  />
  <img
    alt="Star History Chart"
    src="https://api.star-history.com/svg?repos=ly-rrrrr/ai-tutor&type=Date"
  />
</picture>

### 贡献指南

推荐开发流程：

1. 从 `main` 创建功能分支。
2. 修改代码并补充测试。
3. 执行 `pnpm test`、`pnpm check`、`pnpm build`。
4. 提交 Pull Request。
5. 合并后在部署目录拉取最新 `main` 并重新部署。

提交前检查：

```bash
pnpm test
pnpm check
pnpm build
```

### License

MIT. See `package.json`.

## English Guide

### Overview

AI Tutor is an AI-powered English speaking practice platform. Learners can choose real-world scenarios or start free conversations with an AI tutor. The app supports text chat, voice practice, learning history, dashboard analytics, guest access, email verification, and production deployment with Docker.

Live demo:

```text
https://pumpkinwy.online
```

The demo site is intended for product exploration. Do not enter sensitive personal information on a public demo instance.

### Features

- AI English tutor for free conversation and scenario-based speaking practice.
- Real-world course scenarios for daily life, travel, business, academic, and social contexts.
- Speech-to-text, text-to-speech, audio playback, and durable audio storage.
- Learning dashboard with history, statistics, and personalized recommendations.
- Username/email login, password registration, email OTP verification, and Turnstile support.
- Optional guest mode for public demos and email-provider downtime.
- Production-ready Docker Compose setup with MySQL, Caddy, and Cloudflare Tunnel.
- Email delivery through SMTP or Tencent Cloud SES API.
- S3-compatible object storage for generated or uploaded audio assets.

### Tech Stack

- Frontend: React 19, Vite, TypeScript, Tailwind CSS, Radix UI, Wouter, TanStack Query.
- Backend: Node.js, Express, tRPC, Better Auth, Zod.
- Database: MySQL 8.4, Drizzle ORM, Drizzle Kit.
- AI: OpenAI-compatible APIs, speech recognition, text generation, text-to-speech.
- Deployment: Docker Compose, Caddy, Cloudflare Tunnel.
- Testing: Vitest, Testing Library, jsdom.

### Product Usage

Open the demo:

```text
https://pumpkinwy.online
```

User flow:

1. Open the homepage and click Get Started.
2. Use guest access if it is enabled.
3. Sign in with username/email and password when email auth is configured.
4. Register with username, email, password, email OTP, and captcha verification.
5. Start a Free Conversation from the app home screen.
6. Browse Courses and choose a real-world scenario.
7. Practice by typing or speaking in the conversation view.
8. Review previous conversations in History.
9. Track learning progress in Dashboard.

### Local Development

Requirements:

- Node.js 20.19+ or 22.12+.
- pnpm 10.x.
- Docker and Docker Compose.
- MySQL 8.4, preferably started through the included Compose file.

Clone the repository:

```bash
git clone git@github.com:ly-rrrrr/ai-tutor.git
cd ai-tutor
```

Install dependencies:

```bash
corepack enable
pnpm install
```

Create the environment file:

```bash
cp .env.production.example .env.production
```

For a quick local trial, disable email and enable guest access:

```env
EMAIL_PROVIDER=disabled
GUEST_ACCESS_ENABLED=true
```

Start MySQL:

```bash
docker compose --env-file .env.production up -d mysql
```

Run migrations:

```bash
docker compose --env-file .env.production run --rm app pnpm db:deploy
```

Start the development server:

```bash
pnpm dev
```

Run checks:

```bash
pnpm test
pnpm check
pnpm build
```

### Production Deployment

The production deployment directory can be separate from the development checkout:

```text
/home/yea/ai-tutor-deploy
```

Start all services:

```bash
cd /home/yea/ai-tutor-deploy
sg docker -c 'docker compose --env-file .env.production -f docker-compose.yml up -d'
```

Check status:

```bash
cd /home/yea/ai-tutor-deploy
sg docker -c 'docker compose --env-file .env.production -f docker-compose.yml ps'
curl -I https://pumpkinwy.online/healthz
```

Deploy new code from GitHub:

```bash
cd /home/yea/ai-tutor-deploy
git pull
sg docker -c 'docker compose --env-file .env.production -f docker-compose.yml build app'
sg docker -c 'docker compose --env-file .env.production -f docker-compose.yml run --rm app pnpm db:deploy'
sg docker -c 'docker compose --env-file .env.production -f docker-compose.yml up -d'
curl -I https://pumpkinwy.online/healthz
```

Detailed deployment documents:

```text
docs/deployment/ubuntu-production-runbook.md
docs/deployment/cloudflare-tunnel-ubuntu.md
```

### Security

- Never commit `.env.production`.
- Never commit cloud provider secrets, database passwords, AI API keys, or tunnel tokens.
- Enable rate limiting, captcha, and proper cookie settings for public deployments.
- Keep MySQL bound to localhost or an internal Docker network.
- Rotate any secret that was ever exposed in chat logs, screenshots, or public repositories.

### Contributing

Suggested workflow:

1. Create a feature branch from `main`.
2. Implement the change and add tests.
3. Run `pnpm test`, `pnpm check`, and `pnpm build`.
4. Open a Pull Request.
5. Deploy from the merged `main` branch.

### Star History

<picture>
  <source
    media="(prefers-color-scheme: dark)"
    srcset="https://api.star-history.com/svg?repos=ly-rrrrr/ai-tutor&type=Date&theme=dark"
  />
  <source
    media="(prefers-color-scheme: light)"
    srcset="https://api.star-history.com/svg?repos=ly-rrrrr/ai-tutor&type=Date"
  />
  <img
    alt="Star History Chart"
    src="https://api.star-history.com/svg?repos=ly-rrrrr/ai-tutor&type=Date"
  />
</picture>

### License

MIT. See `package.json`.
