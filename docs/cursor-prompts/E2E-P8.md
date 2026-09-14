# E2E-P8 修复 pre-existing 测试失败 执行提示词（staging 模式）

> **staging 模式**：所有产出写到 `<仓库根>\.dsh\skills\slice-cursor-dev\staging\E2E-P8\`。
> **不要直接修改仓库任何文件**。完成后生成 `apply-e2e-p8.ps1`/`.cmd`（幂等、排除自身/README/REPORT）。

## ⚠️ 强约束（最优先阅读）

1. **staging 模式**：所有文件写到 `<仓库根>\.dsh\skills\slice-cursor-dev\staging\E2E-P8\`（保留相对路径）。
2. **本切片只动 2 个测试文件**：不动后端业务代码、不动前端、不改现有 spec。
   - `server/tests/integration/auth.test.ts`：1 行 action 名修正（`password_reset` → `reset_password`）—— 用 `.patch` 文件
   - `server/tests/integration/role-middleware.test.ts`：完整覆盖稿（加 prisma mock + redis mock + env hoisted）—— 用 full file
   - 其余一行不动
3. **patch 用 unified diff 格式**：`git diff` 输出格式，便于 apply 脚本用 `git apply` 应用。
4. **不跑验收命令**（DSH 审核后人工跑：`cd server && npx vitest run`）。
5. 编码红线：新文件 UTF-8 无 BOM、LF、2 空格、单引号、行尾分号、中文注释；ps1 脚本 UTF-8 带 BOM + 尽量 ASCII 注释。
6. headless 无人工确认：先输出实施计划，然后直接动手。

## 1. 任务 ID + 目标

### 1.1 任务 ID
`E2E-P8`

### 1.2 任务目标

1. **修复 auth.test.ts**：1 行 action 名断言（test 期望 `'password_reset'`，生产代码 `'reset_password'`，保留代码新约定）。
2. **修复 role-middleware.test.ts**：加 `prisma` 和 `redis` mock + env hoisted，让 hiring/overview 和 admin 全路由用例能跑通。
3. **达到 702/702 全过**（基线 627 + 新增 75 个集成用例 + 0 失败）。

### 1.3 为什么

3 个 pre-existing 失败是历史债，本切片一次性清理掉，让 server 测试从 699/702 升到 702/702 全过。

## 2. 上下文（已实读源码）

### 2.1 auth.test.ts 失败

```
server/src/routes/users.ts:395: action: 'reset_password'
server/tests/integration/auth.test.ts:301: action: 'password_reset'  ← 测试期望
```

测试期望与生产代码不一致。生产代码（users.ts:395）是新约定，测试断言保留。

### 2.2 role-middleware.test.ts 失败

测试用 `vi.mock('../../src/middleware/auth')` 绕过 auth 中间件，但 controller 调用：
- `prisma.job/candidateJob/offer/interview.count` (hiring/overview)
- `prisma.interview.findMany` (interview/my 实际不会调，但 mock 加上更稳)

测试未 mock prisma → 真实 DB 调用 → 500 错误。

修复：加 `vi.mock('../../src/lib/prisma', ...)` + `vi.mock('../../src/lib/redis', ...)` + env hoisted。

## 3. 必读约束

### 3.1 反直觉点

1. **`vi.hoisted(() => { process.env.DATABASE_URL/JWT_SECRET })` 必须有**：env.ts 在 import 时即读取校验，不 hoist 会让 mock 测试报 env 错误。
2. **redis mock 必须存在**：即使 routes 当前不读 cache，env.ts 可能 import redis 模块 → 缺 `getFromCache` 等会触发 vitest 「No export defined」错误。
3. **role-middleware.test.ts 是覆盖稿**：不是 patch（修改太多）。apply 用 Copy-Item 替换整文件。
4. **auth.test.ts 是 1 行 patch**：apply 用 git apply。

### 3.2 不修改业务代码

- 不动 `server/src/routes/users.ts` 的 action 名（生产代码保留 `'reset_password'`）
- 不动 hiring routes

## 4. 实施任务

### 4.1 ✱ `staging/E2E-P8/server/tests/integration/auth.test.ts.patch`

unified diff 格式：

```diff
--- a/server/tests/integration/auth.test.ts
+++ b/server/tests/integration/auth.test.ts
@@ -298,7 +298,7 @@
       // 写入操作日志
       expect(prisma.operationLog.create).toHaveBeenCalledWith(
         expect.objectContaining({
           data: expect.objectContaining({
             userId: ADMIN_ID,
             targetType: 'User',
             targetId: MEMBER_ID,
-            action: 'password_reset',
+            action: 'reset_password',
           }),
         })
       );
