# E2E-P0 E2E 自动化地基 执行提示词

> **定位**：阶段 5 E2E 切片第 0 阶段（P0）。本切片只做"地基"，不写任何业务用例。
> **设计文档**：`docs/E2E-实施方案-v1.md`（必读，但执行时**不需要逐字复述**，仅作参考）。

## ⚠️ 强约束（最优先阅读）

1. **纯脚手架**：本切片**不写任何 `.spec.ts` 用例**（P1/P2 才有）。只搭地基，跑通"4 角色 storageState 能登录到 /dashboard"即可。
2. **不写业务数据 seed**：字典已由 `server/src/services/dictionary.service.ts:194-203` 首次访问时自动从 `DEFAULT_DICTIONARIES` 种子（已核实），**不需要在 minimal seed 里写字典**。Minimal seed 只做：4 角色用户（复用 `seed-test-users.ts`）+ 1 条默认 PipelineTemplate（name='E2E-默认模板'，type='社招'，stages 复用历史七阶段，isDefault=true，enabled=true）。
3. **不动 server 一行业务代码**：本切片只允许改 `server/package.json`（加 `db:seed:minimal` 脚本）和**新增** `server/prisma/seed-e2e-minimal.ts`。**禁止**修改 `server/src/**`、`server/prisma/**`（schema/migrate）、`server/prisma/seed.ts`、`server/prisma/seed-test-users.ts`、`server/prisma/seed-rbac.ts`。
4. **不动 client 一行业务代码**：禁止改 `client/src/**`、禁止补 data-testid（那是 P2 的事）。
5. **不动 GHA workflow 文件体**：CI job 形态由审核方加（避免 runner 自己改 CI 触发无限循环）。本切片**只在 `.github/workflows/ci.yml` 末尾追加 1 个 job** —— 因为基线已有 `backend-test` job，新增一个 `e2e-test` job 是独立的、可逆的、必要的。
6. **不动现有 e2e/spec 文件**：现有 13 个 `e2e/tests/*.spec.ts` 与 `e2e/tests/helpers.ts` 必须**一行不动**。本切片只**新增** `e2e/global-setup.ts` + `e2e/fixtures/{auth,data,menu-matrix}.ts` + `e2e/utils/testids.ts`，并对 `e2e/playwright.config.ts` **做兼容改造**（不是替换，见 §4.2）。
7. **helpers.ts 不能改 → 无法做"删除硬编码 JWT"**。本切片 P0 阶段保留旧 `helpers.ts`（含硬编码 JWT）不动；新登录机制走 `loginViaUI()` 写入 `.auth/*.json`，旧 helpers 给旧 spec 用。P1 开始再统一替换旧 helpers（届时写一个独立切片 E2E-P0-B）。
8. **不跑验收命令**（审核方重跑：`client pnpm type-check` ≤ 88、`client pnpm lint:check` ≤ 137e/224w、`server pnpm tsc --noEmit` 0 错、`server pnpm lint:check` ≤ 17354e/267w、`server pnpm test` ≥ 63 文件 / 611 用例）。
9. **零新增 npm 依赖**：所有工具库（`@playwright/test`、`docker compose`、`tsx`、`prisma`）均已存在。
10. 编码红线：UTF-8 无 BOM、LF、2 空格缩进、单引号、行尾分号、中文注释。
11. headless 无人工确认：先输出实施计划，然后直接动手。

## 1. 任务 ID + 目标

### 1.1 任务 ID
`E2E-P0`

### 1.2 任务目标
搭好 E2E 自动化的地基，让 `npx playwright test e2e/tests/_smoke.spec.ts` 能跑通：
- 4 角色账号（admin / hr / hiring_manager / interviewer）能通过 UI 登录到 `/dashboard`
- 每个角色生成独立的 `storageState` 到 `e2e/.auth/<role>.json`
- 4 个角色账号 + 默认 PipelineTemplate 已 seed 到 e2e 库（5433）
- 与开发库（5432）物理隔离

### 1.3 验收切片（自验 + 交付）
- 仅新增 1 个 smoke spec：`e2e/tests/_smoke.spec.ts`，**只用 `chromium` project**，跑 4 个角色 × 1 个用例 = 4 个用例，每个用例只断言"登录后 URL 不再是 /login"。
- 不动现有 13 个 spec。

## 2. 上下文

### 2.1 项目位置
- `e2e/`（Playwright，**当前 `@playwright/test ^1.40` 但 lockfile 是 1.59.x** —— **本切片不动版本**，避免动 lockfile 让 CI 出岔；P0-B 再统一升版）
- `server/prisma/seed-test-users.ts`（89 行，**已预制 4 角色账号**，**直接复用**，不要复制）
- `server/prisma/seed.ts`（开发库 seed，不要复用，会清空全表 —— 与本切片 e2e 库冲突）

