# recruiting-system E2E 自动化 · 实施方案 v1

> 基于 2026-09-10 代码调查 + 你确认的 3 个决策（① 可补 data-testid ② 独立 PG ③ 广度深度都要）。
> 本文含 P0 地基的完整文件清单与代码骨架，以及 P1（广度）/ P2（深度）的用例设计。
> **尚未执行任何改动。**

---

## 零、三个决策的落地方式（均已验证技术可行）

| 决策 | 落地方式 | 为什么这样选 |
|---|---|---|
| **独立 PG** | 新增 `docker-compose.e2e.yml`：PG 5433 + Redis 6381，独立 volume 与容器名（`-e2e` 后缀），不启 server/nginx | 与开发库物理隔离；本地和 CI 用同一套定义 |
| **补 data-testid** | **分两批**：P0 只补「L2 主流程」涉及的控件；L1 矩阵用菜单文本定位（Element Plus 菜单文本稳定） | 一次全加改动面太大；先让主流程稳，再逐步扩 |
| **广度+深度都要** | 顺序 P0 → P1(广度) → P2(深度) | P1 便宜且能立刻验证 P0 地基是否可靠，再投入 P2 |

### 一个意外收获：环境隔离不用改 server 代码

调查确认两件事：
1. `mail.service.ts:15-16` —— `SMTP_HOST/USER/PASS` 任一为空就跳过发信 → **测试环境不配 SMTP 即天然禁用邮件**
2. `env.ts:5` 用的是 `dotenv.config()`，而 **dotenv 不覆盖已存在的环境变量**

结论：E2E 环境变量**全部通过 `playwright.config.ts` 的 `webServer.env` 注入**即可，
**不新建 `.env.e2e`、不改 server 一行代码**。

同理，LLM 相关的坑也自动规避：**测试环境不启动 worker**（`resume-parser.worker` / `ai-match-score.worker`），
队列任务只堆积不消费，**就不会调用 LLM**（无 key 时会 `throw 'API key not configured'`）。

---

## 一、P0 地基：文件清单

### 新建（6 个）

| 文件 | 作用 |
|---|---|
| `docker-compose.e2e.yml` | 独立 PG(5433) + Redis(6381) |
| `e2e/global-setup.ts` | 起容器 → 等健康 → `prisma migrate deploy` → seed |
| `e2e/fixtures/auth.ts` | 角色登录 fixture（storageState 缓存） |
| `e2e/fixtures/data.ts` | 数据工厂（用 `request` 走 API 造/清数据） |
| `e2e/fixtures/menu-matrix.ts` | 19 菜单 × 4 角色可见性声明（L1 用） |
| `e2e/utils/testids.ts` | data-testid 常量集中管理 |

### 修改（3 个）

| 文件 | 改动 |
|---|---|
| `e2e/playwright.config.ts` | globalSetup、webServer.env、projects per role、reporter |
| `e2e/tests/helpers.ts` | **删除硬编码 JWT**（已过期），改为调用 auth fixture |
| `.github/workflows/ci.yml` | 新增 `e2e-test` job |
| `server/package.json` | 新增 `dev:e2e` 脚本（仅去掉 watch，避免文件监听干扰） |

### 前端（`client/src`，仅补属性）

L2 主流程涉及组件补 `data-testid`，**纯属性添加、零功能影响**。首批清单见 §4。

---

## 二、P0 关键代码骨架

### 2.1 `docker-compose.e2e.yml`

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

### 2.2 `playwright.config.ts`（核心片段）

