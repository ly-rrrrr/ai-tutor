# AI Tutor Cloudflare Tunnel Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Publish the existing Dockerized `ai-tutor` stack through Cloudflare Tunnel so `pumpkinwy.online` is reachable without inbound campus-network IPv4 access.

**Architecture:** Keep `app`, `mysql`, and `caddy` as the local stack. Reconfigure `caddy` to serve internal HTTP only, then add a `cloudflared` container that establishes an outbound-only tunnel from Docker to Cloudflare using a tunnel token and forwards public traffic to `caddy`.

**Tech Stack:** Docker Compose, Caddy, Cloudflare Tunnel (`cloudflared`), MySQL 8.4, Node application container

---

### Task 1: Rework the local edge for tunnel mode

**Files:**
- Modify: `Caddyfile`
- Modify: `docker-compose.yml`
- Modify: `.env.production.example`

- [ ] **Step 1: Write the failing configuration expectation**

Document the desired Compose surface before editing files:

```text
We need:
- caddy listening only on container port 80 with no public ACME/TLS dependency
- optional host port publishing disabled by default
- a new cloudflared service with env-driven tunnel settings
- env examples for host bind paths and Cloudflare tunnel variables
```

- [ ] **Step 2: Verify the current configuration does not meet the target**

Run:

```bash
sed -n '1,120p' Caddyfile
sed -n '1,220p' docker-compose.yml
sed -n '1,220p' .env.production.example
```

Expected:

```text
Caddyfile uses {$APP_DOMAIN} as a public HTTPS site label
docker-compose.yml publishes 80:80 and 443:443 from caddy
.env.production.example has no Cloudflare tunnel settings
```

- [ ] **Step 3: Replace Caddy public-HTTPS config with internal HTTP-only proxying**

Update `Caddyfile` to:

```caddy
:80 {
  encode gzip zstd

  reverse_proxy app:3000

  header {
    Strict-Transport-Security "max-age=31536000; includeSubDomains; preload"
    X-Content-Type-Options "nosniff"
    Referrer-Policy "strict-origin-when-cross-origin"
    X-Frame-Options "SAMEORIGIN"
  }
}
```

- [ ] **Step 4: Add tunnel-aware Compose wiring**

Update `docker-compose.yml` so:

```yaml
services:
  mysql:
    volumes:
      - ${MYSQL_DATA_DIR:-./.docker/mysql}:/var/lib/mysql

  caddy:
    expose:
      - "80"
    ports:
      - "${CADDY_HTTP_BIND:-127.0.0.1:80}:80"
    volumes:
      - ./Caddyfile:/etc/caddy/Caddyfile:ro
      - ${CADDY_DATA_DIR:-./.docker/caddy/data}:/data
      - ${CADDY_CONFIG_DIR:-./.docker/caddy/config}:/config

  cloudflared:
    image: cloudflare/cloudflared:latest
    restart: unless-stopped
    env_file:
      - .env.production
    depends_on:
      caddy:
        condition: service_started
    command:
      - tunnel
      - --no-autoupdate
      - run
      - --token
      - ${CLOUDFLARE_TUNNEL_TOKEN}
```

- [ ] **Step 5: Add environment examples for host data and tunnel settings**

Append these keys to `.env.production.example`:

```env
MYSQL_DATA_DIR=/mnt/data/ai-tutor/mysql
CADDY_DATA_DIR=/mnt/data/ai-tutor/caddy/data
CADDY_CONFIG_DIR=/mnt/data/ai-tutor/caddy/config
CADDY_HTTP_BIND=127.0.0.1:80

CLOUDFLARE_TUNNEL_TOKEN=replace-with-cloudflare-tunnel-token
```

- [ ] **Step 6: Run Compose rendering to verify the structure**

Run:

```bash
docker compose --env-file .env.production config
```

Expected:

```text
Rendered config includes cloudflared service, caddy only publishes port 80, and bind-mounted host data paths
```

- [ ] **Step 7: Commit the edge/tunnel configuration changes**

```bash
git add Caddyfile docker-compose.yml .env.production.example
git commit -m "feat: add tunnel-ready local edge configuration"
```

### Task 2: Add Cloudflare tunnel deployment docs

**Files:**
- Create: `docs/deployment/cloudflare-tunnel-ubuntu.md`

- [ ] **Step 1: Write the failing documentation/config expectation**

Document the two missing artifacts:

