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

## 🆕 阶段 5 部署补充

阶段 5（AI 招聘增强 + HR 考核积分）新增 5 个 migration，生产首次部署需依次 apply：

| 顺序 | Migration | 内容 |
|------|-----------|------|
| 1 | `20260901000000_add_user_role_hr` | User.role enum 扩展（member/hiring_manager/interviewer）|
| 2 | `20260901000001_rename_member_to_hr` | 数据迁移：已有 member 角色批量改为 hr（幂等）|
| 3 | `20260901000000_add_ai_match_score` | 新增 AiMatchScore 表（F2-S 简历打分）|
| 4 | `20260902000000_add_interview_question_outline` | 新增 InterviewQuestionOutline 表（F3-S 面试大纲）|
| 5 | `20260902130000_add_agency_referral` | 新增 Agency / AgencyLink 两表（F5-S 猎头通道）|
| 6 | `20260902150000_add_hr_score` | 新增 HrScoreEvent / HrScoreSnapshot 两表（F4-S1 考核事件埋点）|

> 注：阶段 5 之前的 migration 列表详见 `server/prisma/migrations/`。

### 启用 HR 考核定时任务（可选）

`.env` 中追加：

```bash
# 每日凌晨 2:00 计算 HR 过程分 + 日快照
HR_SCORE_CRON=0 2 * * *
```

不启用则留空或置 `false`，与现有 `ANONYMIZE_CRON` 等定时任务开关风格一致。

### Nginx / 路由覆盖

- 公开猎头落地页：`/referral/:token` 由 `nginx.conf` 的 `location /` (try_files → index.html) 自动覆盖，**无需改 nginx**。
- 公开提交接口：`/api/referral/:token` 由 `location /api/` 转发至 server:3001，**无需改 nginx**。

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
