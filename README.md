# 🎯 招聘管理系统 (ATS)

<p align="center">
  <img src="https://img.shields.io/badge/Vue-3.4+-green.svg" alt="Vue">
  <img src="https://img.shields.io/badge/TypeScript-5.0+-blue.svg" alt="TypeScript">
  <img src="https://img.shields.io/badge/Express-4.18+-orange.svg" alt="Express">
  <img src="https://img.shields.io/badge/Prisma-5.7+-blue.svg" alt="Prisma">
  <img src="https://img.shields.io/badge/Element--Plus-2.4+-blue.svg" alt="Element Plus">
</p>

<p align="center">
  <b>English</b> | <a href="#中文文档">中文</a>
</p>

---

## 📖 Overview

A full-featured **Applicant Tracking System (ATS)** built with modern web technologies. This system helps HR teams and recruiters manage job postings, track candidates through the hiring pipeline, and analyze recruitment data.

### ✨ Key Features

- 📝 **Job Management**: Create, edit, publish, and close job postings
- 👥 **Candidate Management**: Track candidates from application to hire
- 📊 **Recruitment Pipeline**: Visualize candidates through hiring stages (New → Screening → Interview → Offer → Hired)
- 📈 **Analytics Dashboard**: Data visualization with ECharts for recruitment metrics
- 🔐 **Role-based Access**: Admin and Member roles with different permissions
- 📱 **Responsive Design**: Mobile-friendly interface using Element Plus
- 🔍 **Duplicate Detection**: Automatic candidate deduplication by phone/email
- 📄 **Resume Upload**: Support for PDF and Word documents

---

## 🚀 Quick Start

### Prerequisites

- Node.js 18+
- pnpm (recommended) or npm
- PostgreSQL 14+

### Local Development

1. **Clone the repository**
   ```bash
   git clone <repository-url>
   cd recruitment-system
   ```

2. **Install dependencies**
   ```bash
   # Install server dependencies
   cd server
   pnpm install
   
   # Install client dependencies
   cd ../client
   pnpm install
   ```

3. **Configure environment variables**
   ```bash
   cd ..
   cp .env.example .env
   # Edit .env with your database credentials
   ```

4. **Set up the database**
   ```bash
   cd server
   npx prisma migrate dev
   npx prisma db seed  # Optional: seed with sample data
   ```

5. **Start development servers**
   ```bash
   # Terminal 1: Start backend
   cd server
   pnpm dev
   
   # Terminal 2: Start frontend
   cd client
   pnpm dev
   ```

6. **Access the application**
   - Frontend: http://localhost:5173
   - Backend API: http://localhost:3001

---

## 🐳 Docker Deployment

### Using Docker Compose (Recommended)

1. **Configure environment**
   ```bash
   cp .env.example .env
   # Edit .env with production values
   ```

2. **Build and start services**
   ```bash
   # Build client first
   docker-compose --profile build run --rm client-build
   
   # Start all services
   docker-compose up -d
   ```

3. **Run database migrations**
   ```bash
   docker-compose exec server npx prisma migrate deploy
   ```

4. **Access the application**
   - Application: http://localhost
   - API: http://localhost/api

### Stopping Services

```bash
docker-compose down

# To remove volumes (⚠️ deletes all data)
docker-compose down -v
```

---

## 📁 Project Structure

```
recruitment-system/
├── 📂 client/                 # Frontend (Vue 3 + TypeScript)
│   ├── src/
│   │   ├── api/              # API client functions
│   │   ├── components/       # Vue components
│   │   ├── router/           # Vue Router configuration
│   │   ├── stores/           # Pinia state management
│   │   ├── views/            # Page components
│   │   └── utils/            # Utility functions
│   ├── package.json
│   └── vite.config.ts
│
├── 📂 server/                 # Backend (Express + TypeScript)
│   ├── src/
│   │   ├── controllers/      # Request handlers
│   │   ├── middleware/       # Express middleware
│   │   ├── routes/           # API routes
│   │   ├── services/         # Business logic
│   │   └── lib/              # Database & utilities
│   ├── prisma/
│   │   └── schema.prisma     # Database schema
│   ├── tests/                # Test files
│   ├── Dockerfile
│   └── package.json
│
├── 📂 nginx/                  # Nginx configuration
│   └── nginx.conf
│
├── docker-compose.yml         # Docker Compose configuration
├── .env.example               # Environment variables template
└── README.md
```

---

## 🔌 API Documentation