### 2.2 关键已核实事实
- **`server/src/lib/env.ts:6` 用 `dotenv.config()`**，且 dotenv 默认**不覆盖已设环境变量**（已核实）→ `playwright.config.ts` 的 `webServer.env` 注入会生效，不新建 `.env.e2e`。
- **`server/src/services/mail.service.ts:15-16`**：SMTP_HOST/USER/PASS 任一空就跳过发信 → e2e env SMTP 全留空即天然禁用邮件。
- **`server/src/services/dictionary.service.ts:194-203`**：字典按分类 count=0 时从 `DEFAULT_DICTIONARIES` 自动 seed → e2e 不需要字典种子。
- **`server/prisma/seed-test-users.ts`**：4 角色账号 email/password 全是明文（admin@test.local/admin123 等），导出 `seedTestUsers(client?)` 接受可选 prisma 实例（line 45），方便被传入覆盖 DATABASE_URL 的 prisma。
- **`server/src/middleware/auth.ts` / `passwordSchema`**：JWT_SECRET 至少 32 字符（env.ts:17 校验）；登录走 bcrypt 校验，**不经过 passwordSchema**（AGENTS §11 已确认）。
- **`server/prisma/schema.prisma` PipelineTemplate 表**（已存在）：字段 `name`、`type`（enum: 社招/校招/实习生）、`stages`（Json 数组）、`enabled`、`isDefault`、`createdAt`、`updatedAt`。
- **`e2e/playwright.config.ts:11` baseURL=`http://localhost:5174`**，但**当前 client dev 默认 5173**（已有 webServer 启动 `pnpm dev --port 5174`）—— 5174 是 e2e 专用端口，已 OK。
- **`client/src/views/login/index.vue`**（已存在）：登录表单含 email/password 输入框 + 提交按钮；登录成功后 router 跳 `/dashboard`。
- **本地 dev 默认账户**：`admin@example.com` / `admin123`（seed.ts）；**e2e 用 `seed-test-users.ts` 的 4 角色**，两套不混用。

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

1. **`seed-test-users.ts` 的 prisma 是模块级单例**（line 6），直接 `prisma.user.findUnique` 会用默认 `DATABASE_URL`。本切片**不能改它**，所以 minimal seed 里要**新建一个 PrismaClient**，用 `process.env.DATABASE_URL`（webServer.env 已注入），调 `seedTestUsers(myPrisma)` 传自定义实例，复用其内部 findUnique/create 逻辑（line 45 已支持）。
2. **默认 PipelineTemplate 与开发库 seed.ts 的 `标准招聘流程` 冲突**（同样 isDefault=true）。minimal seed 里用不同 name（`E2E-默认模板`）即可，不要共存冲突；不依赖 seed.ts。
3. **`global-setup.ts` 必须在 webServer 启动前完成 seed**（Playwright 文档保证：globalSetup 在 workers 启动前跑完）。但 webServer 命令是 `cd ../server && pnpm dev:e2e` 异步起 server —— **必须等 server 起来后**才能连库做 migrate？错，migrate 是连库命令，不依赖 server。**正确顺序**：docker up → wait health → prisma migrate deploy → seed-test-users + minimal-template → 启动浏览器 → 4 角色登录写 `.auth/*.json` → webServer 启动（实际由 Playwright 自动编排）。
4. **`docker-compose.e2e.yml` 用 `postgres:18-alpine`** 与基线 GHA backend-test 一致（`.github/workflows/ci.yml:14`）。
5. **`.auth/` 必须加入 `.gitignore`**（含 localStorage cookies 缓存）。
6. **CI 端不需要 docker compose**：CI job 用 GHA services 起 PG/Redis（与 backend-test 同模式），本切片**不写 GHA job 的 services 部分** —— 那是 .github/workflows/ci.yml 改动，由审核方加，避免 runner 改 CI 自激。
7. **4 角色登录写 `.auth/*.json` 用 API 注入最快**：但本切片**强制走 UI 登录**（方案 §2.3 第 161 行："顺带登录页本身终于被测到了"）。用 `page.goto('/login')` + `page.fill()` + `page.click()` + `expect(page).not.toHaveURL(/\/login/)`（web-first 断言）。
8. **登录页目前没有 `data-testid`**：用 `page.locator('input[type="email"]')` / `input[type="password"]` / `button[type="submit"]` / 提交按钮文本定位（方案 §0 决策 2 允许）。
9. **登录后 `router.push('/dashboard')` 是异步的**，`not.toHaveURL(/\/login/)` 不一定等到了 dashboard，要 `await expect(page).toHaveURL(/\/dashboard/, { timeout: 10000 })`（web-first）。

### 3.2 权限矩阵

| 文件 | admin | hr | hiring_manager | interviewer |
|---|---|---|---|---|
| 登录 `/login` | ✅ | ✅ | ✅ | ✅ |
| `/dashboard` | ✅ | ✅ | ✅ | ✅ |
| `/notifications` | ✅ | ✅ | ✅ | ✅ |

—— 4 角色登录后**任何**都会进 `/dashboard`，这是 §2.3 登录断言的依据。

### 3.3 审计/日志约定
- 本切片不写 OperationLog（seed 是 setup 阶段，不是业务行为）。
- globalSetup 的 stdout/stderr 写到 console（Playwright 默认），失败时 stderr 自动出现在测试报告。

## 4. 实施任务

### 4.1 ✱ `docker-compose.e2e.yml`（新增，本地专用）