```ts
export default defineConfig({
  globalSetup: './global-setup.ts',
  fullyParallel: false,   // Phase 5 数据隔离完成后再放开
  workers: 1,
  retries: 1,
  use: {
    baseURL: 'http://localhost:5174',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
    actionTimeout: 15000,
  },
  projects: [
    { name: 'admin',          use: { storageState: '.auth/admin.json' } },
    { name: 'hr',             use: { storageState: '.auth/hr.json' } },
    { name: 'hiring_manager', use: { storageState: '.auth/hiring_manager.json' } },
    { name: 'interviewer',    use: { storageState: '.auth/interviewer.json' } },
  ],
  webServer: [
    {
      command: 'cd ../server && pnpm dev:e2e',
      url: 'http://localhost:3001/api/health',
      reuseExistingServer: !process.env.CI,
      env: {
        NODE_ENV: 'test',
        DATABASE_URL: 'postgresql://postgres:e2e_only_pw@localhost:5433/e2e_test?schema=public',
        REDIS_URL: 'redis://localhost:6381',
        JWT_SECRET: 'e2e-only-secret-must-be-at-least-32-chars',
        CORS_ORIGIN: 'http://localhost:5174',
        // 邮件：留空 → mail.service 自动跳过发信
        SMTP_HOST: '', SMTP_USER: '', SMTP_PASS: '',
        // 关闭所有定时任务
        ANONYMIZE_CRON: '', EVALUATION_REMINDER_CRON: '', REMINDER_CRON_ENABLED: 'false',
      },
    },
    { command: 'cd ../client && pnpm dev --port 5174', url: 'http://localhost:5174', reuseExistingServer: !process.env.CI },
  ],
});
```

### 2.3 `e2e/fixtures/auth.ts`（替掉过期 JWT）

```ts
import { test as base, expect } from '@playwright/test';
export const ROLES = ['admin', 'hr', 'hiring_manager', 'interviewer'] as const;
export type Role = typeof ROLES[number];

export const CREDENTIALS: Record<Role, { email: string; password: string }> = {
  admin:          { email: 'admin@test.local',       password: 'admin123' },
  hr:             { email: 'hr@test.local',          password: 'hr123456' },
  hiring_manager: { email: 'hiring@test.local',      password: 'hiring123' },
  interviewer:    { email: 'interviewer@test.local', password: 'interview123' },
};

export async function loginViaUI(page: Page, role: Role) {
  const { email, password } = CREDENTIALS[role];
  await page.goto('/login');
  await page.getByTestId('login-email').fill(email);
  await page.getByTestId('login-password').fill(password);
  await page.getByTestId('login-submit').click();
  await expect(page).not.toHaveURL(/\/login/);      // web-first 断言，拒绝 sleep
}
```

> storageState 由 global-setup 一次性生成到 `.auth/*.json`（Playwright 官方 storageState 模式），
> 每角色只登录一次，彻底解决登录限流与 JWT 过期问题。
> 顺带：**登录页本身终于被测到了**（之前是绕过登录的）。

### 2.4 `e2e/fixtures/data.ts`（用 API 造数据）

```ts
export async function makeJob(request: APIRequestContext, over: Partial<JobInput> = {}) {
  const suffix = randomUUID().slice(0, 8);
  const res = await request.post('/api/jobs', {
    data: { title: `E2E职位-${suffix}`, departments: ['研发部'], level: '中级',
            location: '上海', type: '全职', description: '…', requirements: '…', ...over },
  });
  expect(res.ok()).toBeTruthy();
  return { id: (await res.json()).data.id, title: `E2E职位-${suffix}`, suffix };
}
```

- 用 `request` fixture + 管理员 token 造数据，比 UI 填表**快一个数量级**
- 每条数据带 `suffix`，测试结束 tearDown 按 suffix 清理，**杜绝用例间依赖与数据污染**

### 2.5 `global-setup.ts`

```
1. docker compose -f docker-compose.e2e.yml up -d
2. 轮询 pg_isready / redis ping 直到健康（轮询，不 sleep）
3. DATABASE_URL=... npx prisma migrate deploy
4. tsx prisma/seed-test-users.ts        // 4 角色账号（已存在则跳过）
5. tsx prisma/seed.ts 或最小夹具        // 部门 + 招聘类型字典（职位必填依赖）
6. 启动一次浏览器，逐角色登录写 .auth/<role>.json
```

---

## 三、P1（广度）：L1 冒烟矩阵 —— 完整可见性矩阵