### Authentication

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/auth/login` | User login |
| POST | `/api/auth/logout` | User logout |
| GET | `/api/auth/me` | Get current user |

### Jobs

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/jobs` | List jobs (with pagination & filters) |
| POST | `/api/jobs` | Create new job |
| GET | `/api/jobs/:id` | Get job details |
| PATCH | `/api/jobs/:id` | Update job |
| POST | `/api/jobs/:id/close` | Close job |
| POST | `/api/jobs/:id/duplicate` | Duplicate job |
| DELETE | `/api/jobs/:id` | Delete job |

### Candidates

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/candidates` | List candidates |
| POST | `/api/candidates` | Create candidate |
| GET | `/api/candidates/:id` | Get candidate details |
| PATCH | `/api/candidates/:id` | Update candidate |
| POST | `/api/candidates/:id/stage` | Advance candidate stage |
| POST | `/api/candidates/:id/feedback` | Add interview feedback |
| GET | `/api/candidates/:id/feedback` | Get interview feedbacks |

### Offers

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/offers` | List offers |
| POST | `/api/offers` | Create offer |
| GET | `/api/offers/:candidateId` | Get candidate's offer |
| PATCH | `/api/offers/:candidateId` | Update offer |
| PATCH | `/api/offers/:candidateId/result` | Update offer result |
| PATCH | `/api/offers/:candidateId/join` | Mark as joined |

### Statistics

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/stats/workload` | Workload statistics |
| GET | `/api/stats/channel` | Channel effectiveness |
| GET | `/api/stats/jobs` | Job statistics |

---

## 🧪 Testing

```bash
# Run server tests
cd server
pnpm test

# Run with coverage
pnpm test:coverage
```

---

## 🛠️ Tech Stack

### Frontend
- **Vue 3** - Progressive JavaScript framework
- **TypeScript** - Type-safe development
- **Vite** - Fast build tool
- **Element Plus** - UI component library
- **Pinia** - State management
- **Vue Router** - Client-side routing
- **ECharts** - Data visualization

### Backend
- **Express** - Web framework
- **Prisma** - Database ORM
- **PostgreSQL** - Relational database
- **JWT** - Authentication
- **Zod** - Schema validation
- **bcryptjs** - Password hashing

### DevOps
- **Docker** - Containerization
- **Nginx** - Reverse proxy
- **Vitest** - Testing framework

---

## 📄 License

MIT License

---

<p id="中文文档"></p>

# 🎯 招聘管理系统 (ATS)

## 📖 项目介绍

一个功能完整的**招聘管理系统**，采用现代 Web 技术栈开发。帮助 HR 团队和招聘人员管理职位发布、跟踪候选人招聘流程、分析招聘数据。

### ✨ 核心功能

- 📝 **职位管理**：创建、编辑、发布和关闭职位
- 👥 **候选人管理**：从申请到入职全流程跟踪
- 📊 **招聘流程**：可视化招聘阶段（入库→初筛→面试→Offer→入职）
- 📈 **数据分析**：使用 ECharts 进行招聘数据可视化
- 🔐 **权限管理**：管理员和普通成员两种角色
- 📱 **响应式设计**：基于 Element Plus 的移动端友好界面
- 🔍 **查重检测**：根据手机号/邮箱自动检测重复候选人
- 📄 **简历上传**：支持 PDF 和 Word 文档

---

## 🚀 快速开始

### 环境要求

- Node.js 18+
- pnpm（推荐）或 npm
- PostgreSQL 14+

### 本地开发

1. **克隆仓库**
   ```bash
   git clone <repository-url>
   cd recruitment-system
   ```

2. **安装依赖**
   ```bash
   # 安装服务端依赖
   cd server
   pnpm install
   
   # 安装客户端依赖
   cd ../client
   pnpm install
   ```

3. **配置环境变量**
   ```bash
   cd ..
   cp .env.example .env
   # 编辑 .env 文件，填写数据库配置
   ```

4. **初始化数据库**
   ```bash
   cd server
   npx prisma migrate dev
   npx prisma db seed  # 可选：导入示例数据
   ```

5. **启动开发服务器**
   ```bash
   # 终端 1：启动后端
   cd server
   pnpm dev
   
   # 终端 2：启动前端
   cd client
   pnpm dev
   ```

6. **访问应用**
   - 前端：http://localhost:5173
   - 后端 API：http://localhost:3001

---

## 🐳 Docker 部署

### 使用 Docker Compose（推荐）

1. **配置环境**
   ```bash
   cp .env.example .env
   # 编辑 .env 文件，填写生产环境配置
   ```

2. **构建并启动服务**
   ```bash
   # 先构建前端
   docker-compose --profile build run --rm client-build
   
   # 启动所有服务
   docker-compose up -d
   ```

3. **执行数据库迁移**
   ```bash
   docker-compose exec server npx prisma migrate deploy
   ```

4. **访问应用**
   - 应用：http://localhost
   - API：http://localhost/api

### 停止服务

```bash
docker-compose down

