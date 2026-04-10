# Ubuntu + Cloudflare Tunnel 部署

这份文档用于把运行在 Ubuntu 主机上的 `ai-tutor` 通过 Cloudflare Tunnel 发布到公网。

适用场景：

- 主机位于校园网、实验室、家宽、NAT 或没有可控公网 IPv4 入站
- Docker 已安装可用
- 域名愿意接入 Cloudflare

## 方案说明

公网流量路径如下：

`浏览器 -> Cloudflare -> Cloudflare Tunnel -> 本机 cloudflared -> caddy -> app`

这个方案只要求主机可以主动连出互联网，不要求公网 `80/443` 能直接打到主机。

## 前置条件

1. 域名 `pumpkinwy.online` 已接入 Cloudflare
2. 本机可以访问 Cloudflare
3. 本机已经安装 Docker
4. 项目根目录已准备好 `.env.production`

Cloudflare 官方说明：

- Setup: https://developers.cloudflare.com/tunnel/setup/

文档中明确要求：

- 发布应用必须使用 Cloudflare 托管的域名
- 如果服务器在受限网络后面，需要确保它能主动连到 Cloudflare
- Docker 运行 tunnel 的官方方式是 `cloudflared tunnel --no-autoupdate run --token <TUNNEL_TOKEN>`

## Cloudflare 侧步骤

### 1. 把域名托管到 Cloudflare

如果 `pumpkinwy.online` 还在 DNSPod 或其他 DNS 提供商处，需要先把 NS 改到 Cloudflare。

### 2. 创建 Tunnel

进入 Cloudflare Dashboard：

- `Zero Trust`
- `Networks`
- `Tunnels`
- `Create a tunnel`

创建完成后，在安装页面选择：

- Environment: `Docker`

Cloudflare 会给出类似命令：

```bash
docker run cloudflare/cloudflared:latest tunnel --no-autoupdate run --token <TUNNEL_TOKEN>
```

复制其中的 `<TUNNEL_TOKEN>`，稍后填入 `.env.production`。

### 3. 绑定公网域名

在刚创建的 tunnel 页面中添加 `Public Hostname`：

- Hostname: `pumpkinwy.online`
- Service Type: `HTTP`
- URL: `http://caddy:80`

如果你还要 `www.pumpkinwy.online`，可以再单独加一条：

- Hostname: `www.pumpkinwy.online`
- Service Type: `HTTP`
- URL: `http://caddy:80`

## 本机环境变量

生产环境至少需要这些关键项：

```env
APP_DOMAIN=pumpkinwy.online
APP_ORIGIN=https://pumpkinwy.online

MYSQL_DATA_DIR=/home/yea/data/ai-tutor/mysql
CADDY_DATA_DIR=/home/yea/data/ai-tutor/caddy/data
CADDY_CONFIG_DIR=/home/yea/data/ai-tutor/caddy/config
CADDY_HTTP_BIND=127.0.0.1:80

EMAIL_PROVIDER=disabled
GUEST_ACCESS_ENABLED=true

CLOUDFLARE_TUNNEL_TOKEN=把 Cloudflare Tunnel 页面复制出来的 token 填到这里
```

说明：

- `EMAIL_PROVIDER=disabled` 允许站点先上线，登录邮件后续再恢复
- `GUEST_ACCESS_ENABLED=true` 时，每个浏览器会自动获得一个独立 guest 身份，可以继续使用会话、语音、历史和看板等核心功能
- `CADDY_HTTP_BIND=127.0.0.1:80` 只把本机 HTTP 入口绑到回环地址，避免再依赖公网入站

## 首次启动

### 1. 准备目录

```bash
mkdir -p /home/yea/data/ai-tutor/mysql
mkdir -p /home/yea/data/ai-tutor/caddy/data
mkdir -p /home/yea/data/ai-tutor/caddy/config
```

### 2. 准备环境文件

```bash
cp .env.production.example .env.production
```

把真实值填进去，至少包括：

- `APP_DOMAIN`
- `APP_ORIGIN`
- `MYSQL_PASSWORD`
- `MYSQL_ROOT_PASSWORD`
- `DATABASE_URL`
- `BETTER_AUTH_SECRET`
- `AI_API_KEY`
- `S3_*`
- `EMAIL_PROVIDER=disabled`
- `GUEST_ACCESS_ENABLED=true`
- `CLOUDFLARE_TUNNEL_TOKEN`

### 3. 检查 Compose 渲染结果

```bash
docker compose --env-file .env.production config
```

预期：

- 出现 `cloudflared` 服务
- `caddy` 只绑定 `127.0.0.1:80`

### 4. 启动数据库

```bash
docker compose --env-file .env.production up -d mysql
```

### 5. 执行数据库迁移

```bash
docker compose --env-file .env.production run --rm app pnpm db:deploy
```

### 6. 启动应用、反向代理和 tunnel

```bash
docker compose --env-file .env.production up -d --build app caddy cloudflared
```

## 验证

### 本机验证

```bash
docker compose --env-file .env.production ps
curl -I -H 'Host: pumpkinwy.online' http://127.0.0.1/healthz
docker compose --env-file .env.production logs --tail=100 cloudflared
```

预期：

- `app` 和 `mysql` 为健康状态
- `caddy` 正常运行
- `cloudflared` 已连接 Cloudflare

### 公网验证

```bash
curl -I https://pumpkinwy.online/healthz
```

预期：

```text
HTTP/2 200
```

## 常见问题

### 1. `cloudflared` 容器启动失败

先检查：

- `CLOUDFLARE_TUNNEL_TOKEN` 是否为空
- tunnel 是否已经在 Cloudflare 创建
- 本机是否能主动访问 Cloudflare

### 2. 域名访问仍然失败

先确认：

- 域名 NS 是否已经切到 Cloudflare
- tunnel 页面中的 `Public Hostname` 是否是 `pumpkinwy.online`
- `cloudflared` 日志里是否显示连接成功

### 3. 站点能访问，但不能登录

如果 `.env.production` 中是：

```env
EMAIL_PROVIDER=disabled
```

这是预期行为。表示站点先上线，邮件登录功能等待 SMTP 或腾讯 SES 模板审核完成后再恢复。

如果你希望在邮件登录恢复前继续使用核心功能，再加上：

```env
GUEST_ACCESS_ENABLED=true
```

行为说明：

- 每个浏览器会获得单独的 guest cookie，不会共用同一个账号
- guest 用户默认是普通用户，不具备 admin 权限
- 点击退出会清空当前 guest cookie；下次访问会分配一个新的 guest 身份
- 这是临时过渡方案，邮件登录恢复后建议关闭