```yaml
services:
  postgres:
    image: postgres:18-alpine
    container_name: ats_postgres_e2e
    environment:
      POSTGRES_USER: postgres
      POSTGRES_PASSWORD: e2e_only_pw
      POSTGRES_DB: e2e_test
    ports: ['127.0.0.1:5433:5432']
    healthcheck:
      test: ['CMD-SHELL', 'pg_isready -U postgres -d e2e_test']
      interval: 5s
      timeout: 5s
      retries: 20
    volumes: ['pg_e2e_data:/var/lib/postgresql']
  redis:
    image: redis:7-alpine
    container_name: ats_redis_e2e
    ports: ['127.0.0.1:6381:6379']
    healthcheck:
      test: ['CMD', 'redis-cli', 'ping']
      interval: 5s
      timeout: 3s
      retries: 20
volumes:
  pg_e2e_data:
```

### 4.2 `e2e/playwright.config.ts`（**兼容改造，不替换**）

**改造点**（最小 diff）：
1. `import { devices } from '@playwright/test'` 保留。
2. 加 `import path from 'path'`（如需）。
3. 在 `export default defineConfig({...})` **开头**加：
   ```ts
   globalSetup: path.join(__dirname, 'global-setup.ts'),
   ```
   （`__dirname` 在 ESM 不可用，请用 `import.meta.url` + `fileURLToPath`，或直接 `'./global-setup.ts'` —— Playwright 支持相对路径解析）
4. `projects` 数组**追加** 4 个 project（保留原 `chromium`）：
   ```ts
   { name: 'admin',          use: { ...devices['Desktop Chrome'], storageState: '.auth/admin.json' } },
   { name: 'hr',             use: { ...devices['Desktop Chrome'], storageState: '.auth/hr.json' } },
   { name: 'hiring_manager', use: { ...devices['Desktop Chrome'], storageState: '.auth/hiring_manager.json' } },
   { name: 'interviewer',    use: { ...devices['Desktop Chrome'], storageState: '.auth/interviewer.json' } },
   ```
5. **第一个** `webServer`（server）的 `env` 注入完整 env 块：
   ```ts
   env: {
     NODE_ENV: 'test',
     DATABASE_URL: 'postgresql://postgres:e2e_only_pw@localhost:5433/e2e_test?schema=public',
     REDIS_URL: 'redis://localhost:6381',
     JWT_SECRET: 'e2e-only-secret-must-be-at-least-32-chars',
     CORS_ORIGIN: 'http://localhost:5174',
     SMTP_HOST: '', SMTP_USER: '', SMTP_PASS: '',
     ANONYMIZE_CRON: '',
     EVALUATION_REMINDER_CRON: '',
     REMINDER_CRON_ENABLED: 'false',
     HR_SCORE_CRON: '',
     HIRING_DIGEST_CRON: '',
     INTERVIEWER_REMINDER_CRON: '',
     OTEL_EXPORTER_OTLP_ENDPOINT: '',
     SENTRY_DSN: '',
   },
   ```
6. **第二个** `webServer`（client）的 `command` 改为 `cd ../client && pnpm dev --port 5174`（已如此，**不动**）。
7. `testDir` / `fullyParallel` / `workers` / `retries` / `use.actionTimeout` 全部**保留原值**。
8. **新增** `reporter: [['list'], ['html', { open: 'never' }]]` —— 允许。
9. `timeout` 全局默认 60000（60s，覆盖长 seed 场景）。

> ⚠️ `__dirname` 在 `playwright.config.ts` 是 CommonJS 编译产物，**可用**（Playwright 默认用 esbuild 编译）。如报错改 `path.dirname(fileURLToPath(import.meta.url))`。

### 4.3 ✱ `e2e/global-setup.ts`（新增）

伪代码骨架（**严格按此实现**，不要自由发挥）：