```text
We need:
- one deployment guide that tells the operator exactly which Cloudflare dashboard actions remain manual
- an explicit token-based Docker run path that matches Cloudflare's official container workflow
```

- [ ] **Step 2: Verify the files do not yet exist**

Run:

```bash
test -f docs/deployment/cloudflare-tunnel-ubuntu.md || echo missing-cloudflare-doc
```

Expected:

```text
missing-cloudflare-doc
```

- [ ] **Step 3: Write the Ubuntu deployment guide**

Create `docs/deployment/cloudflare-tunnel-ubuntu.md` covering:

```md
# Ubuntu + Cloudflare Tunnel 部署

1. 把域名 `pumpkinwy.online` 接入 Cloudflare
2. 在 Cloudflare Zero Trust 创建一个 tunnel
3. 复制 Cloudflare 提供的 tunnel token
4. 在 Cloudflare 为 `${APP_DOMAIN}` 绑定 Public Hostname，service 为 `http://caddy:80`
5. 准备 `.env.production`
6. 启动 `mysql`
7. 运行 `pnpm db:deploy`
8. 启动 `app caddy cloudflared`
9. 验证 `https://${APP_DOMAIN}/healthz`
```

- [ ] **Step 4: Verify the deployment guide references the official token flow**

Run:

```bash
rg -n "token|Zero Trust|Public Hostname|cloudflared" docs/deployment/cloudflare-tunnel-ubuntu.md
```

Expected:

```text
The guide explicitly tells the operator to create a Cloudflare tunnel, copy the tunnel token, bind the hostname, and start Docker with that token
```

- [ ] **Step 5: Commit the tunnel docs**

```bash
git add docs/deployment/cloudflare-tunnel-ubuntu.md
git commit -m "docs: add cloudflare tunnel deployment guide"
```

### Task 3: Apply the deployment locally and verify the local stack

**Files:**
- Modify: `.env.production` (local-only, not committed)

- [ ] **Step 1: Prepare local-only production variables**

Ensure `.env.production` contains:

```env
APP_DOMAIN=pumpkinwy.online
APP_ORIGIN=https://pumpkinwy.online
MYSQL_DATA_DIR=/home/yea/data/ai-tutor/mysql
CADDY_DATA_DIR=/home/yea/data/ai-tutor/caddy/data
CADDY_CONFIG_DIR=/home/yea/data/ai-tutor/caddy/config
CADDY_HTTP_BIND=127.0.0.1:80
CLOUDFLARE_TUNNEL_TOKEN=the token copied from the Cloudflare tunnel setup screen
```

- [ ] **Step 2: Prepare local directories**

Run:

```bash
mkdir -p /home/yea/data/ai-tutor/mysql
mkdir -p /home/yea/data/ai-tutor/caddy/data
mkdir -p /home/yea/data/ai-tutor/caddy/config
```

Expected:

```text
Directories exist with no errors
```

- [ ] **Step 3: Re-render Compose using the real local env**

Run:

```bash
docker compose --env-file .env.production config >/tmp/ai-tutor.compose.rendered.yml
sed -n '1,240p' /tmp/ai-tutor.compose.rendered.yml
```

Expected:

```text
Rendered config shows cloudflared with the real tunnel token command and caddy bound to 127.0.0.1:80 only
```

- [ ] **Step 4: Restart the local stack**

Run:

```bash
docker compose --env-file .env.production up -d mysql
docker compose --env-file .env.production run --rm app pnpm db:deploy
docker compose --env-file .env.production up -d --build app caddy cloudflared
```

Expected:

```text
mysql, app, caddy, and cloudflared start successfully
```

- [ ] **Step 5: Verify local health before public cutover**

Run:

```bash
docker compose --env-file .env.production ps
curl -I -H 'Host: pumpkinwy.online' http://127.0.0.1/healthz
docker compose --env-file .env.production logs --tail=100 cloudflared
```

Expected:

```text
app and mysql healthy
caddy running
cloudflared connected or waiting only on Cloudflare-side hostname binding
local health endpoint responds through caddy
```

- [ ] **Step 6: Verify public access after Cloudflare hostname binding**

Run:

```bash
curl -I https://pumpkinwy.online/healthz
```

Expected:

```text
HTTP/2 200
```

- [ ] **Step 7: Commit only repository changes**

```bash
git add Caddyfile docker-compose.yml .env.production.example docs/deployment/cloudflare-tunnel-ubuntu.md
git commit -m "feat: support cloudflare tunnel deployment"
```