**直接对齐 `DefaultLayout.vue:236-298` 的 `menuItems` 角色条件**，`member` 已归一为 `hr`：

| # | path | 菜单 | admin | hr | hiring_manager | interviewer |
|---|---|---|:--:|:--:|:--:|:--:|
| 1 | `/dashboard` | 仪表盘 | ✅ | ✅ | ✅ | ✅ |
| 2 | `/hiring` | 招聘工作台 | ✅ | ❌ | ✅ | ❌ |
| 3 | `/jobs` | 职位管理 | ✅ | ✅ | ❌ | ❌ |
| 4 | `/settings/agencies` | 猎头机构 | ✅ | ✅ | ❌ | ❌ |
| 5 | `/candidates` | 候选人管理 | ✅ | ✅ | ✅ | ❌ |
| 6 | `/interview` | 面试官工作台 | ✅ | ❌ | ✅ | ✅ |
| 7 | `/interviews` | 面试管理 | ✅ | ✅ | ✅ | ❌ |
| 8 | `/offers` | Offer管理 | ✅ | ✅ | ✅ | ❌ |
| 9 | `/stats` | 数据统计 | ✅ | ✅ | ✅ | ❌ |
| 10 | `/hr-score/my` | 我的积分 | ✅ | ✅ | ❌ | ❌ |
| 11 | `/hr-score/team` | 团队考核 | ✅ | ❌ | ❌ | ❌ |
| 12 | `/notifications` | 消息通知 | ✅ | ✅ | ✅ | ✅ |
| 13 | `/hc-requests` | 编制管理 | ✅ | ✅ | ✅ | ❌ |
| 14 | `/users` | 成员管理 | ✅ | ❌ | ❌ | ❌ |
| 15 | `/settings/dictionary` | 字典管理 | ✅ | ❌ | ❌ | ❌ |
| 16 | `/settings/tags` | 标签管理 | ✅ | ❌ | ❌ | ❌ |
| 17 | `/settings/pipeline-templates` | 流程模板 | ✅ | ❌ | ❌ | ❌ |
| 18 | `/settings/ai` | AI 设置 | ✅ | ❌ | ❌ | ❌ |
| 19 | `/settings/automation-rules` | 自动化邮件 | ✅ | ❌ | ❌ | ❌ |
| | **可见合计** | | **19** | **10** | **9** | **3** |

- 一个 spec 双向断言：**该可见的必须可见（41 项）+ 该隐藏的必须不可见（35 项）= 76 个断言**
- 维护成本 = 上面这一张表；新增菜单只改表，不改用例
- 这张表同时也是**回归哨兵**：谁改了角色条件却忘了同步测试，立刻红

> ⚠️ 提醒：L1 现在大概率会**暴露真实问题** —— 因为前端没有角色路由守卫（见下节），
> "不可见"断言可能只测到菜单隐藏，测不到"直敲 URL 会怎样"。这正是 P2 要补的。

---

## 四、P2（深度）：L2 九环节接力链路

| # | 环节 | 驱动角色 | 页面 | 关键接口 | 需补 testid |
|---|---|---|---|---|---|
| 1 | 提交编制申请 | hiring_manager | `/hc-requests` | `POST /api/hc-requests` | `hc-create-submit` |
| 2 | 审批编制 | **admin** | `/hc-requests` | `hc-requests.ts:84/89` | `hc-approve` |
| 3 | 创建职位 | hr | `/jobs/create` | `POST /api/jobs` | `job-form-submit` |
| 4 | 录入候选人 | hr | `/candidates/create` | `POST /api/candidates` | `candidate-form-submit` |
| 5 | 推进阶段 | hr | `/candidates/:id` | `advance-stage` | `stage-advance` |
| 6 | 安排面试 | hr/admin | `/interviews` | `POST /api/interviews` | `interview-schedule-submit` |
| 7 | 提交面试评价 | **interviewer** | `/interviews/:id` | `POST /api/evaluations` | `evaluation-submit` |
| 8 | 发起 Offer | hr | `/offers/create` | `POST /api/offers` | `offer-create-submit` |
| 9 | 审批 Offer | **admin / hiring_manager** | `/offers` | `offers.ts:157` | `offer-approve` |
| 10 | 入职任务 | hr | `/onboarding-tasks` | `POST /api/onboarding-tasks` | `onboarding-create-submit` |