```ts
import { chromium, FullConfig } from '@playwright/test';
import { execSync } from 'child_process';
import { Client } from 'pg';                  // pg 在哪？见 §4.3.1
import { seedTestUsers } from '../server/prisma/seed-test-users';
import { PrismaClient } from '@prisma/client';

const DATABASE_URL = 'postgresql://postgres:e2e_only_pw@localhost:5433/e2e_test?schema=public';

async function waitForPg() {
  const client = new Client({ connectionString: DATABASE_URL });
  for (let i = 0; i < 60; i++) {
    try {
      await client.connect();
      await client.query('SELECT 1');
      await client.end();
      return;
    } catch {
      await new Promise((r) => setTimeout(r, 1000));
    }
  }
  throw new Error('PG 未就绪');
}

async function waitForRedis() {
  // 用 net.Socket 连 127.0.0.1:6381 发 PING
  // 或调 `redis-cli -p 6381 ping`（与 docker-compose healthcheck 一致）
  execSync('redis-cli -p 6381 ping', { stdio: 'pipe' });
}

export default async function globalSetup(config: FullConfig) {
  // 1. 起 docker（本地）；CI 由 GHA services 提供，docker 不在 PATH 也 OK
  try {
    execSync('docker compose -f docker-compose.e2e.yml up -d', { stdio: 'inherit' });
  } catch (e) {
    console.warn('[globalSetup] docker compose 失败（CI 模式？继续）:', (e as Error).message);
  }

  // 2. 等健康
  await waitForPg();
  await waitForRedis();

  // 3. migrate
  execSync('npx prisma migrate deploy', {
    stdio: 'inherit',
    env: { ...process.env, DATABASE_URL },
  });

  // 4. seed 用户 + 默认模板
  const prisma = new PrismaClient({ datasources: { db: { url: DATABASE_URL } } });
  try {
    await seedTestUsers(prisma);
    // 默认 PipelineTemplate（仅当不存在时插入）
    const exist = await prisma.pipelineTemplate.findFirst({ where: { isDefault: true, type: '社招' } });
    if (!exist) {
      await prisma.pipelineTemplate.create({
        data: {
          name: 'E2E-默认模板',
          type: '社招',
          stages: ['入库','初筛','复试','终面','拟录用','Offer','入职'],
          enabled: true,
          isDefault: true,
        },
      });
      console.log('✅ E2E 默认 PipelineTemplate 已创建');
    }
  } finally {
    await prisma.$disconnect();
  }

  // 5. 4 角色 UI 登录写 storageState
  const ROLES = [
    { role: 'admin',          email: 'admin@test.local',        password: 'admin123' },
    { role: 'hr',             email: 'hr@test.local',           password: 'hr123456' },
    { role: 'hiring_manager', email: 'hiring@test.local',       password: 'hiring123' },
    { role: 'interviewer',    email: 'interviewer@test.local',  password: 'inter123' },
    // ⚠️ seed-test-users.ts 第 41 行：interviewer 密码是 'interview123'，不是 'inter123'！
  ] as const;
  // ↑ 修正：上表最后一行改为 password: 'interview123'

  const baseURL = config.projects?.[0]?.use?.baseURL ?? 'http://localhost:5174';
  const browser = await chromium.launch();
  try {
    for (const { role, email, password } of ROLES) {
      const ctx = await browser.newContext({ baseURL });
      const page = await ctx.newPage();
      await page.goto('/login');
      await page.locator('input[type="email"], input[autocomplete="username"], input').first().fill(email);
      await page.locator('input[type="password"], input[autocomplete="current-password"]').fill(password);
      await page.locator('button[type="submit"], button:has-text("登录"), .login-button').first().click();
      // web-first 断言：等待跳到非 /login
      await page.waitForURL((url) => !url.pathname.startsWith('/login'), { timeout: 15000 });
      await ctx.storageState({ path: `.auth/${role}.json` });
      await ctx.close();
      console.log(`✅ ${role} storageState 已写入 .auth/${role}.json`);
    }
  } finally {
    await browser.close();
  }

  console.log('🎉 E2E global-setup 完成');
}
```

#### 4.3.1 `pg` 包不存在时的处理
`pg` 没在 `e2e/package.json` devDependencies 里。**两种选择**（任选其一）：
- **A**（推荐）：用 TCP socket 手写 ping（`net.createConnection({ host: '127.0.0.1', port: 5433 })`，连上 + 关闭），不引入 pg。
- **B**：在 `e2e/package.json` 加 `pg: ^8.x` + 重装。**新增依赖会改 lockfile，违反 §6 红线**。

→ **采用 A**。globalSetup 里写个 `waitForTcp(host, port)` 工具函数，PG 和 Redis 都用它。

#### 4.3.2 `prisma` 命令必须在 server 目录下跑
`execSync('npx prisma migrate deploy', ...)` 在 e2e 根目录会失败。**改 cwd**：

```ts
execSync('npx prisma migrate deploy', {
  cwd: path.join(__dirname, '..', 'server'),  // 或 '../server'
  stdio: 'inherit',
  env: { ...process.env, DATABASE_URL },
});
```

> `__dirname` 在 ESM 编译产物可能不可用，请用 `import.meta.url` + `fileURLToPath`。

#### 4.3.3 Redis health check
`redis-cli` 在 Windows 上不一定可用。**改用 TCP**：

```ts
async function waitForTcp(host: string, port: number, label: string) {
  for (let i = 0; i < 60; i++) {
    try {
      await new Promise<void>((resolve, reject) => {
        const net = require('net');
        const sock = net.createConnection({ host, port }, () => { sock.end(); resolve(); });
        sock.on('error', reject);
        sock.setTimeout(2000, () => sock.destroy());
      });
      console.log(`✅ ${label} ${host}:${port} 健康`);
      return;
    } catch {
      await new Promise((r) => setTimeout(r, 1000));
    }
  }
  throw new Error(`${label} ${host}:${port} 60s 内未就绪`);
}
```

→ **统一 TCP 探测**，redis 用 `127.0.0.1:6381`，pg 用 `127.0.0.1:5433`。

### 4.4 ✱ `e2e/fixtures/auth.ts`（新增，本切片只暴露类型 + loginViaUI，不被 smoke spec 直接用）