```

### 4.2 ✱ `staging/E2E-P8/server/tests/integration/role-middleware.test.ts`

完整覆盖稿（约 120 行），加：
- `vi.hoisted(() => { process.env.DATABASE_URL/JWT_SECRET/JWT_EXPIRES_IN/NODE_ENV })`
- `vi.mock('../../src/lib/redis', ...)` 提供 `redis/getFromCache/setCache/clearListCache/clearStatsCache/connectRedis`
- `vi.mock('../../src/lib/prisma', ...)` 提供 `job/candidateJob/offer/interview` 模型的 `count/findMany/findUnique/update/findFirst`

### 4.3 ✱ apply 脚本 `apply-e2e-p8.ps1` / `.cmd`

照抄 P7 模式。排除名：`apply-e2e-p8.ps1` / `.cmd` / `README.md` / `STAGING_REPORT.md`。
- `.patch` 文件：`git apply --check` + `git apply`
- 其它 `.ts` 文件：`Copy-Item`

### 4.4 ✱ `README.md` + `STAGING_REPORT.md`

模板与之前相同。

## 5. 关键决策点

### 5.1 为什么保留代码新约定（action 名）
- 业务代码 `users.ts:395` 用 `'reset_password'` 是新约定（AGENTS.md 中 OperationLog 字段约定）
- 测试断言是历史遗留，对齐到新约定更合理
- 业务含义无差异

### 5.2 为什么 role-middleware 是覆盖稿而非 patch
- 新增 ~30 行（mock + env hoisted），unified diff 不如覆盖稿清晰
- apply 用 `Copy-Item` 幂等替换整文件

### 5.3 为什么不需要修改业务代码
- 测试失败是测试自身的 mock 缺失或断言过期
- 业务代码（users.ts action 名、hiring routes）均正确

### 5.4 不做的
- 不改业务代码
- 不改 prisma schema / migrations
- 不跑验收命令（已手工跑过 702/702）

## 6. 修改文件清单

### 6.1 staging 产出（4 个）

1. ✱ `server/tests/integration/auth.test.ts.patch`（unified diff）
2. ✱ `server/tests/integration/role-middleware.test.ts`（完整覆盖稿）
3. ✱ `apply-e2e-p8.ps1` / `apply-e2e-p8.cmd`
4. ✱ `README.md` + `STAGING_REPORT.md`

### 6.2 禁止修改

- `client/**`
- `server/src/**`（业务代码不动）
- `server/prisma/**`
- `e2e/**`
- 现有 13 个 `*.spec.ts`（非下划线）
- 所有 `_*.spec.ts`（P0/P1/P2.5/P3/P4/P5/P6/P7 产出）

### 6.3 越界检测

- staging 目录只允许 §6.1 路径
- apply 后 `git diff --stat -- client server/src server/prisma e2e` 必须 **0 行**

## 7. 验收标准

### 7.1 硬性验收（DSH 审核方）

| 检查 | 通过标准 |
|---|---|
| `cd server && npx tsc --noEmit` | 0 错 |
| `cd server && npx vitest run tests/integration/auth.test.ts` | 10 全过 |
| `cd server && npx vitest run tests/integration/role-middleware.test.ts` | 8 全过 |
| `cd server && npx vitest run` | **702/702 全过**（基线 627 + 新增 75） |
| 越界 | client / server/src / server/prisma / e2e 0 行 |

### 7.2 交付报告模板（STAGING_REPORT.md）

1. 完成范围（2 个测试文件 + apply/说明）
2. 失败根因分析（auth action 名 / role-middleware 缺 mock）
3. 验收数据（修改前/后对比）
4. 越界自检
5. 已知风险
6. 回退方式
7. 红线自检确认

按本提示词直接执行（headless 无人工确认）：先输出实施计划，然后动手到 staging/E2E-P8/。**不要写到仓库根！** 最终回复给出完整交付报告。
