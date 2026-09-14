# E2E-P5 流程模板 CRUD 冒烟 执行提示词（staging 模式）

> **staging 模式**：所有产出写到 `<仓库根>\.dsh\skills\slice-cursor-dev\staging\E2E-P5\`。
> **不要直接修改仓库任何文件**。完成后生成 `apply-e2e-p5.ps1`/`.cmd`（幂等、排除自身/README/REPORT）。

## ⚠️ 强约束（最优先阅读）

1. **staging 模式**：所有文件写到 `<仓库根>\.dsh\skills\slice-cursor-dev\staging\E2E-P5\`（保留相对路径）。
2. **本切片只新增 e2e + 集成测试**：不修后端、不修前端、不改现有 spec。
   - ✱ `server/tests/integration/pipeline-templates.test.ts`：8-10 个集成用例
   - ✱ `e2e/tests/_pipeline-templates.spec.ts`：3-4 个 e2e 用例（admin project）
   - 其余一行不动
3. **集成测试 mock 关键**：使用 `mockAuthUser()` 模式（P2.5/P3/P4 已示范）；模板用 `prisma.pipelineTemplate` + `prisma.candidateJob`。
4. **e2e auth 方案**：与 P2.5/P3/P4 一致 —— 显式从 `.auth/admin.json` 读 `ats_token`。
5. **不跑验收命令**（DSH 审核后人工跑：`cd server && npx vitest run tests/integration/pipeline-templates.test.ts` / `cd e2e && npx playwright test --project=admin tests/_pipeline-templates.spec.ts`）。
6. 编码红线：新文件 UTF-8 无 BOM、LF、2 空格、单引号、行尾分号、中文注释；ps1 脚本 UTF-8 带 BOM + 尽量 ASCII 注释。
7. headless 无人工确认：先输出实施计划，然后直接动手。

## 1. 任务 ID + 目标

### 1.1 任务 ID
`E2E-P5`

### 1.2 任务目标

1. **集成测试**：流程模板完整路径——admin 列表、新建、阶段校验、唯一默认模板（type 内唯一）、更新启停用、stages?candidateId=xxx 阶段解析
2. **E2E 冒烟**：admin project 的 API 层完整流程（创建模板 → 列表出现 → 详情正确 → 软启用/禁用）
3. **回归哨兵**：保护 pipeline-template 整套配置流不回归

### 1.3 为什么

流程模板是 admin 核心配置，被候选人推进阶段时直接调用（影响最大）。当前 server/tests/integration 下完全无 pipeline-templates 集成测试。

## 2. 上下文（已实读源码）

### 2.1 前端契约（`client/src/api/pipeline-template.ts`）

- `getTemplates()` line 30：`GET /pipeline-templates`
- `getStages(candidateId?)`：`GET /pipeline-templates/stages?candidateId=xxx`
- `createTemplate(data)` line 59：`POST /pipeline-templates`
- `updateTemplate(id, data)`：`PATCH /pipeline-templates/:id`

### 2.2 后端现状（`server/src/routes/pipeline-templates.ts` line 28-65）

- GET `/api/pipeline-templates` — 列表（admin）
- GET `/api/pipeline-templates/stages?candidateId=` — 阶段解析（登录用户）
- POST `/api/pipeline-templates` — 新建（admin）
- PATCH `/api/pipeline-templates/:id` — 更新（admin）

### 2.3 Schema（`server/prisma/schema.prisma` PipelineTemplate）

- 字段：name/type/stages(Json)/enabled/isDefault
- stages 是有序字符串数组

### 2.4 业务规则（service 层）

- **唯一默认模板**：同 type 下只能有一个 `isDefault=true`
- 创建时若 `isDefault=true`：先 `updateMany` 清除同 type 的 isDefault 标记
- 更新时若 `isDefault=true`：先 `updateMany` 清除同 type 的其它模板 isDefault 标记
- `stages.length === 0` → 抛 400
- 候选人阶段解析优先级：职位指定模板 → type 默认模板 → 全局默认模板 → STAGE_ORDER 兜底

### 2.5 现有模式（与 P2.5/P3/P4 一致）

- `vi.hoisted(() => { process.env.DATABASE_URL/JWT_SECRET/... })`
- `vi.mock('../../src/lib/redis', ...)` + `vi.mock('../../src/lib/prisma', ...)`
- `mockAuthUser(user)` 模拟 auth 中间件的 findUnique

## 3. 必读约束

### 3.1 反直觉点

1. **`GET /stages` 不限角色**：登录用户都能调（不是 admin）。集成测试覆盖「hr 调用 → 200」。
2. **唯一默认模板**：mock 必须验证 `updateMany` 被调用且 `where.type` 正确。
3. **stages 为空 → 400**：service 层校验（schema 也校验，但 service 是最后一道防线）。集成测试断言 400。
4. **`PATCH` 不传 stages 不报错**：partial schema 允许只更新 enabled/name/type。
5. **`stages` 字段类型**：Json 数组，mock 时返回 `{ stages: [...] }`。

### 3.2 权限矩阵

| 接口 | admin | hr | hiring_manager | interviewer |
|---|---|---|---|---|
| GET /pipeline-templates | ✅ | ❌ 403 | ❌ 403 | ❌ 403 |
| GET /pipeline-templates/stages | ✅ | ✅ | ✅ | ✅ |
| POST /pipeline-templates | ✅ | ❌ 403 | ❌ 403 | ❌ 403 |
| PATCH /pipeline-templates/:id | ✅ | ❌ 403 | ❌ 403 | ❌ 403 |

### 3.3 审计/日志约定

- 当前实现不写 OperationLog（service 层没调 prisma.operationLog.create）。
- 集成测试不强制断言此行为。

## 4. 实施任务

### 4.1 ✱ `staging/E2E-P5/server/tests/integration/pipeline-templates.test.ts`

覆盖 10 个用例（mock prisma + supertest）：

| # | 场景 | 期望 |
|---|---|---|
| 1 | admin 列表 → 200 | |
| 2 | hr 列表 → 403 | |
| 3 | hr 调 stages → 200 | |
| 4 | admin 新建（含 stages）→ 201 | |
| 5 | stages 空数组 → 400 | |
| 6 | name 为空 → 400 | |
| 7 | 新建时设 isDefault=true → updateMany 清除同 type | |
| 8 | 非 admin 新建 → 403 | |
| 9 | admin 更新 enabled → 200 | |
| 10 | 非 admin 更新 → 403 | |
| 11 | 更新不存在的模板 → 404 | |
| 12 | 更新时设 isDefault → 清除其它 | |

> 实际选 10 个最有代表性的（如 1, 2, 3, 4, 5, 7, 9, 10, 11, 12）。

mock 模式：
- `prisma.pipelineTemplate.findMany/findFirst/findUnique/create/update/updateMany` —— 全 mock
- `prisma.candidateJob.findFirst` —— 给 stages 路径

### 4.2 ✱ `staging/E2E-P5/e2e/tests/_pipeline-templates.spec.ts`

4 个 e2e 用例（admin project）：

1. **admin 创建 → 列表出现 → 详情正确 → 更新 enabled 闭环**
2. **admin 创建 isDefault=true → 同 type 旧默认 isDefault 被清除**
3. **stages 空数组 → 400**
4. **非 admin 列表 → 403**

> 与 P2.5/P3/P4 同模式：`loadAdminToken()` 从 `.auth/admin.json` 读 ats_token。

### 4.3 ✱ apply 脚本 `apply-e2e-p5.ps1` / `.cmd`

照抄 P4 模式。排除名：`apply-e2e-p5.ps1` / `apply-e2e-p5.cmd` / `README.md` / `STAGING_REPORT.md`。

### 4.4 ✱ `README.md` + `STAGING_REPORT.md`

模板与 P4 相同。

## 5. 关键决策点

### 5.1 为什么选 pipeline-templates 而不是 communications/onboarding-task
pipeline-templates 是 admin 配置入口，被候选人推进阶段直接调用，影响面最大；唯一默认模板业务规则复杂（updateMany 联动），值得回归保护。

### 5.2 为什么集成测试 mock candidateJob
service.getCandidatePipelineStages 用 `prisma.candidateJob.findFirst({ include: { job: { include: { pipelineTemplate: true } } } })`。stages 路径需 mock 完整结构。

### 5.3 为什么 isDefault 联动断言重要
「同 type 唯一默认」是核心业务规则，回归后会导致候选人推进阶段错乱。集成测试断言 `updateMany` 被调且 `where.type` 正确。

### 5.4 不做的
- 不改后端 pipeline-template.service.ts
- 不改前端 pipeline-template.ts
- 不改 prisma schema / migrations
- 不补 data-testid
- 不跑验收命令

## 6. 修改文件清单

### 6.1 staging 产出（4 个）

1. ✱ `server/tests/integration/pipeline-templates.test.ts`（新增）
2. ✱ `e2e/tests/_pipeline-templates.spec.ts`（新增）
3. ✱ `apply-e2e-p5.ps1` / `apply-e2e-p5.cmd`
4. ✱ `README.md` + `STAGING_REPORT.md`

### 6.2 禁止修改

- `client/**`
- `server/src/**`
- `server/prisma/**`
- `e2e/helpers.ts` `e2e/global-setup.ts` `e2e/playwright.config.ts`
- 现有 13 个 `*.spec.ts`（非下划线）
- `_smoke.spec.ts` / `_menu-matrix.spec.ts` / `_users-crud.spec.ts` / `_candidates-crud.spec.ts` / `_hc-requests.spec.ts`
- `package.json` / `.gitignore` / `.github/**` / `docker-compose.e2e.yml`

### 6.3 越界检测

- staging 目录只允许 §6.1 路径
- apply 后 `git diff --stat -- client server/src server/prisma e2e/helpers.ts e2e/global-setup.ts e2e/playwright.config.ts` 必须 **0 行**

## 7. 验收标准

### 7.1 硬性验收（DSH 审核方）

| 检查 | 通过标准 |
|---|---|
| `cd server && npx tsc --noEmit` | 0 错（不得新增） |
| `cd server && npx vitest run tests/integration/pipeline-templates.test.ts` | 10 用例全过 |
| `cd server && npx vitest run` | 基线 + 新增全过（无回归） |
| `cd e2e && npx playwright test --project=admin tests/_pipeline-templates.spec.ts` | 4 用例全过 |
| 越界 | client / server/src / server/prisma / e2e 既有 0 行 |

### 7.2 交付报告模板（STAGING_REPORT.md）

1. 完成范围（2 个测试文件 + apply/说明）
2. 集成测试用例清单（10 条）+ 覆盖矩阵
3. e2e _pipeline-templates.spec.ts 实现说明
4. 越界自检
5. 已知风险（stages Json 字段 / 唯一默认模板联动 / candidateJob 嵌套 include）
6. 回退方式
7. 红线自检确认

按本提示词直接执行（headless 无人工确认）：先输出实施计划，然后动手到 staging/E2E-P5/。**不要写到仓库根！** 最终回复给出完整交付报告。
