# E2E-P0 E2E 自动化地基 执行提示词（staging 模式）

> **staging 模式**：你必须把所有产出文件写到 `D:\kimi\recruiting-system\.dsh\skills\slice-cursor-dev\staging\E2E-P0\` 下。
> **不要直接修改仓库任何文件**（包括 `e2e/`、`server/`、`client/`、`.github/`、`.gitignore`）。
> 完成后必须额外生成 `apply-e2e-p0.ps1` 和 `apply-e2e-p0.cmd`（位于 staging 目录），由 DSH 审核后人工执行 apply，把 staging 复制到仓库根。
>
> **定位**：阶段 5 E2E 切片第 0 阶段（P0）。本切片只做"地基"，不写任何业务用例。
> **设计文档**：`D:\kimi\recruiting-system\docs\E2E-实施方案-v1.md`（仅作参考，不强制逐字执行）。

## ⚠️ 强约束（最优先阅读）

1. **staging 模式工作流**：
   - 所有文件写到 `D:\kimi\recruiting-system\.dsh\skills\slice-cursor-dev\staging\E2E-P0\`（以下简称 staging 目录）
   - 目录内**完整保留相对路径**（例如 `e2e/global-setup.ts` 写到 `staging/E2E-P0/e2e/global-setup.ts`，`server/package.json` 的 patch 写到 `staging/E2E-P0/server/package.json.patch` 或整文件复制 `staging/E2E-P0/server/package.json`）
   - 完成后**额外生成**两个脚本到 staging 根目录：
     - `apply-e2e-p0.ps1`（PowerShell 版）
     - `apply-e2e-p0.cmd`（cmd 双击版）
   - 这两个脚本的作用：把 staging 目录下的文件**复制/合并**到仓库根。例：`staging/E2E-P0/e2e/global-setup.ts` → `e2e/global-setup.ts`；`staging/E2E-P0/server/package.json` → `server/package.json`（覆盖原文件）。
   - apply 脚本必须**幂等**（可重复跑不出错），且**排除自身**（不复制 `apply-e2e-p0.ps1`、`apply-e2e-p0.cmd`、`README.md`、`STAGING_REPORT.md` 到仓库根）。
2. **不写业务数据 seed**：字典已由 `server/src/services/dictionary.service.ts:194-203` 首次访问时自动从 `DEFAULT_DICTIONARIES` 种子。Minimal seed 只做：4 角色用户（复用 `server/prisma/seed-test-users.ts`）+ 1 条默认 PipelineTemplate（name=`E2E-默认模板`，type=`社招`，stages 复用历史七阶段，isDefault=true，enabled=true）。
3. **不动 server 一行业务代码**：本切片只允许新增 `server/prisma/seed-e2e-minimal.ts`（staging 目录里写）+ 修改 `server/package.json`（仅追加 1 个 script，详见 §6）。**禁止**修改 `server/src/**`、`server/prisma/schema.prisma`、`server/prisma/migrations/**`、`server/prisma/seed.ts`、`server/prisma/seed-test-users.ts`、`server/prisma/seed-rbac.ts`。
4. **不动 client 一行业务代码**：禁止补 data-testid（那是 P2 的事）。
5. **不动现有 e2e/spec 文件**：现有 13 个 `e2e/tests/*.spec.ts` 与 `e2e/tests/helpers.ts` 必须**一行不动**（包括硬编码 JWT）。P0 阶段保留它们，新登录机制走 globalSetup 写 `.auth/*.json`。
6. **不跑验收命令**（DSH 审核后人工跑 `client pnpm type-check`、`client pnpm lint:check`、`server pnpm tsc --noEmit`、`server pnpm lint:check`、`server pnpm test`，必须满足 AGENTS.md 基线：lint 17354/267、tsc 0 错、vitest 611 用例）。
7. **零新增 npm 依赖**。
8. 编码红线：UTF-8 无 BOM、LF、2 空格缩进、单引号、行尾分号、中文注释。
9. headless 无人工确认：先输出实施计划，然后直接动手。

## 1. 任务 ID + 目标

### 1.1 任务 ID
`E2E-P0`

### 1.2 任务目标
搭好 E2E 自动化的地基（落地在 staging 目录），让 `npx playwright test e2e/tests/_smoke.spec.ts` 能跑通（apply 后）：
- 4 角色账号（admin / hr / hiring_manager / interviewer）能通过 UI 登录到 `/dashboard`
- 每个角色生成独立的 `storageState` 到 `e2e/.auth/<role>.json`
- 4 个角色账号 + 默认 PipelineTemplate 已 seed 到 e2e 库（5433）
- 与开发库（5432）物理隔离

### 1.3 验收切片（自验 + 交付）
- 新增 1 个 smoke spec：`e2e/tests/_smoke.spec.ts`，**只用 admin project**，跑 4 个 project = 4 用例（admin/hr/hiring_manager/interviewer），每个用例只断言"goto('/dashboard') 后能看到页面 title"。
- 不动现有 13 个 spec。

## 2. 上下文

### 2.1 项目位置
- 仓库根：`D:\kimi\recruiting-system\`
- `e2e/`（Playwright，**当前 `@playwright/test ^1.40` 但 lockfile 是 1.59.x** —— **本切片不动版本**）
- `server/prisma/seed-test-users.ts`（89 行，**已预制 4 角色账号**，**直接复用**，不要复制其内部逻辑）
- `server/prisma/seed.ts`（开发库 seed，不要复用，会清空全表）

### 2.2 关键已核实事实
- **`server/src/lib/env.ts:6` 用 `dotenv.config()`**，dotenv 默认**不覆盖已设环境变量**（已核实）→ `playwright.config.ts` 的 `webServer.env` 注入会生效，不新建 `.env.e2e`。
- **`server/src/services/mail.service.ts:15-16`**：SMTP_HOST/USER/PASS 任一空就跳过发信 → e2e env SMTP 全留空即天然禁用邮件。
- **`server/src/services/dictionary.service.ts:194-203`**：字典按分类 count=0 时从 `DEFAULT_DICTIONARIES` 自动 seed → e2e 不需要字典种子。
- **`server/prisma/seed-test-users.ts:45`**：导出 `seedTestUsers(client?: PrismaClient)` 接受可选 prisma 实例，方便被传入覆盖 DATABASE_URL 的 prisma。
- **`server/src/middleware/auth.ts` / `passwordSchema`**：JWT_SECRET 至少 32 字符（env.ts:17 校验）；登录走 bcrypt 校验，**不经过 passwordSchema**。
- **`server/prisma/schema.prisma` PipelineTemplate 表**（已存在）：字段 `name`、`type`（enum: 社招/校招/实习生）、`stages`（Json 数组）、`enabled`、`isDefault`、`createdAt`、`updatedAt`。
- **`e2e/playwright.config.ts:11` baseURL=`http://localhost:5174`**，与 webServer 启动 `pnpm dev --port 5174` 对应。
- **登录页（client/src/views/login/index.vue）**：登录表单含 email/password 输入框 + 提交按钮；登录成功后 router 跳 `/dashboard`。
- **dev 默认账户**：`admin@example.com` / `admin123`（seed.ts）；**e2e 用 `seed-test-users.ts` 的 4 角色**，两套不混用。

### 2.3 数据契约

**4 角色账号**（来自 seed-test-users.ts，不得改）：
| role | email | password | department |
|---|---|---|---|
| admin | admin@test.local | admin123 | null |
| hr | hr@test.local | hr123456 | null |
| hiring_manager | hiring@test.local | hiring123 | 研发部 |
| interviewer | interviewer@test.local | interview123 | 研发部 |

**PipelineTemplate 默认**：
```ts
{ name: 'E2E-默认模板', type: '社招', stages: ['入库','初筛','复试','终面','拟录用','Offer','入职'], enabled: true, isDefault: true }
```

**e2e 数据库连接**：
```
DATABASE_URL=postgresql://postgres:e2e_only_pw@localhost:5433/e2e_test?schema=public
REDIS_URL=redis://localhost:6381
```

**localStorage 字段**（与 `client/src/stores/auth.ts` 对齐）：
- `ats_token`（JWT）
- `ats_user`（JSON.stringify 后的 userInfo）

## 3. 必读约束

### 3.1 反直觉点

1. **staging 目录是写入目标，不是仓库根**。每个文件必须放在 `staging/E2E-P0/<相对仓库的路径>`，例：`e2e/global-setup.ts` 放在 `staging/E2E-P0/e2e/global-setup.ts`。apply 脚本负责把 staging 里的文件复制回仓库对应路径。
2. **`server/package.json` 修改方式**：不能整文件复制到 staging 然后 apply 覆盖（会丢失 .git 历史里的依赖列表）。建议**两种方式**任选其一：
   - **A（推荐）**：在 `staging/E2E-P0/server/package.json.patch` 写 unified diff，apply 脚本用 `git apply` 应用
   - **B**：在 `staging/E2E-P0/server/package.json` 写**完整新文件**，但必须在 STAGING_REPORT.md 注明「依赖/字段未变，仅追加 db:seed:minimal script」，apply 前 DSH 人工 diff 校验
   - **优先选 A**，diff patch 更安全。
3. **`.github/workflows/ci.yml` 修改**：同样建议走 patch 方式（`staging/E2E-P0/.github/workflows/ci.yml.patch`），避免整文件覆盖。
4. **`.gitignore` 修改**：同上，patch 方式。
5. **不写 data-testid**（P2 才补）。L1 矩阵用菜单文本定位。
6. **`seed-test-users.ts` 的 prisma 是模块级单例**，本切片**不能改它**，所以 minimal seed 里要**新建一个 PrismaClient**，用 `process.env.DATABASE_URL`（webServer.env 已注入），调 `seedTestUsers(myPrisma)` 传自定义实例。
7. **CI 端不需要 docker compose**：CI job 用 GHA services 起 PG/Redis（与 backend-test 同模式）。
8. **`.auth/` 必须加入 `.gitignore`**（含 localStorage cookies 缓存）。
9. **apply 脚本必须能识别 staging 目录的「patch / 完整文件」两种形态**：
   - 完整文件（路径与仓库一致）→ 直接 Copy-Item 覆盖
   - patch 文件（`.patch` 后缀）→ 用 `git apply --check` + `git apply` 应用

### 3.2 权限矩阵

| 文件 | admin | hr | hiring_manager | interviewer |
|---|---|---|---|---|
| 登录 `/login` | ✅ | ✅ | ✅ | ✅ |
| `/dashboard` | ✅ | ✅ | ✅ | ✅ |
| `/notifications` | ✅ | ✅ | ✅ | ✅ |

—— 4 角色登录后**任何**都会进 `/dashboard`。

## 4. 实施任务

### 4.1 ✱ `staging/E2E-P0/docker-compose.e2e.yml`

新增完整 compose 文件（41 行），内容与设计文档 §2.1 一致（PG 5433 + Redis 6381）。

### 4.2 ✱ `staging/E2E-P0/e2e/playwright.config.ts`

完整 Playwright 配置（含兼容改造）：
- baseURL=http://localhost:5174
- globalSetup=./global-setup.ts
- 4 个 role project（admin/hr/hiring_manager/interviewer）+ 原有 chromium project
- webServer[0]（server）：command=`cd ../server && pnpm dev:e2e`，env 注入完整 env 块（含 DATABASE_URL、REDIS_URL、JWT_SECRET 32字符、SMTP 全空、所有 cron 全空）
- webServer[1]（client）：command=`cd ../client && pnpm dev --port 5174`
- **注意**：原文件有 baseURL/workers/retries/reporter 等字段必须保留

### 4.3 ✱ `staging/E2E-P0/e2e/global-setup.ts`

完整 global-setup（约 90 行）：
- TCP 健康探测（`net.createConnection` 探测 127.0.0.1:5433 + 127.0.0.1:6381，不引入 pg 包）
- `execSync('docker compose -f docker-compose.e2e.yml up -d', { cwd: 项目根, stdio: 'inherit' })`（容错：失败时打 warn 不退出，CI 模式无 docker 也能继续）
- `execSync('npx prisma migrate deploy', { cwd: '<仓库根>/server', env: { ...process.env, DATABASE_URL: e2e URL } })`
- 创建 `PrismaClient({ datasources: { db: { url: e2e URL } } })`，调 `seedTestUsers(prisma)` 复用 seed-test-users 的逻辑，再插入默认 PipelineTemplate（仅当不存在）
- 启动 chromium，4 角色 UI 登录，存储 `e2e/.auth/<role>.json`：
  - goto('/login')
  - 第一个 input 填 email（`input[type="email"]` 或 fallback 到第一个 input）
  - `input[type="password"]` 填密码
  - 提交：`button[type="submit"]` 或 `button:has-text("登录")` 或 `.login-button`
  - 等待 `page.waitForURL(url => !url.pathname.startsWith('/login'), { timeout: 15000 })`

### 4.4 ✱ `staging/E2E-P0/e2e/fixtures/auth.ts`

导出 ROLES / CREDENTIALS / loginViaUI。loginViaUI 用 web-first 断言（`expect(page).toHaveURL(/\/dashboard/, { timeout: 15000 })`）。

### 4.5 ✱ `staging/E2E-P0/e2e/fixtures/data.ts`

骨架：导出 `makeJob(request, over)`，调用 `POST /api/jobs`（P2 才用）。仅骨架，不被 smoke 用到。

### 4.6 ✱ `staging/E2E-P0/e2e/fixtures/menu-matrix.ts`

骨架：导出 `MENU_MATRIX`、`EXPECTED_VISIBLE`、`EXPECTED_HIDDEN` 三个空数组（P1 才填）。

### 4.7 ✱ `staging/E2E-P0/e2e/utils/testids.ts`

骨架：导出 `TESTIDS` 常量对象（含 loginEmail/loginPassword/loginSubmit 占位）。

### 4.8 ✱ `staging/E2E-P0/e2e/tests/_smoke.spec.ts`

smoke spec，仅 1 个 test：
```ts
import { test, expect } from '@playwright/test';
test('@smoke admin 角色 storageState 验证', async ({ page }) => {
  await page.goto('/dashboard');
  await expect(page).toHaveURL(/\/dashboard/);
  await expect(page.locator('.page-title, h1, h2').first()).toBeVisible({ timeout: 10000 });
});
```
注：用 admin project 跑（其它 3 project 也跑同一 spec，共 4 用例）。**不修改** `e2e/tests/helpers.ts` 与现有 13 个 spec。

### 4.9 ✱ `staging/E2E-P0/server/prisma/seed-e2e-minimal.ts`

新增 seed 文件，复用 `seed-test-users.ts` 的 `seedTestUsers(prisma)`。再插入默认 PipelineTemplate。

### 4.10 ✱ `staging/E2E-P0/server/package.json.patch`

unified diff 格式 patch：
```diff
--- a/server/package.json
+++ b/server/package.json
@@ -21,6 +21,7 @@
     "db:seed": "tsx prisma/seed.ts",
     "db:seed:test-users": "tsx prisma/seed-test-users.ts",
+    "db:seed:minimal": "tsx prisma/seed-e2e-minimal.ts",
     "db:reset": "prisma migrate reset",
     "test": "vitest run",
```
注：实际行号以仓库当前 server/package.json 为准。用 `git diff` 生成。

### 4.11 ✱ `staging/E2E-P0/.gitignore.patch`

unified diff 格式 patch（追加 `e2e/.auth/` 行）：
```diff
--- a/.gitignore
+++ b/.gitignore
@@ -57,3 +57,6 @@
 # Playwright reports
 e2e/playwright-report/
+
+# Playwright auth state（4 角色 storageState 缓存，含 JWT cookie，禁止入库）
+e2e/.auth/
```

### 4.12 ✱ `staging/E2E-P0/.github/workflows/ci.yml.patch`

unified diff 格式 patch，**仅追加 1 个 e2e-test job**（不改 backend-test）。参考设计文档 §4.12 的 job 内容。**务必删除重复的 `pnpm/action-setup` 步骤**（保留 1 个）。

### 4.13 ✱ `staging/E2E-P0/apply-e2e-p0.ps1`

PowerShell apply 脚本（约 60 行）：
- 参数：`-StagingDir`（默认 `D:\kimi\recruiting-system\.dsh\skills\slice-cursor-dev\staging\E2E-P0`）+ `-TargetDir`（默认 `D:\kimi\recruiting-system`）
- 逻辑：
  1. 遍历 staging 目录所有文件（排除 `apply-e2e-p0.ps1`、`apply-e2e-p0.cmd`、`README.md`、`STAGING_REPORT.md`）
  2. 对 `.patch` 文件：用 `git apply --check $patchPath` 校验 + `git apply $patchPath` 应用
  3. 对其它文件：Copy-Item 到 TargetDir 对应相对路径（覆盖）
  4. 输出每个文件的应用结果
- 幂等：可重复跑，Copy-Item 覆盖 + git apply 幂等

### 4.14 ✱ `staging/E2E-P0/apply-e2e-p0.cmd`

cmd 双击版（约 30 行）：调 powershell 跑 apply-e2e-p0.ps1，pause 让用户看输出。

### 4.15 ✱ `staging/E2E-P0/README.md`

简要说明本 staging 内容、apply 步骤、回退方式（git revert）。

### 4.16 ✱ `staging/E2E-P0/STAGING_REPORT.md`

交付报告（按 §6 模板）。

## 5. 关键决策点

### 5.1 为什么用 staging 模式
DSH 沙箱限制 agent 直接写仓库根（diet-record 实测），且当前 Cursor API `agentn.global` 不可达只能走 `api2.cursor.sh`（reader/writer/diet-record 都用此模式）。staging 模式是本机器环境下唯一可行的写法。

### 5.2 为什么 minimal seed 不种字典
`server/src/services/dictionary.service.ts:194-203` lazy seed 已覆盖。避免重复。

### 5.3 为什么不动 helpers.ts
现有 13 个 spec 仍用 `e2e/tests/helpers.ts` 硬编码 JWT。**P0 改了会立即大面积红**。留待独立切片（E2E-P0-B）替换。

### 5.4 为什么 .auth/ 加 .gitignore
storageState JSON 包含 `ats_token` JWT、cookie、localStorage，泄露可登录 e2e 库。

### 5.5 为什么 chromium project 不挂 storageState
现有 13 个 spec 仍走 helpers 硬编码 JWT，不依赖 storageState。新 4 project 是 P1+ 的。

### 5.6 GHA services 用 5432
GitHub Actions service container 每个 job 独立，5432 在 e2e-test job 内独占。

### 5.7 不做的
- 不改 `e2e/tests/helpers.ts`
- 不改 `e2e/tests/*.spec.ts`（13 个全部）
- 不写业务 spec
- 不写 data-testid
- 不升 Playwright 版本
- 不删 `e2e/package.json` 已有的 `@playwright/test ^1.40`
- 不跑 npm install / pnpm install / npm test / tsc / lint

## 6. 修改文件清单（staging 视角）

### 6.1 staging 产出文件清单（13 个；✱=新增完整文件，PATCH=patch 文件）
1. ✱ `docker-compose.e2e.yml`
2. ✱ `e2e/playwright.config.ts`（整文件覆盖，因 playwright.config.ts 现有不大且改动面较大）
3. ✱ `e2e/global-setup.ts`
4. ✱ `e2e/fixtures/auth.ts`
5. ✱ `e2e/fixtures/data.ts`
6. ✱ `e2e/fixtures/menu-matrix.ts`
7. ✱ `e2e/utils/testids.ts`
8. ✱ `e2e/tests/_smoke.spec.ts`
9. ✱ `server/prisma/seed-e2e-minimal.ts`
10. ✱ `server/package.json.patch`（或完整 server/package.json + STAGING_REPORT 注明）
11. ✱ `.gitignore.patch`
12. ✱ `.github/workflows/ci.yml.patch`
13. ✱ `apply-e2e-p0.ps1`
14. ✱ `apply-e2e-p0.cmd`
15. ✱ `README.md`（staging 说明）
16. ✱ `STAGING_REPORT.md`（交付报告）

### 6.2 apply 后落到仓库的路径映射
| staging 路径 | 仓库路径 |
|---|---|
| `docker-compose.e2e.yml` | `<root>/docker-compose.e2e.yml` |
| `e2e/playwright.config.ts` | `<root>/e2e/playwright.config.ts`（**覆盖**） |
| `e2e/global-setup.ts` | `<root>/e2e/global-setup.ts` |
| `e2e/fixtures/auth.ts` | `<root>/e2e/fixtures/auth.ts` |
| `e2e/fixtures/data.ts` | `<root>/e2e/fixtures/data.ts` |
| `e2e/fixtures/menu-matrix.ts` | `<root>/e2e/fixtures/menu-matrix.ts` |
| `e2e/utils/testids.ts` | `<root>/e2e/utils/testids.ts` |
| `e2e/tests/_smoke.spec.ts` | `<root>/e2e/tests/_smoke.spec.ts` |
| `server/prisma/seed-e2e-minimal.ts` | `<root>/server/prisma/seed-e2e-minimal.ts` |
| `server/package.json.patch` | git apply 到 `<root>/server/package.json` |
| `.gitignore.patch` | git apply 到 `<root>/.gitignore` |
| `.github/workflows/ci.yml.patch` | git apply 到 `<root>/.github/workflows/ci.yml` |
| `apply-e2e-p0.ps1` / `apply-e2e-p0.cmd` | **不复制**（仅在 staging 目录） |
| `README.md` / `STAGING_REPORT.md` | **不复制**（仅在 staging 目录） |

### 6.3 越界检测（自检）
- `staging/E2E-P0/` 内**只能出现 §6.1 列出的文件**，不得有其它文件
- 不要在 staging 里写 `prisma/schema.prisma` 改动、`seed.ts`/`seed-test-users.ts` 改动、`server/src/**` 改动、`client/src/**` 改动

## 7. 验收标准

### 7.1 硬性验收（DSH 人工跑 apply 后）
| 命令 | 基线 | 不得新增 |
|---|---|---|
| `server pnpm tsc --noEmit` | 0 错 | 0 新增 |
| `server pnpm lint:check` | 17354 errors / 267 warnings | 0 新增 |
| `server pnpm test` | 63 文件 / 611 用例全过 | 全过 |
| `client pnpm type-check` | 88 错 | 0 新增 |
| `client pnpm lint:check` | 137 errors / 224 warnings | 0 新增 |
| `git diff --stat -- client mobile server/src server/prisma/schema.prisma server/prisma/migrations server/prisma/seed.ts server/prisma/seed-test-users.ts server/prisma/seed-rbac.ts e2e/tests/helpers.ts e2e/tests/*.spec.ts e2e/package.json` | — | **必须 0 行** |

### 7.2 自验步骤（apply 之后）
1. 本地起 docker：`docker compose -f docker-compose.e2e.yml up -d` → 等 healthcheck 通过
2. migrate：`cd server && DATABASE_URL='postgresql://postgres:e2e_only_pw@localhost:5433/e2e_test?schema=public' npx prisma migrate deploy`
3. minimal seed：`cd server && pnpm db:seed:minimal`
4. 起 server：`cd server && NODE_ENV=test DATABASE_URL=... JWT_SECRET='e2e-only-secret-must-be-at-least-32-chars' SMTP_HOST='' ANONYMIZE_CRON='' EVALUATION_REMINDER_CRON='' REMINDER_CRON_ENABLED=false pnpm start`
5. 起 client：`cd client && pnpm dev --port 5174`
6. 跑 smoke：`cd e2e && pnpm test --project=admin --project=hr --project=hiring_manager --project=interviewer` → 4 project 各 1 用例 = **4 个用例全过**
7. 检查 `.auth/`：`ls e2e/.auth/*.json` → 4 个文件
8. 检查 global-setup 幂等性：再跑一次应不报错

### 7.3 交付报告模板（STAGING_REPORT.md 必须完整包含）
1. 完成范围概述（staging 文件清单 + apply 后仓库变更清单）
2. 逐文件 before→after 摘要（行号精确）
3. data-testid：P0 不补，明确说明
4. 越界自检：staging 目录全文列表 + apply 后 git status 预期（DSH 人工跑 apply 后实际验证）
5. 已知问题与遗留风险
6. 回退方式（`git apply -R` 撤销 patch + `rm` 新增文件）
7. 红线自检确认（强约束 1-9 逐条）

按本提示词直接执行（headless 无人工确认）：先输出实施计划，然后动手到 staging/E2E-P0/。**不要写到仓库根！** 最终回复给出完整交付报告。