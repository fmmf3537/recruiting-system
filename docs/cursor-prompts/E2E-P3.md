# E2E-P3 候选人 API CRUD 冒烟 执行提示词（staging 模式）

> **staging 模式**：所有产出写到 `<仓库根>\.dsh\skills\slice-cursor-dev\staging\E2E-P3\`。
> **不要直接修改仓库任何文件**。完成后生成 `apply-e2e-p3.ps1`/`.cmd`（幂等、排除自身/README/REPORT）。

## ⚠️ 强约束（最优先阅读）

1. **staging 模式**：所有文件写到 `<仓库根>\.dsh\skills\slice-cursor-dev\staging\E2E-P3\`（保留相对路径）。
2. **本切片只新增 e2e + 集成测试**：不修后端、不修前端、不改现有 spec。
   - ✱ `server/tests/integration/candidates-create.test.ts`：6-8 个集成用例（mock prisma + supertest）
   - ✱ `e2e/tests/_candidates-crud.spec.ts`：3-4 个 e2e 用例（admin project，API 层 + 显式 Bearer token）
   - 其余一行不动
3. **集成测试 mock 关键**：使用与 P2.5 相同的 `mockAuthUser()` 模式，让 auth 中间件的 `prisma.user.findUnique({ where: { id } })` 返回 admin 用户。
4. **e2e auth 方案**：与 P2.5 一致 —— 显式从 `.auth/admin.json` 读 `ats_token`，注入 `Authorization` header。
5. **不跑验收命令**（DSH 审核后人工跑：`cd server && npx vitest run tests/integration/candidates-create.test.ts` / `cd e2e && npx playwright test --project=admin tests/_candidates-crud.spec.ts`）。
6. 编码红线：新文件 UTF-8 无 BOM、LF、2 空格、单引号、行尾分号、中文注释；ps1 脚本 UTF-8 带 BOM + 尽量 ASCII 注释。
7. headless 无人工确认：先输出实施计划，然后直接动手。

## 1. 任务 ID + 目标

### 1.1 任务 ID
`E2E-P3`

### 1.2 任务目标

1. **集成测试**：候选人创建（create）的核心路径——admin/hr 创建成功、缺关键字段、查重场景（phone 唯一约束）、可见性权限
2. **E2E 冒烟**：admin project 的 API 层候选人 CRUD 闭环（POST → GET 列表 → GET 详情 → DELETE 软删）
3. **回归哨兵**：保护 candidate create/list/get/delete 链路不回归

### 1.3 为什么

候选人是 ATS 核心数据，create/list/get/delete 是最常用操作。P2.5 已经覆盖了 users，本切片用相同模式覆盖 candidates 的创建链路（最大风险点：createCandidate 涉及 `duplicate-checker.service`，需覆盖查重）。

## 2. 上下文（已实读源码）

### 2.1 前端契约（`client/src/api/candidate.ts`）

- `createCandidate(data)` line 339：`POST /candidates`
- 输入（参考 CreateCandidateData / createCandidateSchema）：name/phone/email/education/school/currentCompany/currentPosition/expectedSalary/resumeUrl/source/sourceNote/referrer/intro/consentNote
- 响应：`{ success: true, data: { id, name, ... } }`

### 2.2 后端现状（`server/src/routes/candidates.ts` line 195-201）

```ts
router.post(
  '/',
  authenticate,
  requireMatrixPermission('candidate:create'),
  validate(createCandidateSchema),
  candidateController.createCandidate
);
```

- `createCandidateSchema`（line 76-91）：全 optional + `.passthrough()`
- `requireMatrixPermission('candidate:create')`：RBAC 矩阵权限（admin/hr 通过）
- `candidateController.createCandidate` → `candidate.service.ts` 的 `createCandidate`
- 含查重（duplicate-checker.service，phone/email 匹配）

### 2.3 Schema（`server/prisma/schema.prisma`）

- `Candidate.id` cuid / `name` String? / `phone` String? / `email` String? / `education` String?
- `consentAt` DateTime? / `consentNote` String? / `anonymizedAt` DateTime?
- 软删：`deletedAt` DateTime?

### 2.4 现有 integration test 模式（`server/tests/integration/auth.test.ts`、`users-create.test.ts`）

- `vi.hoisted(() => { process.env.DATABASE_URL/JWT_SECRET/... })`
- `vi.mock('../../src/lib/redis', ...)` + `vi.mock('../../src/lib/prisma', ...)`
- `app = express(); app.use(express.json()); app.use('/api/candidates', candidatesRoutes); app.use(errorHandler)`
- `signAdminToken()` / `signMemberToken()` 用 jsonwebtoken
- `mockAuthUser(user)` 模拟 auth 中间件的 findUnique

## 3. 必读约束

### 3.1 反直觉点

1. **`requireMatrixPermission('candidate:create')` 实际校验的是 RBAC 矩阵**：admin/hr 通过，hiring_manager/interviewer 拒。需要 mock 让该中间件放行（或对 admin 角色直接放过）。
2. **createCandidateSchema 全 optional**：理论上只传空对象 `{}` 也可能通过 schema 校验（service 层会校验至少一个联系方式）。集成测试需覆盖 service 抛错的场景。
3. **查重逻辑**：candidate.service 的 createCandidate 会先查重（duplicate-checker.service）。集成测试要 mock 查重方法或返回 null（无重复）。
4. **Candidate 软删**：`DELETE /api/candidates/:id` 是软删（设置 `deletedAt`），不是真删。集成测试断言 delete 后 `deletedAt` 被设置（mock 验证）。

### 3.2 权限矩阵

| 场景 | admin | hr | hiring_manager | interviewer |
|---|---|---|---|---|
| POST /api/candidates | ✅ | ✅ | ❌ | ❌ |
| GET /api/candidates/:id | ✅（可见全部） | ✅（按可见性） | ✅（按可见性） | ❌ |

> **集成测试覆盖**：admin/hr 通过；hiring_manager/interviewer 403

### 3.3 审计/日志约定

- 集成测试不强制断言 OperationLog（service 层会写，但 mock 实现可能跳过）。focus 在核心业务流。

## 4. 实施任务

### 4.1 ✱ `staging/E2E-P3/server/tests/integration/candidates-create.test.ts`

覆盖 6-8 个用例（mock prisma + supertest）：

1. **admin 创建候选人（带姓名+手机）→ 201**
   - mockAuthUser(admin)
   - mock 查重 findFirst → null（无重复）
   - mock candidate.create → 返回新候选人（含 id/name/phone/createdAt）
   - 断言 201 + data 含 id/name

2. **hr 创建候选人 → 201**（同样路径，但 role='hr'，验证 RBAC 通过）

3. **缺关键联系方式（无 phone/email）→ 400 或 service 抛错**
   - service 层要求至少一个联系方式 → 400

4. **重复手机号 → 409**
   - mock 查重 findFirst 返回已存在候选人 → 409

5. **hiring_manager 创建 → 403**（RBAC 拒）
   - mock auth user role='hiring_manager' → 期望 403

6. **未登录创建 → 401**

7. **email 格式非法 → 400**（虽然 schema 全 optional，但 passthrough 会让非法 email 进入 service 层，service 需校验）

8. **consentNote 不传 / 传 null / 传字符串 → 行为正确**

> Mock 关键：`prisma.candidate.findFirst` / `prisma.candidate.create` / `prisma.candidate.update` / `prisma.operationLog.create` —— 全 mock。auth 用 `mockAuthUser` 模式（P2.5 已示范）。

### 4.2 ✱ `staging/E2E-P3/e2e/tests/_candidates-crud.spec.ts`

3-4 个 e2e 用例（admin project，API 层）：

1. **admin 创建 → 列表出现 → 详情正确 → 软删闭环**
   - POST /api/candidates → 201
   - GET /api/candidates?page=1&pageSize=50 → 列表含新候选人
   - GET /api/candidates/:id → 200 + 返回候选人
   - DELETE /api/candidates/:id → 200（软删）

2. **重复手机号 → 409**

3. **缺联系方式 → 400**

> 用 `loadAdminToken()` 从 `.auth/admin.json` 显式读 token（与 P2.5 一致）。
> 文件命名 `_candidates-crud.spec.ts`（下划线前缀，role project 专用）。

### 4.3 ✱ apply 脚本 `apply-e2e-p3.ps1` / `.cmd`

照抄 P2.5 的 apply 脚本模式：
- 排除名：`apply-e2e-p3.ps1` / `apply-e2e-p3.cmd` / `README.md` / `STAGING_REPORT.md`
- TargetDir 向上 5 级解析仓库根
- ps1 必须 UTF-8 带 BOM（PowerShell 5.1 兼容）

### 4.4 ✱ `README.md` + `STAGING_REPORT.md`

模板与 P2.5 相同，重点说明：
- 集成测试用例清单（6-8 条）+ 覆盖矩阵
- e2e 用例清单（3-4 条）
- 越界自检（staging 只允许 §6.1 路径）
- 回退方式（apply -R + 删新增文件）

## 5. 关键决策点

### 5.1 为什么本切片只测 create 链路
list/get/delete 已经在现有 candidates.spec.ts 覆盖（用 helpers.ts 旧 JWT）。本切片专注「create 链路 + 查重」这个最大风险点，与 P2.5 风格一致（小而精）。

### 5.2 为什么 requireMatrixPermission 不需要单独 mock
admin 角色在 RBAC 矩阵下默认通过 `candidate:create`；只需 mock auth user role='admin' 即可触发该中间件放行。hiring_manager 拒的场景靠 mock role='hiring_manager' 触发。

### 5.3 为什么集成测试 mock findFirst 不返回 deletedAt
查重（duplicate-checker）只查 `deletedAt: null` 的活跃记录。Mock `findFirst` 返回 null（无重复）即可。重复场景 mock 返回带 deletedAt=null 的候选人。

### 5.4 不做的
- 不改后端 candidate.service.ts（无 bug 修复需求）
- 不改前端 candidate.ts（无 bug 修复需求）
- 不改 prisma schema / migrations
- 不补 data-testid（P2 之后才补）
- 不跑验收命令

## 6. 修改文件清单

### 6.1 staging 产出（5 个）

1. ✱ `server/tests/integration/candidates-create.test.ts`（新增）
2. ✱ `e2e/tests/_candidates-crud.spec.ts`（新增）
3. ✱ `apply-e2e-p3.ps1` / `apply-e2e-p3.cmd`
4. ✱ `README.md` + `STAGING_REPORT.md`

### 6.2 禁止修改

- `client/**`
- `server/src/**`（routes/services/controllers/middleware/lib）
- `server/prisma/**`（schema / migrations / seed*）
- `e2e/helpers.ts` `e2e/global-setup.ts` `e2e/playwright.config.ts`
- 现有 13 个 `*.spec.ts`（非下划线）
- `_smoke.spec.ts` `_menu-matrix.spec.ts` `_users-crud.spec.ts`（P0/P1/P2.5 产出）
- `package.json` / `.gitignore` / `.github/**` / `docker-compose.e2e.yml`

### 6.3 越界检测（交付前自检）

- staging 目录只允许 §6.1 路径
- apply 后 `git diff --stat -- client server/src server/prisma e2e/helpers.ts e2e/global-setup.ts e2e/playwright.config.ts` 必须 **0 行**
- apply 后 `git status --short` 仅允许：`?? server/tests/integration/candidates-create.test.ts` + `?? e2e/tests/_candidates-crud.spec.ts`

## 7. 验收标准

### 7.1 硬性验收（DSH 审核方人工执行）

| 检查 | 通过标准 |
|---|---|
| `cd server && npx tsc --noEmit` | 0 错（不得新增） |
| `cd server && npx vitest run tests/integration/candidates-create.test.ts` | 6-8 用例全过 |
| `cd server && npx vitest run` | 基线 + 新增全过（无回归） |
| `cd e2e && npx playwright test --project=admin tests/_candidates-crud.spec.ts` | 3-4 用例全过 |
| 越界 | client / server/src / server/prisma / e2e 既有 0 行 |

### 7.2 交付报告模板（STAGING_REPORT.md）

1. 完成范围（2 个测试文件 + apply/说明）
2. 集成测试用例清单（6-8 条）+ 覆盖矩阵
3. e2e _candidates-crud.spec.ts 实现说明（与 P2.5 同：显式 Bearer token）
4. 越界自检
5. 已知风险（requireMatrixPermission 实际行为 / 软删 vs 硬删）
6. 回退方式（apply -R + 删新增文件）
7. 红线自检确认（强约束 1-7）

按本提示词直接执行（headless 无人工确认）：先输出实施计划，然后动手到 staging/E2E-P3/。**不要写到仓库根！** 最终回复给出完整交付报告。
