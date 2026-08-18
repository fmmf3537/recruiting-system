# Phase 3: 招聘需求与编制管理（HC 编制管理）— 实施计划

## Context

当前系统从"发布职位"开始招聘流程，但真实企业的招聘流程是先有"用人需求（HC）"，经审批后才转化为招聘职位。缺少编制提交、审批、追踪环节，导致无法管控招聘规模、无法衡量编制完成率。

## Phase 3 目标

新增 HC 需求（编制）管理模块，含编制申请、审批流、一键创建职位、编制统计。

---

## 步骤概览

### 后端（server）— 6 个步骤

| 步骤 | 文件 | 内容 |
|------|------|------|
| 3.1 | `prisma/schema.prisma` | 新增 `HCRequest` 模型 + `job.hcRequestId` 可选字段 |
| 3.2 | `constants/index.ts` | 新增 HC 状态/类型/紧急程度常量 |
| 3.3 | `services/hc-request.service.ts` | CRUD + 审批 + 从 HC 创建职位 |
| 3.4 | `controllers/hc-request.controller.ts` | 列表、详情、创建、更新、审批、删除 |
| 3.5 | `routes/hc-requests.ts` | 路由 + Zod 验证 |
| 3.6 | `services/stats.service.ts` | 增加编制完成率统计（dashboard） |

### 前端（client）— 4 个步骤

| 步骤 | 文件 | 内容 |
|------|------|------|
| 3.7 | `api/hc-request.ts` | API 封装 |
| 3.8 | `views/hc-requests/index.vue` | 编制列表页（含状态筛选、搜索） |
| 3.9 | `views/hc-requests/HCRequestForm.vue` | 创建/编辑表单 |
| 3.10 | `router/index.ts` + `DefaultLayout.vue` | 路由 + 侧边栏菜单入口 |

---

## 详细设计

### 3.1 Prisma — 新增 HCRequest 模型

```prisma
model HCRequest {
  id              String    @id @default(cuid())
  title           String    // 岗位名称
  department      String    // 需求部门
  level           String    // 职级（P6, M2 等）
  headcount       Int       // 需求人数
  filledCount     Int       @default(0) // 已招人数
  urgency         String    // urgent | normal | low
  expectedDate    DateTime? // 期望到岗时间
  salaryMin       String?   // 薪资下限
  salaryMax       String?   // 薪资上限
  reason          String    // new | replacement | expansion
  reasonNote      String?   // 需求说明
  status          String    @default("draft") // draft | submitted | approved | rejected | fulfilled
  submittedAt     DateTime?
  approvedAt      DateTime?
  rejectedAt      DateTime?

  // 申请人
  requesterId     String
  requester       User      @relation("HCRequests", fields: [requesterId], references: [id])

  // 审批人
  approverId      String?
  approver        User?     @relation("HCApprovals", fields: [approverId], references: [id])
  approveNote     String?   // 审批意见

  // 关联的职位（审批通过后创建）
  createdJobId    String?

  createdAt       DateTime  @default(now())
  updatedAt       DateTime  @updatedAt

  @@index([status])
  @@index([requesterId])
  @@index([department])
  @@index([createdAt])
  @@map("hc_request")
}
```

**User 模型追加**：
```
hcRequests  HCRequest[] @relation("HCRequests")
hcApprovals HCRequest[] @relation("HCApprovals")
```

**Job 模型追加**：`hcRequestId String?`（可选，关联来源编制）

执行 `pnpm db:push` 同步数据库。

### 3.2 常量

```typescript
export const HC_STATUS = ['draft', 'submitted', 'approved', 'rejected', 'fulfilled'] as const;
export const HC_URGENCY = ['urgent', 'normal', 'low'] as const;
export const HC_REASONS = ['new', 'replacement', 'expansion'] as const;
```

### 3.3 HC Request Service

**新文件**: `server/src/services/hc-request.service.ts`

核心方法：

| 方法 | 功能 |
|------|------|
| `getHCRequests(query)` | 分页列表（支持 status/department 筛选 + keyword 搜索） |
| `getHCRequestById(id)` | 详情（include requester + approver 姓名） |
| `createHCRequest(data, userId)` | 创建编制申请 |
| `updateHCRequest(id, data, userId)` | 编辑（仅 draft/rejected 状态可编辑） |
| `submitHCRequest(id, userId)` | 提交审批 |
| `approveHCRequest(id, approverId, note?)` | 审批通过（admin only） |
| `rejectHCRequest(id, approverId, note)` | 驳回（admin only，需填写意见） |
| `deleteHCRequest(id, userId)` | 删除（仅 draft 或本人可删） |
| `createJobFromHCRequest(id, userId)` | 一键创建职位（仅 approved 状态） |

**一键创建职位逻辑** (`createJobFromHCRequest`)：
- 检查 `status === 'approved'`
- 检查 `!createdJobId`（防止重复创建）
- 调用 `jobService.createJob({ title, departments: [department], level, ... })`
- 更新 HCRequest 的 `createdJobId`
- 检查 `filledCount >= headcount` → 将状态改为 `fulfilled`

