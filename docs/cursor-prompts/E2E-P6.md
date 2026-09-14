# E2E-P6 入职任务 CRUD 冒烟 执行提示词（staging 模式）

> **staging 模式**：所有产出写到 `<仓库根>\.dsh\skills\slice-cursor-dev\staging\E2E-P6\`。
> **不要直接修改仓库任何文件**。完成后生成 `apply-e2e-p6.ps1`/`.cmd`（幂等、排除自身/README/REPORT）。

## ⚠️ 强约束（最优先阅读）

1. **staging 模式**：所有文件写到 `<仓库根>\.dsh\skills\slice-cursor-dev\staging\E2E-P6\`（保留相对路径）。
2. **本切片只新增 e2e + 集成测试**：不修后端、不修前端、不改现有 spec。
   - ✱ `server/tests/integration/onboarding-task.test.ts`：8-10 个集成用例
   - ✱ `e2e/tests/_onboarding-task.spec.ts`：3-4 个 e2e 用例（admin project）
   - 其余一行不动
3. **集成测试 mock 关键**：使用 `mockAuthUser()` 模式（P2.5/P3/P4/P5 已示范）；任务用 `prisma.onboardingTask` + `prisma.candidate`。
4. **e2e auth 方案**：与之前一致 —— 显式从 `.auth/admin.json` 读 `ats_token`。
5. **不跑验收命令**（DSH 审核后人工跑：`cd server && npx vitest run tests/integration/onboarding-task.test.ts` / `cd e2e && npx playwright test --project=admin tests/_onboarding-task.spec.ts`）。
6. 编码红线：新文件 UTF-8 无 BOM、LF、2 空格、单引号、行尾分号、中文注释；ps1 脚本 UTF-8 带 BOM + 尽量 ASCII 注释。
7. headless 无人工确认：先输出实施计划，然后直接动手。

## 1. 任务 ID + 目标

### 1.1 任务 ID
`E2E-P6`

### 1.2 任务目标

1. **集成测试**：入职任务 CRUD + 批量生成 + 可见性校验完整路径——admin/hr 创建/列表/更新/删除/批量生成；可见性越权 → 403
2. **E2E 冒烟**：admin project 的 API 层完整流程（创建任务 → 列表 → 更新状态 → 批量生成）
3. **回归哨兵**：保护 onboarding-task 整套路径不回归

### 1.3 为什么

入职任务是候选人入职阶段的核心配置，server/tests/integration 下完全无覆盖。本切片补齐这一缺口。

## 2. 上下文（已实读源码）

### 2.1 前端契约（`client/src/api/onboarding-task.ts`）

- `getTasksByCandidate(candidateId)`：`GET /onboarding-tasks/candidates/:candidateId`
- `createTask(data)`：`POST /onboarding-tasks`
- `updateTask(id, data)`：`PATCH /onboarding-tasks/:id`
- `deleteTask(id)`：`DELETE /onboarding-tasks/:id`
- `generateDefaultTasks(candidateId)`：`POST /onboarding-tasks/candidates/:candidateId/generate`

### 2.2 后端现状（`server/src/routes/onboarding-task.ts` line 42-64）

- GET `/api/onboarding-tasks/candidates/:candidateId` — 列表（按候选人）
- POST `/api/onboarding-tasks` — 创建
- PATCH `/api/onboarding-tasks/:id` — 更新
- DELETE `/api/onboarding-tasks/:id` — 删除
- POST `/api/onboarding-tasks/candidates/:candidateId/generate` — 批量生成

### 2.3 Schema（`server/prisma/schema.prisma` OnboardingTask）

- 字段：id/candidateId/title/category/assigneeId/dueDate/note/status/createdAt/updatedAt
- status enum：`pending | in_progress | completed`

### 2.4 业务规则（service 层）

- **可见性校验**：通过 `assertCandidateVisible(candidateId, scope)` —— admin 不传 scope，hr/hiring_manager 传 scope；越权 → 403
- **批量生成**：候选人已有任务时 → 400（避免重复生成）
- **批量生成内置 10 个标准任务**：DEFAULT_ONBOARDING_TASKS 常量

### 2.5 现有模式（与 P2.5/P3/P4/P5 一致）

- `vi.hoisted(() => { process.env.DATABASE_URL/JWT_SECRET/... })`
- `vi.mock('../../src/lib/redis', ...)` + `vi.mock('../../src/lib/prisma', ...)`
- `mockAuthUser(user)` 模拟 auth 中间件的 findUnique

## 3. 必读约束

### 3.1 反直觉点

1. **`scope` 不存在（admin）→ 跳过可见性校验**：`assertCandidateVisible` 内部 `if (!scope) return`，所以 admin 调用无需 mock candidate.count。
2. **`scope` 存在（hr）→ 必须 mock `prisma.candidate.count` ≥ 1**：否则 403。
3. **批量生成走 findUnique + count + createMany**：3 步都要 mock。已存在任务时 count > 0 → 400。
4. **candidate.id 在 create 时验证存在**：`prisma.candidate.findUnique` 返回 null → 404。
5. **updateTask 不传 status 不报错**：partial schema 允许只更新 title/category。

### 3.2 权限矩阵

| 接口 | admin | hr | hiring_manager |
|---|---|---|---|
| GET /onboarding-tasks/candidates/:id | ✅ | ✅（可见范围内）| ✅（可见范围内）|
| POST /onboarding-tasks | ✅ | ✅（可见范围内）| ✅（可见范围内）|
| PATCH /onboarding-tasks/:id | ✅ | ✅ | ✅ |
| DELETE /onboarding-tasks/:id | ✅ | ✅ | ✅ |
| POST /onboarding-tasks/candidates/:id/generate | ✅ | ✅（可见范围内）| ✅（可见范围内）|

> 注：service.createTask 用 `assertCandidateVisible`，hr/hiring_manager 越权 → 403。

### 3.3 审计/日志约定

- 当前实现不写 OperationLog（service 层没调 prisma.operationLog.create）。
- 集成测试不强制断言。

## 4. 实施任务

### 4.1 ✱ `staging/E2E-P6/server/tests/integration/onboarding-task.test.ts`

覆盖 10 个用例（mock prisma + supertest）：

| # | 场景 | 期望 |
|---|---|---|
| 1 | admin 创建任务 → 201 | |
| 2 | title 为空 → 400 | |
| 3 | candidateId 不存在 → 404 | |
| 4 | hr 越权访问不可见候选人 → 403 | |
| 5 | 未登录 → 401 | |
| 6 | admin 列表任务 → 200 | |
| 7 | admin 更新 status → 200 | |
| 8 | admin 更新不存在任务 → 404 | |
| 9 | admin 删除任务 → 200 | |
| 10 | admin 批量生成任务 → 200 + 10 个标准任务 | |
| 11 | 候选人已有任务时批量生成 → 400 | |
| 12 | admin 删除不存在任务 → 404 | |

> 实际选 10 个最有代表性的（如 1, 2, 3, 4, 5, 6, 7, 8, 9, 10）。

mock 模式：
- `prisma.onboardingTask.findMany/findUnique/create/update/delete/count/createMany` —— 全 mock
- `prisma.candidate.findUnique` —— 创建时验证候选人存在
- `prisma.candidate.count` —— 可见性校验（hr/hiring_manager 路径）

### 4.2 ✱ `staging/E2E-P6/e2e/tests/_onboarding-task.spec.ts`

4 个 e2e 用例（admin project）：

1. **admin 创建任务 → 列表出现 → 更新 status → 删除闭环**
2. **title 为空 → 400**
3. **candidateId 不存在 → 404**
4. **admin 批量生成 → 10 个任务出现**

> 与之前同模式：`loadAdminToken()` 从 `.auth/admin.json` 读 ats_token。

### 4.3 ✱ apply 脚本 `apply-e2e-p6.ps1` / `.cmd`

照抄 P5 模式。排除名：`apply-e2e-p6.ps1` / `apply-e2e-p6.cmd` / `README.md` / `STAGING_REPORT.md`。

### 4.4 ✱ `README.md` + `STAGING_REPORT.md`

模板与 P5 相同。

## 5. 关键决策点

### 5.1 为什么选 onboarding-task 而不是 communications
onboarding-task 业务逻辑相对简单（CRUD + 批量生成），无 follow-up 提醒那种时区相关逻辑。集成测试能更聚焦核心路径。

### 5.2 为什么 mock candidate.count 而不是直接 mock assertCandidateVisible
`assertCandidateVisible` 是 service 的内部函数，集成测试通过 mock `prisma.candidate.count` 间接控制其行为。直接 mock 会破坏测试真实性。

### 5.3 为什么「已有任务时批量生成 → 400」单测
这是核心防误操作规则（避免重复生成覆盖）。集成测试断言 400 是回归哨兵。

### 5.4 不做的
- 不改后端 onboarding-task.service.ts
- 不改前端 onboarding-task.ts
- 不改 prisma schema / migrations
- 不补 data-testid
- 不跑验收命令

## 6. 修改文件清单

### 6.1 staging 产出（4 个）

1. ✱ `server/tests/integration/onboarding-task.test.ts`（新增）
2. ✱ `e2e/tests/_onboarding-task.spec.ts`（新增）
3. ✱ `apply-e2e-p6.ps1` / `apply-e2e-p6.cmd`
4. ✱ `README.md` + `STAGING_REPORT.md`

### 6.2 禁止修改

- `client/**`
- `server/src/**`
- `server/prisma/**`
- `e2e/helpers.ts` `e2e/global-setup.ts` `e2e/playwright.config.ts`
- 现有 13 个 `*.spec.ts`（非下划线）
- `_smoke.spec.ts` / `_menu-matrix.spec.ts` / `_users-crud.spec.ts` / `_candidates-crud.spec.ts` / `_hc-requests.spec.ts` / `_pipeline-templates.spec.ts`
- `package.json` / `.gitignore` / `.github/**` / `docker-compose.e2e.yml`

### 6.3 越界检测

- staging 目录只允许 §6.1 路径
- apply 后 `git diff --stat -- client server/src server/prisma e2e/helpers.ts e2e/global-setup.ts e2e/playwright.config.ts` 必须 **0 行**

## 7. 验收标准

### 7.1 硬性验收（DSH 审核方）

| 检查 | 通过标准 |
|---|---|
| `cd server && npx tsc --noEmit` | 0 错（不得新增） |
| `cd server && npx vitest run tests/integration/onboarding-task.test.ts` | 10 用例全过 |
| `cd server && npx vitest run` | 基线 + 新增全过（无回归） |
| `cd e2e && npx playwright test --project=admin tests/_onboarding-task.spec.ts` | 4 用例全过 |
| 越界 | client / server/src / server/prisma / e2e 既有 0 行 |

### 7.2 交付报告模板（STAGING_REPORT.md）

1. 完成范围（2 个测试文件 + apply/说明）
2. 集成测试用例清单（10 条）+ 覆盖矩阵
3. e2e _onboarding-task.spec.ts 实现说明
4. 越界自检
5. 已知风险（可见性 mock / 批量生成 400 规则 / 10 个标准任务数）
6. 回退方式
7. 红线自检确认

按本提示词直接执行（headless 无人工确认）：先输出实施计划，然后动手到 staging/E2E-P6/。**不要写到仓库根！** 最终回复给出完整交付报告。