```ts
import type { Page } from '@playwright/test';
import { expect } from '@playwright/test';

export const ROLES = ['admin', 'hr', 'hiring_manager', 'interviewer'] as const;
export type Role = typeof ROLES[number];

export const CREDENTIALS: Record<Role, { email: string; password: string }> = {
  admin:          { email: 'admin@test.local',       password: 'admin123' },
  hr:             { email: 'hr@test.local',          password: 'hr123456' },
  hiring_manager: { email: 'hiring@test.local',      password: 'hiring123' },
  interviewer:    { email: 'interviewer@test.local', password: 'interview123' },
};

/**
 * 通过 UI 登录到 /dashboard（web-first 断言）。
 * 不被 P0 smoke 直接使用；预留给 P1+ 用例。
 */
export async function loginViaUI(page: Page, role: Role): Promise<void> {
  const { email, password } = CREDENTIALS[role];
  await page.goto('/login');
  await page.locator('input').first().fill(email);
  await page.locator('input[type="password"]').fill(password);
  await page.locator('button[type="submit"], button:has-text("登录"), .login-button').first().click();
  await expect(page).toHaveURL(/\/dashboard/, { timeout: 15000 });
}
```

### 4.5 ✱ `e2e/fixtures/data.ts`（新增，仅骨架，P2 才用）

```ts
import type { APIRequestContext } from '@playwright/test';
import { expect } from '@playwright/test';
import { randomUUID } from 'crypto';

export type JobInput = {
  title?: string;
  departments?: string[];
  level?: string;
  location?: string;
  type?: string;
  description?: string;
  requirements?: string;
  [k: string]: unknown;
};

/**
 * 通过 API 创建职位（需要 admin token）。
 * P0 阶段不调用，P2 阶段（L2 链路）使用。
 */
export async function makeJob(request: APIRequestContext, over: Partial<JobInput> = {}) {
  const suffix = randomUUID().slice(0, 8);
  const res = await request.post('/api/jobs', {
    data: {
      title: `E2E职位-${suffix}`,
      departments: ['研发部'],
      level: '中级',
      location: '上海',
      type: '全职',
      description: '<p>E2E 自动创建</p>',
      requirements: '<p>无</p>',
      ...over,
    },
  });
  expect(res.ok()).toBeTruthy();
  return { id: (await res.json()).data.id, suffix };
}
```

### 4.6 ✱ `e2e/fixtures/menu-matrix.ts`（新增，仅占位骨架，P1 才用）

```ts
// P1 填充：19 菜单 × 4 角色可见性矩阵（与 docs/E2E-实施方案-v1.md §3 表对齐）
export const MENU_MATRIX: ReadonlyArray<{
  path: string;
  title: string;
  visibleTo: ReadonlyArray<'admin' | 'hr' | 'hiring_manager' | 'interviewer'>;
}> = [];

export const EXPECTED_VISIBLE: ReadonlyArray<{
  role: 'admin' | 'hr' | 'hiring_manager' | 'interviewer';
  titles: ReadonlyArray<string>;
}> = [];

export const EXPECTED_HIDDEN: ReadonlyArray<{
  role: 'admin' | 'hr' | 'hiring_manager' | 'interviewer';
  titles: ReadonlyArray<string>;
}> = [];
```

### 4.7 ✱ `e2e/utils/testids.ts`（新增，仅占位）

```ts
// P2 阶段补 data-testid 时统一在这里集中管理常量
export const TESTIDS = {
  loginEmail: 'login-email',
  loginPassword: 'login-password',
  loginSubmit: 'login-submit',
} as const;
```

### 4.8 ✱ `e2e/tests/_smoke.spec.ts`（新增，P0 自验）

**只用 `chromium` project**（4 角色 project 需要 storageState，但本切片 chromium project 没 storageState—— chromium project 仍跑老 spec，不动；新 4 project 仅给后续 spec 用）。**等等：4 角色 project 必须能独立跑 smoke** —— 改为**新增 1 个 smoke 用例，用 `admin` project 跑**，足够证明地基通。

```ts
import { test, expect } from '@playwright/test';

test.describe('@smoke E2E 地基', () => {
  test('admin 角色 storageState 登录成功 + 进入 /dashboard', async ({ page }) => {
    // 由 admin project 提供 storageState，能跳过登录页直接到 /dashboard
    await page.goto('/dashboard');
    await expect(page).toHaveURL(/\/dashboard/);
    // 拿到 dashboard 任意已知文本（页面 title 或 KPI 卡片标题）
    await expect(page.locator('.page-title, h1, h2').first()).toBeVisible({ timeout: 10000 });
  });
});
```

> 这条 spec 用 `admin` project 跑（其他 3 project 不配置 testMatch 限制——默认会被 Playwright 跑一遍），会在 4 个 project 下各跑 1 次 = 4 用例，**覆盖 4 角色 storageState 都能让页面进入 dashboard**。

### 4.9 ✱ `server/prisma/seed-e2e-minimal.ts`（新增，复用 seed-test-users）

```ts
import { PrismaClient } from '@prisma/client';
import { seedTestUsers } from './seed-test-users';

const prisma = new PrismaClient({
  datasources: { db: { url: process.env.DATABASE_URL ?? 'postgresql://postgres:e2e_only_pw@localhost:5433/e2e_test?schema=public' } },
});

async function main() {
  console.log('[E2E-Minimal] 开始...');
  await seedTestUsers(prisma);

  // 默认 PipelineTemplate（E2E 隔离命名，避免与开发库 seed.ts 的「标准招聘流程」冲突）
  const exist = await prisma.pipelineTemplate.findFirst({ where: { name: 'E2E-默认模板' } });
  if (!exist) {
    await prisma.pipelineTemplate.create({
      data: {
        name: 'E2E-默认模板',
        type: '社招',
        stages: ['入库','初筛','复试','终面','拟录用','Offer','入职'],
        enabled: true,
        isDefault: true,
      },
    });
    console.log('✅ 默认 PipelineTemplate 创建成功');
  } else {
    console.log('⏭️  默认 PipelineTemplate 已存在，跳过');
  }

  console.log('🎉 E2E minimal seed 完成');
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(async () => { await prisma.$disconnect(); });
```

