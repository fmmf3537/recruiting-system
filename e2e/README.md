# 招聘管理系统 E2E 测试

## 概述

本目录包含招聘管理系统的端到端（End-to-End）测试用例，使用 Playwright 框架编写。

## 测试覆盖模块

- **认证模块** (`auth.spec.ts`) - 登录、登出、导航
- **职位管理模块** (`jobs.spec.ts`) - 职位列表、创建、编辑、详情
- **候选人管理模块** (`candidates.spec.ts`) - 候选人列表、创建、详情、流程推进
- **Offer管理模块** (`offers.spec.ts`) - Offer列表、详情、创建
- **仪表盘模块** (`dashboard.spec.ts`) - 仪表盘、数据统计

## 安装依赖

```bash
cd e2e
pnpm install
```

## 运行测试

### 运行所有测试
```bash
pnpm test
```

### 运行测试并查看 UI
```bash
pnpm test:ui
```

### 有头模式运行（可见浏览器）
```bash
pnpm test:headed
```

### 调试模式
```bash
pnpm test:debug
```

### 查看测试报告
```bash
pnpm test:report
```

## 测试环境要求

- Node.js >= 18.0.0
- PostgreSQL 数据库运行中
- 服务器运行在 http://localhost:3001
- 客户端运行在 http://localhost:5173

## 测试数据

测试使用以下默认账号：
- 邮箱: admin@test.com
- 密码: admin123

## 注意事项

1. 运行测试前确保后端和前端服务已启动
2. 测试会自动启动服务（如果配置了 webServer）
3. 测试会创建必要的测试数据
4. 部分测试可能需要管理员权限