**审批通知**：
- 提交审批时 → 通知所有管理员
- 审批通过/驳回时 → 通知申请人

### 3.4 HC Request Controller

**新文件**: `server/src/controllers/hc-request.controller.ts`

标准 3 层控制器，所有方法 `(req, res, next) => Promise<void>`。

### 3.5 HC Request Routes

**新文件**: `server/src/routes/hc-requests.ts`

```
GET    /api/hc-requests              — 列表（支持筛选）
GET    /api/hc-requests/:id          — 详情
POST   /api/hc-requests              — 创建
PATCH  /api/hc-requests/:id          — 更新
POST   /api/hc-requests/:id/submit   — 提交审批
POST   /api/hc-requests/:id/approve  — 审批通过（admin）
POST   /api/hc-requests/:id/reject   — 驳回（admin）
POST   /api/hc-requests/:id/create-job — 一键创建职位
DELETE /api/hc-requests/:id          — 删除
```

权限控制：创建/列表/详情 → `authenticate`；审批 → `authenticate` + admin 检查；删除 → 本人或 admin。

### 3.6 Dashboard 编制统计

在 `stats.service.ts` 的 `getDashboardStats()` 中增加：
```typescript
hcStats: {
  totalApproved: number,       // 已批准编制数
  totalFilled: number,         // 已完成编制数
  fulfillmentRate: number,     // 完成率 %
  openRequests: number,        // 审批中数量
}
```

同时在 Dashboard 页面的统计卡片区域增加编制数据展示。

### 3.7 客户端 API

**新文件**: `client/src/api/hc-request.ts`

类型 + API 函数（getHCRequests / getById / create / update / submit / approve / reject / createJob / delete）。

### 3.8 编制列表页

**新文件**: `client/src/views/hc-requests/index.vue`

- 页面标题："编制管理" + "新建申请"按钮
- 筛选：状态（草稿/审批中/已通过/已驳回/已完成）、部门、关键词
- 表格列：岗位名称、需求部门、职级、需求/已招人数、紧急程度（tag 颜色）、状态（tag）、申请人、创建时间、操作
- 操作按钮根据状态动态显示：
  - draft → 编辑/提交/删除
  - submitted → 查看（无操作）
  - approved → 创建职位/查看
  - rejected → 编辑/删除
  - fulfilled → 查看职位

### 3.9 编制表单

**新文件**: `client/src/views/hc-requests/HCRequestForm.vue`

- 必填：岗位名称、需求部门、职级、需求人数、紧急程度、需求原因
- 选填：期望到岗时间、薪资范围、需求说明
- 提交后自动跳转列表页
- 使用 `useDictionaryStore` 获取部门选项

### 3.10 路由 + 菜单

**路由**：
```typescript
{ path: '/hc-requests', name: 'HCRequests', component: ..., meta: { title: '编制管理', icon: ... } }
{ path: '/hc-requests/create', name: 'HCRequestCreate', component: ..., meta: { title: '新建申请', hidden: true } }
{ path: '/hc-requests/:id', name: 'HCRequestDetail', component: ..., meta: { title: '编制详情', hidden: true } }
{ path: '/hc-requests/:id/edit', name: 'HCRequestEdit', component: ..., meta: { title: '编辑申请', hidden: true } }
```

侧边栏菜单新增"编制管理"入口（admin 可见）。

---

## 涉及文件清单

### 新增文件（9 个）

| 文件 | 内容 |
|------|------|
| `server/src/services/hc-request.service.ts` | 编制 CRUD + 审批 + 一键创建职位 |
| `server/src/controllers/hc-request.controller.ts` | HTTP 控制器 |
| `server/src/routes/hc-requests.ts` | 路由 + Zod 验证 |
| `client/src/api/hc-request.ts` | API 封装 |
| `client/src/views/hc-requests/index.vue` | 列表页 |
| `client/src/views/hc-requests/HCRequestForm.vue` | 创建/编辑表单 |

### 修改文件（6 个）

| 文件 | 改动 |
|------|------|
| `server/prisma/schema.prisma` | 新增 HCRequest 模型，User/Job 加关联字段 |
| `server/src/constants/index.ts` | 新增 HC 状态/类型常量 |
| `server/src/routes/index.ts` | 注册 hc-requests 路由 |
| `server/src/services/stats.service.ts` | 增加编制完成率统计 |
| `client/src/router/index.ts` | 添加 hc-requests 相关路由 |
| `client/src/layouts/DefaultLayout.vue` | 管理员菜单新增编制管理入口 |

---

## 验证方案

1. **Prisma** — 新表 `hc_request` 创建成功
2. **编制创建** — POST `/api/hc-requests` 创建草稿
3. **提交审批** — POST `/:id/submit` → status 变为 `submitted`，管理员收到通知
4. **审批通过** — POST `/:id/approve` → status 变为 `approved`，申请人收到通知
5. **一键创建职位** — POST `/:id/create-job` → 创建职位成功，`createdJobId` 关联
6. **编制统计** — `GET /api/stats/dashboard` 返回 `hcStats` 数据
7. **前端页面** — `/hc-requests` 正常展示列表，创建表单正常提交
8. **Server tests** — `pnpm test` 全部通过
