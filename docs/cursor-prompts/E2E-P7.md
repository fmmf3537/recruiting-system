# E2E-P7 沟通记录 CRUD 冒烟 执行提示词（staging 模式）

> **staging 模式**：所有产出写到 `<仓库根>\.dsh\skills\slice-cursor-dev\staging\E2E-P7\`。
> **不要直接修改仓库任何文件**。完成后生成 `apply-e2e-p7.ps1`/`.cmd`（幂等、排除自身/README/REPORT）。

## ⚠️ 强约束（最优先阅读）

1. **staging 模式**：所有文件写到 `<仓库根>\.dsh\skills\slice-cursor-dev\staging\E2E-P7\`（保留相对路径）。
2. **本切片只新增 e2e + 集成测试**：不修后端、不修前端、不改现有 spec。
   - ✱ `server/tests/integration/communications.test.ts`：10-12 个集成用例
   - ✱ `e2e/tests/_communications.spec.ts`：3-4 个 e2e 用例（admin project）
   - 其余一行不动
3. **集成测试 mock 关键**：使用 `mockAuthUser()` 模式（P2.5-P6 已示范）；沟通用 `prisma.communicationLog` + `prisma.candidate`。
4. **e2e auth 方案**：与之前一致 —— 显式从 `.auth/admin.json` 读 `ats_token`。
5. **不跑验收命令**（DSH 审核后人工跑：`cd server && npx vitest run tests/integration/communications.test.ts` / `cd e2e && npx playwright test --project=admin tests/_communications.spec.ts`）。
6. 编码红线：新文件 UTF-8 无 BOM、LF、2 空格、单引号、行尾分号、中文注释；ps1 脚本 UTF-8 带 BOM + 尽量 ASCII 注释。
7. headless 无人工确认：先输出实施计划，然后直接动手。

## 1. 任务 ID + 目标

### 1.1 任务 ID
`E2E-P7`

### 1.2 任务目标

1. **集成测试**：沟通记录完整 CRUD + 待跟进提醒 + 可见性校验（admin/hr）
2. **E2E 冒烟**：admin project 的 API 层完整流程（创建沟通 → 列表 → 更新 → 删除）
3. **回归哨兵**：保护 communications 整套路径不回归

### 1.3 为什么

communications 是 server/tests/integration 下最后一个无覆盖的核心路由模块（含 follow-up 时间解析）。本切片填补这一缺口。

## 2. 上下文（已实读源码）

### 2.1 前端契约（`client/src/api/communication.ts`）

- `getCommunications(params)`：`GET /communications?page=&pageSize=&candidateId=&type=`
- `createCommunication(data)`：`POST /communications`
- `updateCommunication(id, data)`：`PATCH /communications/:id`
- `deleteCommunication(id)`：`DELETE /communications/:id`
- `getPendingFollowUps()`：`GET /communications/follow-ups`

### 2.2 后端现状（`server/src/routes/communications.ts` line 49-110）

- GET `/api/communications/follow-ups` — 待跟进提醒（必须在 `/:id` 之前）
- GET `/api/communications` — 列表（支持分页/筛选）
- POST `/api/communications` — 创建
- GET `/api/communications/:id` — 详情（service.getCommunicationById）
- PATCH `/api/communications/:id` — 更新
- DELETE `/api/communications/:id` — 删除

### 2.3 Schema（`server/prisma/schema.prisma` CommunicationLog）

- 字段：id/candidateId/type/content/result/followUpAt/createdById/createdAt/updatedAt

### 2.4 业务规则

- **可见性校验**：`assertCandidateVisible(candidateId, scope)` — admin 不传 scope
- **列表缓存**：`communications:list:*` key（scope+query），TTL 30 秒
- **followUpAt 时间格式**：zod 用 `refine((val) => !isNaN(Date.parse(val)))` —— ISO 字符串即可

### 2.5 现有模式（与 P2.5-P6 一致）

- `vi.hoisted(() => { process.env.DATABASE_URL/JWT_SECRET/... })`
- `vi.mock('../../src/lib/redis', ...)` + `vi.mock('../../src/lib/prisma', ...)`
- `mockAuthUser(user)` 模拟 auth 中间件的 findUnique

## 3. 必读约束

### 3.1 反直觉点

1. **路由顺序**：GET `/follow-ups` 必须在 `/:id` 之前注册（已在 routes 文件体现，测试不影响）。
2. **列表缓存**：service.getCommunications 用 `getFromCache` 缓存（TTL 30s）。集成测试 mock 返回 null 走真实查询路径。
3. **candidate.id 不存在 → 404**：createCommunication 先验证候选人存在。
4. **hr 越权 → 403**：mock `prisma.candidate.count` = 0。
5. **createCommunication 不传 followUpAt → null**：可省略。
6. **updateCommunication 不传 type/content 不报错**：partial schema。

### 3.2 权限矩阵

| 接口 | admin | hr | hiring_manager |
|---|---|---|---|
| GET /communications/follow-ups | ✅ | ✅ | ✅ |
| GET /communications | ✅ | ✅（可见范围内）| ✅（可见范围内）|
| POST /communications | ✅ | ✅（可见范围内）| ✅（可见范围内）|
| GET /communications/:id | ✅ | ✅ | ✅ |
| PATCH /communications/:id | ✅ | ✅ | ✅ |
| DELETE /communications/:id | ✅ | ✅ | ✅ |

> update/delete 不传 scope（即不调 assertCandidateVisible），所有登录用户都能更新/删除。集成测试覆盖「admin/hr 都能 update/delete」。

### 3.3 审计/日志约定

- 当前实现不写 OperationLog（service 层没调 prisma.operationLog.create）。
- 集成测试不强制断言。

## 4. 实施任务

### 4.1 ✱ `staging/E2E-P7/server/tests/integration/communications.test.ts`

覆盖 12 个用例（mock prisma + supertest）：

| # | 场景 | 期望 |
|---|---|---|
| 1 | admin 创建沟通（含 followUpAt）| 201 |
| 2 | content 为空 → 400 | |
| 3 | candidateId 不存在 → 404 | |
| 4 | hr 越权访问不可见候选人 → 403 | |
| 5 | 未登录 → 401 | |
| 6 | admin 列表沟通 → 200 | |
| 7 | admin 更新沟通 → 200 | |
| 8 | admin 更新不存在沟通 → 404 | |
| 9 | admin 删除沟通 → 200 | |
| 10 | admin 删除不存在沟通 → 404 | |
| 11 | admin 调 follow-ups → 200 + 含 followUpAt 非空的记录 | |
| 12 | type 非法值 → 400 | |

> 实际选 12 个最有代表性的（如 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12）。

mock 模式：
- `prisma.communicationLog.findFirst/findUnique/findMany/create/update/delete/count` —— 全 mock
- `prisma.candidate.findUnique` —— 创建时验证
- `prisma.candidate.count` —— visibility 校验（hr 路径）

### 4.2 ✱ `staging/E2E-P7/e2e/tests/_communications.spec.ts`

4 个 e2e 用例（admin project）：

1. **admin 创建 → 列表出现 → 更新 → 删除闭环**
2. **content 为空 → 400**
3. **candidateId 不存在 → 404**
4. **type 非法值 → 400**

> 与之前同模式：`loadAdminToken()` 从 `.auth/admin.json` 读 ats_token。

### 4.3 ✱ apply 脚本 `apply-e2e-p7.ps1` / `.cmd`

照抄 P6 模式。排除名：`apply-e2e-p7.ps1` / `apply-e2e-p7.cmd` / `README.md` / `STAGING_REPORT.md`。

### 4.4 ✱ `README.md` + `STAGING_REPORT.md`

模板与 P6 相同。

## 5. 关键决策点

### 5.1 为什么选 communications（最后无覆盖模块）
填补 server/tests/integration 的最后一个核心路由缺口，让覆盖率达到 100%。

### 5.2 为什么 follow-ups 单测
follow-ups 是 communication 专属特性（基于 followUpAt 字段），独立于 CRUD。集成测试断言「followUpAt 非空的记录被返回」是回归哨兵。

### 5.3 为什么 visibility mock candidate.count
与 onboarding-task 同模式：通过 mock `prisma.candidate.count` 间接控制 `assertCandidateVisible` 行为。

### 5.4 不做的
- 不改后端 communication.service.ts
- 不改前端 communication.ts
- 不改 prisma schema / migrations
- 不补 data-testid
- 不跑验收命令

## 6. 修改文件清单

### 6.1 staging 产出（4 个）

1. ✱ `server/tests/integration/communications.test.ts`（新增）
2. ✱ `e2e/tests/_communications.spec.ts`（新增）
3. ✱ `apply-e2e-p7.ps1` / `apply-e2e-p7.cmd`
4. ✱ `README.md` + `STAGING_REPORT.md`

### 6.2 禁止修改

- `client/**`
- `server/src/**`
- `server/prisma/**`
- `e2e/helpers.ts` `e2e/global-setup.ts` `e2e/playwright.config.ts`
- 现有 13 个 `*.spec.ts`（非下划线）
- `_smoke.spec.ts` / `_menu-matrix.spec.ts` / `_users-crud.spec.ts` / `_candidates-crud.spec.ts` / `_hc-requests.spec.ts` / `_pipeline-templates.spec.ts` / `_onboarding-task.spec.ts`
- `package.json` / `.gitignore` / `.github/**` / `docker-compose.e2e.yml`

### 6.3 越界检测

- staging 目录只允许 §6.1 路径
- apply 后 `git diff --stat -- client server/src server/prisma e2e/helpers.ts e2e/global-setup.ts e2e/playwright.config.ts` 必须 **0 行**

## 7. 验收标准

### 7.1 硬性验收（DSH 审核方）

| 检查 | 通过标准 |
|---|---|
| `cd server && npx tsc --noEmit` | 0 错（不得新增） |
| `cd server && npx vitest run tests/integration/communications.test.ts` | 12 用例全过 |
| `cd server && npx vitest run` | 基线 + 新增全过（无回归） |
| `cd e2e && npx playwright test --project=admin tests/_communications.spec.ts` | 4 用例全过 |
| 越界 | client / server/src / server/prisma / e2e 既有 0 行 |

### 7.2 交付报告模板（STAGING_REPORT.md）

1. 完成范围（2 个测试文件 + apply/说明）
2. 集成测试用例清单（12 条）+ 覆盖矩阵
3. e2e _communications.spec.ts 实现说明
4. 越界自检
5. 已知风险（follow-ups 时间筛选 / visibility / 列表缓存）
6. 回退方式
7. 红线自检确认

按本提示词直接执行（headless 无人工确认）：先输出实施计划，然后动手到 staging/E2E-P7/。**不要写到仓库根！** 最终回复给出完整交付报告。