### 4.10 `server/package.json`（**仅加 1 个 script，不动其它**）

在 `scripts` 块**末尾**追加（保持字典序，逗号正确）：

```json
"db:seed:minimal": "tsx prisma/seed-e2e-minimal.ts"
```

**禁止**改其它 script、改 dependencies、改 devDependencies、改 prisma.seed 字段。

### 4.11 `.gitignore`（**仅追加 2 行**）

```gitignore
# Playwright auth state（4 角色 storageState 缓存，含 JWT cookie，禁止入库）
e2e/.auth/
```

> 单行追加即可（已存在 `test-results/` 等相邻块）。

### 4.12 ✱ `.github/workflows/ci.yml`（**仅追加 1 个 job，不动现有 backend-test**）

在文件末尾（line 74 之后）追加：

```yaml
  e2e-test:
    runs-on: ubuntu-latest
    services:
      postgres:
        image: postgres:18-alpine
        env:
          POSTGRES_USER: postgres
          POSTGRES_PASSWORD: e2e_only_pw
          POSTGRES_DB: e2e_test
        ports: ['5432:5432']
        options: >-
          --health-cmd "pg_isready -U postgres -d e2e_test"
          --health-interval 5s
          --health-timeout 5s
          --health-retries 10
      redis:
        image: redis:7-alpine
        ports: ['6379:6379']
        options: >-
          --health-cmd "redis-cli ping"
          --health-interval 5s
          --health-timeout 5s
          --health-retries 10
    env:
      NODE_ENV: test
      DATABASE_URL: postgresql://postgres:e2e_only_pw@localhost:5432/e2e_test?schema=public
      REDIS_URL: redis://localhost:6379
      JWT_SECRET: e2e-only-secret-must-be-at-least-32-chars
      CORS_ORIGIN: http://localhost:5174
      SMTP_HOST: ''
      SMTP_USER: ''
      SMTP_PASS: ''
      ANONYMIZE_CRON: ''
      EVALUATION_REMINDER_CRON: ''
      REMINDER_CRON_ENABLED: 'false'
      HR_SCORE_CRON: ''
      HIRING_DIGEST_CRON: ''
      INTERVIEWER_REMINDER_CRON: ''
      OTEL_EXPORTER_OTLP_ENDPOINT: ''
      SENTRY_DSN: ''
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v3
        with:
          version: 11
      - uses: pnpm/setup@v4   # mobile 不需要，这里只装 e2e + client + server 三个 workspace
        with:
          version: 11
      - uses: pnpm/action-setup@v3
        with:
          version: 11
      - name: Install workspace deps
        run: pnpm install --frozen-lockfile
      - name: Generate Prisma client
        run: npx prisma generate
        working-directory: server
      - name: Install Playwright browsers
        run: pnpm exec playwright install --with-deps chromium
        working-directory: e2e
      - name: Build server
        run: pnpm build
        working-directory: server
      - name: Build client
        run: pnpm build
        working-directory: client
      - name: Apply migrations (e2e)
        run: npx prisma migrate deploy
        working-directory: server
        env:
          DATABASE_URL: postgresql://postgres:e2e_only_pw@localhost:5432/e2e_test?schema=public
      - name: Seed e2e minimal
        run: pnpm db:seed:minimal
        working-directory: server
        env:
          DATABASE_URL: postgresql://postgres:e2e_only_pw@localhost:5432/e2e_test?schema=public
      - name: Run Playwright e2e
        run: pnpm test --project=admin --project=hr --project=hiring_manager --project=interviewer
        working-directory: e2e
      - name: Upload Playwright report
        if: always()
        uses: actions/upload-artifact@v4
        with:
          name: playwright-report
          path: e2e/playwright-report/
```

> ⚠️ 上面的 `pnpm/action-setup` 步骤重复了，**请删掉一个**，保留一个 `with: version: 11` 的步骤（参照 backend-test 写法）。

> ⚠️ GHA job 内**不要**调 `docker compose`，所有依赖都用 `services` 起。

## 5. 关键决策点

### 5.1 为什么 minimal seed 不种字典
`server/src/services/dictionary.service.ts:194-203` 的 lazy seed 已覆盖，首次 `GET /api/dictionaries/department` 时自动从 `DEFAULT_DICTIONARIES` 写入。**避免重复实现一套 seed 字典的逻辑**。

### 5.2 为什么 minimal seed 不复用 seed.ts
seed.ts:9-18 会**清空全表**（user/job/candidate 等），与本切片 e2e 库的"保留 4 角色账号 + 默认模板"目标冲突。**必须独立写**。

