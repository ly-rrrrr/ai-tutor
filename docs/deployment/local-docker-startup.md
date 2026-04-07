# 本机 Docker 启动命令

这份文档对应当前项目在本机 Windows + Docker Desktop 下的联调方式。

本机联调额外使用两个本地文件：

- `.env.production`
- `docker-compose.local.yml`

它们都不应提交到 Git。

## 前置条件

1. 启动 Docker Desktop
2. 进入项目目录

```powershell
cd "d:\Yea_googledownload\manus projects\AI English teacher\ai-tutor-final-v5\ai-tutor\.worktrees\feat-ai-gateway"
```

## 本机使用的端口

为了避开你电脑上已经占用的端口，本机联调用的是：

- Web: `https://localhost:8443`
- HTTP: `http://localhost:8080`
- MySQL: `127.0.0.1:3307`

## 首次启动

### 1. 准备本地环境文件

如果 `.env.production` 不存在，先从模板复制：

```powershell
Copy-Item ".env.production.example" ".env.production"
```

然后把真实值填进去，至少包括：

- `APP_DOMAIN=localhost`
- `APP_ORIGIN=https://localhost:8443`
- `AI_API_KEY`
- `MYSQL_PASSWORD`
- `MYSQL_ROOT_PASSWORD`
- `DATABASE_URL`
- `S3_*`
- `SMTP_*`

### 2. 准备本机端口覆盖文件

如果 `docker-compose.local.yml` 不存在，内容如下：

```yaml
services:
  mysql:
    ports: !override
      - "127.0.0.1:3307:3306"

  caddy:
    ports: !override
      - "8080:80"
      - "8443:443"
```

### 3. 构建应用镜像

```powershell
docker compose -f docker-compose.yml -f docker-compose.local.yml --env-file .env.production build app
```

### 4. 启动数据库

```powershell
docker compose -f docker-compose.yml -f docker-compose.local.yml --env-file .env.production up -d mysql
```

### 5. 执行数据库迁移

```powershell
docker compose -f docker-compose.yml -f docker-compose.local.yml --env-file .env.production run --rm app pnpm db:deploy
```

### 6. 启动应用和反向代理

```powershell
docker compose -f docker-compose.yml -f docker-compose.local.yml --env-file .env.production up -d app caddy
```

### 7. 检查服务状态

```powershell
docker compose -f docker-compose.yml -f docker-compose.local.yml --env-file .env.production ps
```

### 8. 检查健康接口

```powershell
curl.exe -k https://localhost:8443/healthz
```

预期返回：

```json
{"ok":true}
```

## 日常启动

如果镜像已经构建过，平时直接执行：

```powershell
docker compose -f docker-compose.yml -f docker-compose.local.yml --env-file .env.production up -d
```

## 查看日志

查看全部日志：

```powershell
docker compose -f docker-compose.yml -f docker-compose.local.yml --env-file .env.production logs -f
```

只看应用：

```powershell
docker compose -f docker-compose.yml -f docker-compose.local.yml --env-file .env.production logs -f app
```

只看数据库：

```powershell
docker compose -f docker-compose.yml -f docker-compose.local.yml --env-file .env.production logs -f mysql
```

只看反向代理：

```powershell
docker compose -f docker-compose.yml -f docker-compose.local.yml --env-file .env.production logs -f caddy
```

## 停止服务

停止并移除容器、网络，但保留数据库卷：

```powershell
docker compose -f docker-compose.yml -f docker-compose.local.yml --env-file .env.production down
```

## 完全重置

如果你要把本机容器数据一并清空：

```powershell
docker compose -f docker-compose.yml -f docker-compose.local.yml --env-file .env.production down -v
```

这会删除容器卷里的 MySQL 数据。

## 重新构建应用

代码改动后，如果要重新打包并启动：

```powershell
docker compose -f docker-compose.yml -f docker-compose.local.yml --env-file .env.production build app
docker compose -f docker-compose.yml -f docker-compose.local.yml --env-file .env.production up -d app caddy
```

## 当前本机验证结果

我已经验证过以下命令链路可用：

```powershell
docker compose -f docker-compose.yml -f docker-compose.local.yml --env-file .env.production build app
docker compose -f docker-compose.yml -f docker-compose.local.yml --env-file .env.production up -d mysql
docker compose -f docker-compose.yml -f docker-compose.local.yml --env-file .env.production run --rm app pnpm db:deploy
docker compose -f docker-compose.yml -f docker-compose.local.yml --env-file .env.production up -d app caddy
curl.exe -k https://localhost:8443/healthz
```
