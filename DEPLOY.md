# 部署指南 / Deployment Guide

## 📦 部署文件清单

| 文件 | 说明 |
|------|------|
| `docker-compose.yml` | 开发环境 Docker Compose 配置 |
| `docker-compose.prod.yml` | 生产环境 Docker Compose 配置 |
| `server/Dockerfile` | 后端服务 Docker 镜像构建 |
| `client/Dockerfile` | 前端服务 Docker 镜像构建 |
| `nginx/nginx.conf` | Nginx 反向代理配置 |
| `.env.example` | 环境变量模板 |
| `deploy.sh` | Linux/Mac 部署脚本 |
| `deploy.ps1` | Windows 部署脚本 |
| `Makefile` | 常用命令快捷方式 |

---

## 🚀 快速部署

### 方式一：使用部署脚本（推荐）

#### Linux / Mac
```bash
chmod +x deploy.sh
./deploy.sh
```

#### Windows
```powershell
.\deploy.ps1
```

### 方式二：使用 Docker Compose

```bash
# 1. 配置环境变量
cp .env.example .env
# 编辑 .env 文件

# 2. 构建前端
docker-compose --profile build run --rm client-build

# 3. 启动所有服务
docker-compose up -d

# 4. 执行数据库迁移
docker-compose exec server npx prisma migrate deploy
```

### 方式三：使用 Makefile

```bash
# 查看可用命令
make help

# 完整部署
make deploy

# 其他命令
make install      # 安装依赖
make dev          # 开发模式
make build        # 构建生产版本
make docker-up    # 启动 Docker
make docker-down  # 停止 Docker
make migrate      # 数据库迁移
make test         # 运行测试
```

---

## ⚙️ 环境变量配置

复制 `.env.example` 为 `.env`，并修改以下配置：

```bash
# 数据库配置
DB_USER=ats_user
DB_PASSWORD=your_secure_password_here  # 必须修改！
DB_NAME=ats_db

# JWT 密钥（生产环境必须修改！）
JWT_SECRET=your-super-secret-jwt-key-change-this-in-production

# Nginx 端口
NGINX_PORT=80
```

---

## 🐳 服务架构

```
┌─────────────────┐
│     Nginx       │  ← 反向代理，端口 80
│   (Port 80)     │
└────────┬────────┘
         │
    ┌────┴────┐
    │         │
    ▼         ▼
┌───────┐ ┌──────────┐
│Client │ │  Server  │  ← API 服务，端口 3001
│(静态)  │ │(Node.js) │
└───────┘ └────┬─────┘
               │
               ▼
        ┌──────────┐
        │PostgreSQL│  ← 数据库，端口 5432
        └──────────┘
```

---

## 🔧 常用操作

### 查看日志
```bash
# 查看所有服务日志
docker-compose logs -f

# 查看特定服务日志
docker-compose logs -f server
docker-compose logs -f nginx
docker-compose logs -f postgres
```

### 重启服务
```bash
# 重启所有服务
docker-compose restart

# 重启特定服务
docker-compose restart server
```

### 数据库操作
```bash
# 进入数据库容器
docker-compose exec postgres psql -U ats_user -d ats_db

# 备份数据库
docker-compose exec postgres pg_dump -U ats_user ats_db > backup.sql

# 恢复数据库
docker-compose exec -T postgres psql -U ats_user -d ats_db < backup.sql
```

### 更新部署
```bash
# 拉取最新代码后重建
docker-compose down
docker-compose --profile build run --rm client-build
docker-compose up -d --build
docker-compose exec server npx prisma migrate deploy
```

---

## 🔒 安全配置

### 生产环境检查清单

- [ ] 修改 `JWT_SECRET` 为强随机字符串
- [ ] 修改 `DB_PASSWORD` 为强密码
- [ ] 使用 HTTPS（配置 SSL 证书）
- [ ] 配置防火墙，只开放必要端口
- [ ] 启用数据库定期备份
- [ ] 配置日志轮转

---

## 🆘 故障排除

### 数据库连接失败
```bash
# 检查数据库容器状态
docker-compose ps

# 查看数据库日志
docker-compose logs postgres

# 重置数据库（会丢失数据！）
docker-compose down -v
docker-compose up -d
```

### 前端显示 502 错误
```bash
# 检查后端服务状态
docker-compose ps server
docker-compose logs server

# 重启后端
docker-compose restart server
```

### 端口被占用
```bash
# 修改 .env 中的端口配置
NGINX_PORT=8080
DB_PORT=5433
```

---

## 📞 技术支持

如有问题，请查看：
- 项目文档：[README.md](./README.md)
- API 文档：[API 概览](#api-接口文档概览)