### 5.3 为什么 chromium project 不挂 storageState
现有 13 个 `e2e/tests/*.spec.ts` 仍走 `helpers.ts` 的硬编码 JWT，不依赖 storageState。新加的 4 project 是 P1+ 的。本切片 smoke 用 admin project 跑（覆盖 1/4），其余 3 project 由后续 P1 用例覆盖。

### 5.4 为什么 GHA services 用 5432（与 backend-test 同）
GitHub Actions service container 端口映射对每个 job 独立，**5432 在 e2e-test job 内独占**。这不是问题。文档约定：每个 job 的 services 端口都从 5432 起。

### 5.5 为什么 .auth/ 加 .gitignore
storageState JSON 包含 `ats_token` JWT、cookie、localStorage，**泄露可登录 e2e 库**。不入库。

### 5.6 为什么不动 helpers.ts
现有 13 个 spec 还在用它，**P0 改了会立即大面积红**。本切片只搭地基，P0-B 切片专门替换 helpers.ts（独立可控）。

### 5.7 为什么不动 package.json 的 prisma.seed 字段
`server/prisma/seed.ts` 仍是开发库 seed 的入口（`prisma db seed` 默认）。`db:seed:minimal` 是 e2e 专用，不能顶替默认。

### 5.8 不做的
- 不改 `e2e/tests/helpers.ts`（P0-B 才动）
- 不改 `e2e/tests/*.spec.ts`（任何）
- 不写业务 spec（`.auth/*.json` 一旦生成，理论上可写 P1，但**留到 P1 切片**避免 P0 改动面扩大）
- 不写 data-testid（客户补，那是 P2 入口改造，由独立切片做）
- 不升 Playwright 版本（避免动 lockfile；P0-B 再升）
- 不删 `e2e/package.json` 已有的 `@playwright/test ^1.40`

## 6. 修改文件清单

### 6.1 必改文件（10 个；✱=新增）
1. ✱ `docker-compose.e2e.yml`
2. `e2e/playwright.config.ts`（追加 globalSetup + 4 project + env，不替换）
3. ✱ `e2e/global-setup.ts`
4. ✱ `e2e/fixtures/auth.ts`
5. ✱ `e2e/fixtures/data.ts`
6. ✱ `e2e/fixtures/menu-matrix.ts`
7. ✱ `e2e/utils/testids.ts`
8. ✱ `e2e/tests/_smoke.spec.ts`
9. ✱ `server/prisma/seed-e2e-minimal.ts`
10. `server/package.json`（仅追加 `db:seed:minimal` script）
11. `.gitignore`（追加 `e2e/.auth/`）
12. `.github/workflows/ci.yml`（追加 `e2e-test` job，不动 backend-test）

### 6.2 禁止修改文件
- `e2e/tests/helpers.ts`（**P0-B 才动**）
- `e2e/tests/*.spec.ts`（13 个文件全部）
- `e2e/package.json`（**版本不变**，依赖不变）
- `server/src/**`（任何）
- `server/prisma/seed.ts`、`seed-test-users.ts`、`seed-rbac.ts`（**仅 seed-e2e-minimal.ts 新增**）
- `server/prisma/schema.prisma` / `server/prisma/migrations/**`（不写 migration）
- `client/src/**`（任何）
- `mobile/**`（任何）
- 任何 tsconfig / eslint / vite.config / docker-compose.yml / docker-compose.prod.yml / docker-compose.local.yml（已有 3 个 compose 不动）

### 6.3 越界检测（交付前自检）
- `git status --short` 只允许出现 §6.1 列出的 12 个文件 + §7.2 第 5 项列出的命令输出文件（log/exitcode）。
- `git diff --stat -- client mobile server/src server/prisma/schema.prisma server/prisma/migrations server/prisma/seed.ts server/prisma/seed-test-users.ts server/prisma/seed-rbac.ts e2e/tests/helpers.ts e2e/tests/*.spec.ts e2e/package.json` 必须 **0 行**。
- 对 `server/package.json` 做 **diff 守恒**：只允许新增 1 行 script，dependencies / devDependencies / prisma.seed 字段**必须保持完全一致**。
- 对 `e2e/playwright.config.ts` 做 **diff 守恒**：原 `testDir: './tests'` / `fullyParallel: false` / `workers: 1` / `retries: process.env.CI ? 2 : 1` / `baseURL: 'http://localhost:5174'` / `trace: 'on-first-retry'` / `actionTimeout: 15000` / `navigationTimeout: 30000` / 第 2 个 webServer（client）**一行不动**。第 1 个 webServer（server）的 `url` / `reuseExistingServer` / `timeout` 一行不动，仅追加 `env` 字段。

## 7. 验收标准

### 7.1 硬性验收（审核方执行，你不跑）

#### 基线守恒
| 命令 | 基线 | 不得新增 |
|---|---|---|
| `server pnpm tsc --noEmit` | 0 错 | 0 新增 |
| `server pnpm lint:check` | 17354 errors / 267 warnings | 0 新增 |
| `server pnpm test` | 63 文件 / 611 用例全过 | 全过 |
| `client pnpm type-check` | 88 错 | 0 新增 |
| `client pnpm lint:check` | 137 errors / 224 warnings | 0 新增 |
| `git diff --stat -- client mobile server/src server/prisma/schema.prisma server/prisma/migrations server/prisma/seed.ts server/prisma/seed-test-users.ts server/prisma/seed-rbac.ts e2e/tests/helpers.ts e2e/tests/*.spec.ts e2e/package.json` | — | **必须 0 行** |