# 删除卷（⚠️ 会删除所有数据）
docker-compose down -v
```

---

## 📁 目录结构

```
recruitment-system/
├── 📂 client/                 # 前端（Vue 3 + TypeScript）
│   ├── src/
│   │   ├── api/              # API 接口函数
│   │   ├── components/       # Vue 组件
│   │   ├── router/           # 路由配置
│   │   ├── stores/           # Pinia 状态管理
│   │   ├── views/            # 页面组件
│   │   └── utils/            # 工具函数
│   ├── package.json
│   └── vite.config.ts
│
├── 📂 server/                 # 后端（Express + TypeScript）
│   ├── src/
│   │   ├── controllers/      # 请求处理器
│   │   ├── middleware/       # Express 中间件
│   │   ├── routes/           # API 路由
│   │   ├── services/         # 业务逻辑
│   │   └── lib/              # 数据库和工具
│   ├── prisma/
│   │   └── schema.prisma     # 数据库模型
│   ├── tests/                # 测试文件
│   ├── Dockerfile
│   └── package.json
│
├── 📂 nginx/                  # Nginx 配置
│   └── nginx.conf
│
├── docker-compose.yml         # Docker Compose 配置
├── .env.example               # 环境变量模板
└── README.md
```

---

## 🔌 API 接口文档概览

### 认证

| 方法 | 接口 | 说明 |
|------|------|------|
| POST | `/api/auth/login` | 用户登录 |
| POST | `/api/auth/logout` | 用户登出 |
| GET | `/api/auth/me` | 获取当前用户信息 |

### 职位

| 方法 | 接口 | 说明 |
|------|------|------|
| GET | `/api/jobs` | 职位列表（支持分页和筛选） |
| POST | `/api/jobs` | 创建职位 |
| GET | `/api/jobs/:id` | 职位详情 |
| PATCH | `/api/jobs/:id` | 更新职位 |
| POST | `/api/jobs/:id/close` | 关闭职位 |
| POST | `/api/jobs/:id/duplicate` | 复制职位 |
| DELETE | `/api/jobs/:id` | 删除职位 |

### 候选人

| 方法 | 接口 | 说明 |
|------|------|------|
| GET | `/api/candidates` | 候选人列表 |
| POST | `/api/candidates` | 创建候选人 |
| GET | `/api/candidates/:id` | 候选人详情 |
| PATCH | `/api/candidates/:id` | 更新候选人 |
| POST | `/api/candidates/:id/stage` | 推进招聘阶段 |
| POST | `/api/candidates/:id/feedback` | 添加面试反馈 |
| GET | `/api/candidates/:id/feedback` | 获取面试反馈 |

### Offer

| 方法 | 接口 | 说明 |
|------|------|------|
| GET | `/api/offers` | Offer 列表 |
| POST | `/api/offers` | 创建 Offer |
| GET | `/api/offers/:candidateId` | 候选人 Offer |
| PATCH | `/api/offers/:candidateId` | 更新 Offer |
| PATCH | `/api/offers/:candidateId/result` | 更新 Offer 结果 |
| PATCH | `/api/offers/:candidateId/join` | 标记入职 |

### 统计

| 方法 | 接口 | 说明 |
|------|------|------|
| GET | `/api/stats/workload` | 工作量统计 |
| GET | `/api/stats/channel` | 渠道效果分析 |
| GET | `/api/stats/jobs` | 职位统计 |

---

## 🧪 测试

```bash
# 运行服务端测试
cd server
pnpm test

# 查看覆盖率
pnpm test:coverage
```

---

## 🛠️ 技术栈

### 前端
- **Vue 3** - 渐进式 JavaScript 框架
- **TypeScript** - 类型安全开发
- **Vite** - 快速构建工具
- **Element Plus** - UI 组件库
- **Pinia** - 状态管理
- **Vue Router** - 客户端路由
- **ECharts** - 数据可视化

### 后端
- **Express** - Web 框架
- **Prisma** - 数据库 ORM
- **PostgreSQL** - 关系型数据库
- **JWT** - 身份认证
- **Zod** - 数据验证
- **bcryptjs** - 密码加密

### DevOps
- **Docker** - 容器化
- **Nginx** - 反向代理
- **Vitest** - 测试框架

---

## 📄 许可证

MIT License