**测试写法**：一条 spec 内用多个 `page`（不同 storageState 的 context）接力，
每个环节用 `test.step()` 分段，失败报告能直接定位到环节。

**为什么这条链路价值最高**：它是唯一能证明"系统真的能跑通一笔招聘"的测试，
任何单页面冒烟都替代不了 —— 而它天然覆盖了 4 个角色的协作边界。

---

## 五、P3（越权负向）：补最大盲区

调查确认：**`client/src/router/index.ts` 只有 `authenticate`，没有角色级路由守卫**，
低权限角色靠后端 403 兜底。于是这类场景从未被测：

```
interviewer 直敲 /users            → 期望：被拦截或优雅降级，不能白屏
interviewer 直敲 /settings/ai      → 同上
hiring_manager 进 /candidates/create → 期望：无权限提示（他无 candidate:create）
非 admin 直接 POST /api/users      → 期望 403
```

数据驱动遍历 `受限资源 × 越权角色`，断言"要么 403，要么显示无权限/空态，绝不白屏或 500 页"。

---

## 六、执行顺序与验收

| 阶段 | 交付物 | 验收标准 |
|---|---|---|
| **P0** | 容器 + globalSetup + 4 角色 storageState + 数据工厂 | `npx playwright test auth.spec.ts` 全绿；CI e2e job 能拉起 |
| **P1** | L1 矩阵 spec | 76 个断言全绿，且与 §3 矩阵逐格一致 |
| **P2** | L2 九环节链路 | 一条链路端到端跑通，4 角色接力无人工干预 |
| **P3** | L3 越权矩阵 | 越权场景全部优雅降级，无白屏/500 |
| **P4** | L4 边界异常 | 表单校验、空态、错误提示 |
| **P5** | CI 门禁 + flaky 检测 | 连跑 5 次全绿；失败自动保留 trace/video |

**每个阶段结束单独 Review 一次再进入下一阶段**（P0 形态决定后面好不好写）。

---

## 七、风险与待确认（诚实版）

| 项 | 说明 | 处理 |
|---|---|---|
| ~~本机 Docker 是否可用~~ | **已验证 ✅**：Docker Desktop 在跑，Compose v5.1.1；`5433/6381` 均空闲；`5432` 由本机 PG 占用（开发库 `recruitment_system`），`6380` 由 `ats-redis` 占用 —— 故 e2e 选 5433/6381 无冲突 | 无 |
| **7 个残留 testcontainers 容器** | `docker ps -a` 有 7 个随机名 PG 容器（`magical_*`/`ecstatic_*` 等），占端口 32787–32799，疑似 server 测试跑完未清理 | P0 执行前建议清理，避免干扰与端口碎片 |
| **Prisma migrate 耗时** | 每次 globalSetup 跑 migrate，冷启动可能 30–60s | 容器复用（`reuseExistingServer`），仅在 schema 变更时 reset |
| **LLM 只能规避不能完全 mock** | 不启 worker 可避免异步 LLM；但同步 AI 接口（如 `ai-polish`）仍会 500 | L2 链路不点 AI 按钮；AI 质量不在 E2E 职责内 |
| **60s 缓存陷阱** | `auth.ts:36` / `rbac.service.ts:5` 缓存 60s，角色变更不会立即生效 | 涉及角色变更的用例显式清缓存或等待；文档标注 |
| **data-testid 改动面** | 首批约 10 个控件，涉及多个 view 文件 | 纯属性添加，逐文件小 PR；先做 P0 主流程所需 |
| **耗时** | 全量跑预计 20–40 分钟 | P5 用 shard 并行；PR 门禁只跑 P1+P2，全量走 nightly |

---

*v1 / 2026-09-10 · 基于实际代码调查 · 未执行任何改动*