#### P0 自验（审核方执行）
1. **本地起 docker**：`docker compose -f docker-compose.e2e.yml up -d` → 等 healthcheck 通过（约 10–30s）。
2. **跑 migrate**：`cd server && DATABASE_URL='postgresql://postgres:e2e_only_pw@localhost:5433/e2e_test?schema=public' npx prisma migrate deploy` → 全 migration 应用成功。
3. **跑 minimal seed**：`cd server && pnpm db:seed:minimal` → 输出 4 角色创建 + 默认模板创建。
4. **起 server**：`cd server && NODE_ENV=test DATABASE_URL=... REDIS_URL=redis://localhost:6381 JWT_SECRET='e2e-only-secret-must-be-at-least-32-chars' SMTP_HOST='' ANONYMIZE_CRON='' EVALUATION_REMINDER_CRON='' REMINDER_CRON_ENABLED=false pnpm start` → 等 `Server listening on 3001`。
5. **起 client**：`cd client && pnpm dev --port 5174`。
6. **跑 smoke**：`cd e2e && pnpm test --project=admin --project=hr --project=hiring_manager --project=interviewer` → 4 project 各 1 用例 = **4 个用例全过**。
7. **检查 `.auth/`**：`ls e2e/.auth/*.json` → 4 个文件，每个 ~2-5KB，含 cookies 数组。
8. **检查 global-setup 幂等性**：再跑一次 `pnpm test` → 应不报错（seedTestUsers / 默认模板都幂等），且 `.auth/*.json` 被覆盖。

#### data-testid 改动面
P0 不补 data-testid（P2 才做）。

### 7.2 交付报告模板（最终回复必须完整包含）

1. **完成范围概述**：12 文件落地，逐文件一句话（新增 / 兼容改造 / 加 1 行）。
2. **逐文件 before→after 摘要**（行号精确到 ±5）：
   - `docker-compose.e2e.yml`（新增 41 行）
   - `e2e/playwright.config.ts`（追加 globalSetup + 4 project + env 块，原内容不动）
   - `e2e/global-setup.ts`（新增约 90 行，TCP 健康探测 + migrate + seed + 4 角色登录）
   - `e2e/fixtures/auth.ts` / `data.ts` / `menu-matrix.ts`（骨架）
   - `e2e/utils/testids.ts`（骨架）
   - `e2e/tests/_smoke.spec.ts`（1 个用例 × 4 project = 4 用例）
   - `server/prisma/seed-e2e-minimal.ts`（新增，复用 seedTestUsers）
   - `server/package.json`（追加 1 行 script）
   - `.gitignore`（追加 1 行）
   - `.github/workflows/ci.yml`（追加 1 个 job）
3. **关键决策实现证据**：
   - §5.1 字典 lazy seed 决策：未在 minimal seed 写字典，仅在交付报告说明服务端 `dictionary.service.ts:194-203` 自动覆盖。
   - §5.6 不动 helpers.ts：现有 13 个 spec 一行不动，新登录机制走 `globalSetup.ts` 写 `.auth/*.json`。
   - §5.3 chromium project 不挂 storageState：仍走旧 helpers；新 4 project 给 P1+ 用。
4. **data-testid 字段**（P0 不补）：明确说明「P2 切片统一补」。
5. **越界自检**：
   - `git status --short` 全文
   - `git diff --stat -- client mobile server/src server/prisma/schema.prisma server/prisma/migrations server/prisma/seed.ts server/prisma/seed-test-users.ts server/prisma/seed-rbac.ts e2e/tests/helpers.ts e2e/tests/*.spec.ts e2e/package.json` 输出（**必须 0 行**）
   - `server/package.json` diff 守恒证据（依赖/字段未变）
   - `e2e/playwright.config.ts` diff 守恒证据（baseURL/webServer 命令未变）
6. **已知问题与遗留风险**：
   - Windows 上 `docker compose` 是否可用（基线 GHA ubuntu，与本机 Windows 隔离，本机跑需要 Docker Desktop 已在跑）
   - 7 个残留 testcontainers 容器是否清理（建议审核方跑前 `docker rm -f $(docker ps -aq)` 清理一次）
   - 60s 缓存陷阱（AGENTS §11）：L1 矩阵用例需要清缓存或等待
   - storageState 在 tokenVersion 升版后会失效：基线 4 角色 seed 时已 `tokenVersion: 0`（seed-test-users.ts:64），不会假阳性
7. **回退方式**：
   - 删 `e2e/.auth/*.json` 让 globalSetup 重新生成
   - 删 `e2e-test` job 让 CI 恢复仅 backend-test
   - `docker compose -f docker-compose.e2e.yml down -v` 完全清空 e2e 库
8. **红线自检确认**：
   - §1 强约束 1-11 逐条确认

按本提示词直接执行（headless 无人工确认）：先输出实施计划，然后动手，最终回复给出完整交付报告。