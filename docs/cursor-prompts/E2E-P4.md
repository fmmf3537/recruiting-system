# E2E-P4 HC 编制申请工作流 冒烟 执行提示词（staging 模式）

> **staging 模式**：所有产出写到 `<仓库根>\.dsh\skills\slice-cursor-dev\staging\E2E-P4\`。
> **不要直接修改仓库任何文件**。完成后生成 `apply-e2e-p4.ps1`/`.cmd`（幂等、排除自身/README/REPORT）。

## ⚠️ 强约束（最优先阅读）

1. **staging 模式**：所有文件写到 `<仓库根>\.dsh\skills\slice-cursor-dev\staging\E2E-P4\`（保留相对路径）。
2. **本切片只新增 e2e + 集成测试**：不修后端、不修前端、不改现有 spec。
   - ✱ `server/tests/integration/hc-requests.test.ts`：8-10 个集成用例
   - ✱ `e2e/tests/_hc-requests.spec.ts`：3-4 个 e2e 用例（admin project，API 层 + 显式 Bearer token）
   - 其余一行不动
3. **集成测试 mock 关键**：使用与 P2.5/P3 相同的 `mockAuthUser()` 模式；HC Request 用 `prisma.hCRequest`（注意驼峰命名）+ `prisma.user` + `prisma.job`。
4. **e2e auth 方案**：与 P2.5/P3 一致 —— 显式从 `.auth/admin.json` 读 `ats_token`。
5. **不跑验收命令**（DSH 审核后人工跑：`cd server && npx vitest run tests/integration/hc-requests.test.ts` / `cd e2e && npx playwright test --project=admin tests/_hc-requests.spec.ts`）。
6. 编码红线：新文件 UTF-8 无 BOM、LF、2 空格、单引号、行尾分号、中文注释；ps1 脚本 UTF-8 带 BOM + 尽量 ASCII 注释。
7. headless 无人工确认：先输出实施计划，然后直接动手。

## 1. 任务 ID + 目标

### 1.1 任务 ID
`E2E-P4`

### 1.2 任务目标

1. **集成测试**：HC 编制申请工作流的完整路径——admin/hr 创建、草稿提交、admin 审批通过/驳回、删除；权限矩阵校验；状态机校验
2. **E2E 冒烟**：admin project 的 API 层完整工作流（创建 → 提交 → 审批 → 一键创建职位）
3. **回归哨兵**：保护 hc-requests 整套审批流不回归

### 1.3 为什么

HC Requests 是 admin/hr 的核心审批流（含状态机：draft → submitted → approved/rejected → fulfilled），且 server/tests/integration/ 下目前**完全没有 hc-requests 集成测试**。这是覆盖缺口最大的模块之一。

## 2. 上下文（已实读源码）

### 2.1 前端契约（`client/src/api/hc-request.ts`）

- `createHC(data)` line 77：`POST /hc-requests`
- `submitHC(id)` line 85：`POST /hc-requests/:id/submit`
- `approveHC(id, note)` line 89：`POST /hc-requests/:id/approve`
- `rejectHC(id, note)` line 93：`POST /hc-requests/:id/reject`
- `createJobFromHC(id)` line 97：`POST /hc-requests/:id/create-job`

### 2.2 后端现状（`server/src/routes/hc-requests.ts` line 59-99）

完整路由：
- GET `/api/hc-requests` — 列表
- GET `/api/hc-requests/:id` — 详情
- POST `/api/hc-requests` — 创建（任意登录用户）
- PATCH `/api/hc-requests/:id` — 更新
- POST `/api/hc-requests/:id/submit` — 提交审批（draft → submitted）
- POST `/api/hc-requests/:id/approve` — 审批通过（**仅 admin**）
- POST `/api/hc-requests/:id/reject` — 驳回（**仅 admin，note 必填**）
- POST `/api/hc-requests/:id/create-job` — 一键创建职位（**仅 admin**）
- DELETE `/api/hc-requests/:id` — 删除

### 2.3 Schema（`server/prisma/schema.prisma` line 724）

- `HCRequest` 表，**prisma model 名是 `hCRequest`**（注意驼峰）
- 状态：`draft | submitted | approved | rejected | fulfilled`
- 字段：title/department/level/headcount/urgency/reason/status/submittedAt/approvedAt/rejectedAt/requesterId/approverId/approveNote/createdJobId

### 2.4 创建 schema（`server/src/routes/hc-requests.ts` line 11-25）

```ts
const createHCSchema = z.object({
  title: z.string().min(2).max(200),
  department: z.string().min(1).max(50),
  level: z.string().min(1).max(50),
  headcount: z.preprocess(toInt, z.number().int().min(1).max(999)),
  urgency: z.enum(['urgent', 'normal', 'low']),
  expectedDate: z.string().max(50).optional(),
  salaryMin: z.string().max(50).optional(),
  salaryMax: z.string().max(50).optional(),
  reason: z.enum(['new', 'replacement', 'expansion']),
  reasonNote: z.string().max(500).optional(),
});
```

### 2.5 状态机（`hc-request.service.ts`）

- `submitHCRequest`：仅 draft/rejected → submitted；非申请人 → 403
- `approveHCRequest`：仅 submitted → approved
- `rejectHCRequest`：仅 submitted → rejected；note 必填 → 400
- `deleteHCRequest`：仅 draft/rejected；非申请人+非 admin → 403

## 3. 必读约束

### 3.1 反直觉点

1. **`prisma.hCRequest` 驼峰命名**：Prisma 生成的 client 对 `HCRequest` model 用 `hCRequest`（不是 `hcRequest`）。mock 时必须用 `prisma.hCRequest`。
2. **submit 时通知所有 admin**：mock 需要 `prisma.user.findMany({ where: { role: 'admin' } })` 返回数组。
3. **reject 必须 note**：schema 已强制（`z.string().min(1)`）。集成测试覆盖「空 note → 400」。
4. **create-job 关联 job**：mock 需 `prisma.job.create` + `prisma.hCRequest.update`。
5. **submit 校验非申请人**：mock `getHCRequestById` 返回的 hc.requesterId 必须匹配 token 的 userId，否则 403。

### 3.2 权限矩阵

| 接口 | admin | hr | hiring_manager | interviewer |
|---|---|---|---|---|
| POST /hc-requests | ✅ | ✅ | ✅ | ✅ |
| PATCH /hc-requests/:id | ✅（自己的）| ✅（自己的）| ✅（自己的）| ✅（自己的）|
| POST /hc-requests/:id/submit | ✅（自己的）| ✅（自己的）| ✅（自己的）| ✅（自己的）|
| POST /hc-requests/:id/approve | ✅ | ❌ 403 | ❌ 403 | ❌ 403 |
| POST /hc-requests/:id/reject | ✅ | ❌ 403 | ❌ 403 | ❌ 403 |
| POST /hc-requests/:id/create-job | ✅ | ❌ 403 | ❌ 403 | ❌ 403 |
| DELETE /hc-requests/:id | ✅（任何）| ✅（自己的 draft/rejected）| ✅（自己的 draft/rejected）| ✅（自己的 draft/rejected）|

### 3.3 审计/日志约定

- 状态变更写 OperationLog（service 层会调 `prisma.operationLog.create`）。
- submit 通知所有 admin（mock `notificationService.createNotificationForUsers`）。
- approve/reject 通知申请人（mock `notificationService.createNotification`）。

## 4. 实施任务

### 4.1 ✱ `staging/E2E-P4/server/tests/integration/hc-requests.test.ts`

覆盖 10 个用例（mock prisma + supertest）：

| # | 场景 | 期望 |
|---|---|---|
| 1 | admin 创建 HC（draft）| 201 |
| 2 | hr 创建 HC | 201 |
| 3 | title 少于 2 字 → 400 | |
| 4 | urgency 非法值 → 400 | |
| 5 | 未登录创建 → 401 | |
| 6 | draft → submit → 200 + status=submitted | |
| 7 | 提交已 submitted 申请 → 400 | |
| 8 | 非申请人 submit → 403 | |
| 9 | admin approve submitted → 200 + status=approved | |
| 10 | 非 admin approve → 403 | |
| 11 | reject 空 note → 400 | |
| 12 | admin reject submitted → 200 + status=rejected | |
| 13 | 非 admin reject → 403 | |
| 14 | delete draft → 200 | |
| 15 | delete submitted → 400 | |
| 16 | create-job from approved → 200 + 关联 jobId | |
| 17 | 非 admin create-job → 403 | |

> 实际选 10 个最有代表性的（如 1, 2, 3, 5, 6, 7, 9, 10, 11, 14）。

mock 模式：
- `prisma.hCRequest.findUnique/findMany/count/create/update/delete` —— 全 mock
- `prisma.user.findUnique/findMany` —— auth 校验 + submit 通知 admin 列表
- `prisma.job.create` —— create-job 路径
- `prisma.notification` —— 可选 mock（service 用 void 异步调用）

### 4.2 ✱ `staging/E2E-P4/e2e/tests/_hc-requests.spec.ts`

4 个 e2e 用例（admin project，API 层）：

1. **admin 创建 → submit → approve 完整工作流**
2. **admin 创建 → submit → reject（带 note）**
3. **create-job from approved → 关联 jobId 出现**
4. **非 admin approve → 403**

> 与 P2.5/P3 同模式：`loadAdminToken()` 从 `.auth/admin.json` 读 ats_token。

### 4.3 ✱ apply 脚本 `apply-e2e-p4.ps1` / `.cmd`

照抄 P3 模式。排除名：`apply-e2e-p4.ps1` / `apply-e2e-p4.cmd` / `README.md` / `STAGING_REPORT.md`。

### 4.4 ✱ `README.md` + `STAGING_REPORT.md`

模板与 P2.5/P3 相同。

## 5. 关键决策点

### 5.1 为什么选 hc-requests 而不是其它模块
hc-requests 是 server/tests/integration 下完全无覆盖的模块，且业务逻辑复杂（状态机 + 审批流 + 跨表操作）。这是最高 ROI 的覆盖缺口。

### 5.2 为什么集成测试 mock notification
service 用 `void notificationService.createNotification(...)` 异步发通知，集成测试不阻塞主流程。mock notification 防止其触发真实逻辑。

### 5.3 为什么 reject 必须 note 单独断言
业务要求：驳回必填意见（避免管理员随意驳回）。集成测试要覆盖「空 note → 400」。

### 5.4 不做的
- 不改后端 hc-request.service.ts（无 bug 修复需求）
- 不改前端 hc-request.ts
- 不改 prisma schema / migrations
- 不补 data-testid
- 不跑验收命令

## 6. 修改文件清单

### 6.1 staging 产出（4 个）

1. ✱ `server/tests/integration/hc-requests.test.ts`（新增）
2. ✱ `e2e/tests/_hc-requests.spec.ts`（新增）
3. ✱ `apply-e2e-p4.ps1` / `apply-e2e-p4.cmd`
4. ✱ `README.md` + `STAGING_REPORT.md`

### 6.2 禁止修改

- `client/**`
- `server/src/**`（routes/services/controllers/middleware/lib）
- `server/prisma/**`
- `e2e/helpers.ts` `e2e/global-setup.ts` `e2e/playwright.config.ts`
- 现有 13 个 `*.spec.ts`（非下划线）
- `_smoke.spec.ts` / `_menu-matrix.spec.ts` / `_users-crud.spec.ts` / `_candidates-crud.spec.ts`
- `package.json` / `.gitignore` / `.github/**` / `docker-compose.e2e.yml`

### 6.3 越界检测

- staging 目录只允许 §6.1 路径
- apply 后 `git diff --stat -- client server/src server/prisma e2e/helpers.ts e2e/global-setup.ts e2e/playwright.config.ts` 必须 **0 行**

## 7. 验收标准

### 7.1 硬性验收（DSH 审核方）

| 检查 | 通过标准 |
|---|---|
| `cd server && npx tsc --noEmit` | 0 错（不得新增） |
| `cd server && npx vitest run tests/integration/hc-requests.test.ts` | 10 用例全过 |
| `cd server && npx vitest run` | 基线 + 新增全过（无回归） |
| `cd e2e && npx playwright test --project=admin tests/_hc-requests.spec.ts` | 4 用例全过 |
| 越界 | client / server/src / server/prisma / e2e 既有 0 行 |

### 7.2 交付报告模板（STAGING_REPORT.md）

1. 完成范围（2 个测试文件 + apply/说明）
2. 集成测试用例清单（10 条）+ 覆盖矩阵
3. e2e _hc-requests.spec.ts 实现说明（与 P3 同：显式 Bearer token）
4. 越界自检
5. 已知风险（prisma.hCRequest 驼峰命名 / reject 必填 note / 状态机）
6. 回退方式
7. 红线自检确认

按本提示词直接执行（headless 无人工确认）：先输出实施计划，然后动手到 staging/E2E-P4/。**不要写到仓库根！** 最终回复给出完整交付报告。
