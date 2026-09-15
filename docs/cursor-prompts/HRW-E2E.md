# HRW-E2E HR 工作负载监控验收 执行提示词

## ⚠️ 强约束（最优先阅读）
1. **纯 E2E 切片**：只允许改 `e2e/**`；**禁改** `server/**`、`client/**`、`server/prisma/**`、根配置、CI/部署文件。
2. **文件预算 ≤ 3 个**：优先新增 `e2e/tests/_hr-workload.spec.ts`；必要时最小修改 `e2e/tests/helpers.ts`（只加导出 helper，不改旧行为）。
3. **禁新增依赖**；禁改 `playwright.config.ts` / `global-setup.ts` / `fixtures/auth.ts` / `.auth/**`。
4. **不跑验收命令**（playwright 由审核方重跑）；**不要 git commit / push**。
5. 必须先读 `docs/PRD_HR工作监控_20260928.md`，并假设 HRW-S/HRW-C 已合入；若未合入导致选择器/接口不存在，只写测试并在风险项说明。
6. headless 无人工确认：先输出实施计划，然后直接动手，最终按 §7.2 交付报告。

## 1. 任务 ID + 目标
### 1.1 任务 ID
HRW-E2E

### 1.2 目标
为 admin 的 HR 工作监控补 E2E 回归：接口权限、日/周/月契约、导出、页面菜单可见性、核心页面加载与下钻入口。

## 2. 上下文
### 2.1 已确认口径
- 仅 admin 可见；过程+结果；按操作人归属；漏斗转化率识别薄弱环节。
- 前端路由：`/stats/hr-workload`；接口：`/api/hr-workload/*`。

### 2.2 已核实 E2E 事实
- `e2e/playwright.config.ts`：chromium 跑普通 spec；`admin/hr/hiring_manager/interviewer` 跑 `_*.spec.ts`。
- `e2e/tests/_interview-schedule.spec.ts` / `_candidate-update.spec.ts` 已示范：从 `.auth/<role>.json` 读 token，显式 `Authorization: Bearer` 打 API。
- `e2e/tests/helpers.ts` 的 `login(page, role)` 可注入角色登录。
- API base：用 `baseURL + '/api/...'`（5174 Vite proxy 到 3001）。

## 3. 必读约束
### 3.1 反直觉点
1. `_*.spec.ts` 会被 4 个 role project 匹配；role-specific API 用例要么用 `testInfo.project.name` 控制，要么显式读对应 `.auth/<role>.json`，不得依赖 project storageState 隐式生效。
2. 导出接口 E2E 不解析 Excel 内容，只断言 HTTP 200、`content-type` / `content-disposition` 存在、body 非空。
3. UI 用例只保证页面可加载、筛选可切换、排行榜/下钻入口存在；不断言精确统计值（统计正确性由 server 测试保证）。
4. hr/interviewer 访问页面时，路由可能重定向 `/dashboard`；断言 URL 或“无菜单入口”均可，但要在报告中说明实际行为。

## 4. 实施任务（逐文件）
1. `e2e/tests/_hr-workload.spec.ts`（✱新增，API + 权限）
   - helper：`loadToken(role)`、`authHeaders(role)`。
   - 用例 A：admin `GET /api/hr-workload/overview?period=day&date=<今天>` → 200，断言 `success=true`、`data.range`、`data.summary`、`data.rows` 结构存在。
   - 用例 B：hr / hiring_manager / interviewer 调 overview → 403。
   - 用例 C：admin 调 `GET /api/hr-workload/export?period=week&date=<今天>` → 200，断言 `content-disposition` 含 attachment，响应体长度 > 0。
   - 用例 D：参数校验：缺 `period` 或 `period=year` → 400。
2. `e2e/tests/stats.spec.ts` 或新增 `e2e/tests/hr-workload.spec.ts`（二选一，推荐新增普通 spec）
   - UI 用例：admin 登录 → 侧边栏可见「HR 工作监控」→ 进入 `/stats/hr-workload` → 断言标题/筛选区/总览卡片/排行榜表格存在 → 切换 日/周/月 → 若有行则点第一个「查看详情/详情」按钮并断言抽屉或详情区出现。
   - 空数据处理：若 rows 为空，不断言详情按钮，只断言空态或表格存在。
3. `e2e/tests/helpers.ts`（可选）
   - 仅在需要时新增 `loadAuthToken(role)` / `loadAuthUserId(role)`；不得改 `login()` 签名。

## 5. 关键决策点（默认方案 + 理由）
- **API 断言结构不断言数值**：统计口径由 server 单测/集成测试保证，E2E 避免脆弱。
- **UI 只跑 chromium 普通 spec**：权限可见性由路由/菜单测试 + API 403 双保险，不做四角色 UI 全量，控制执行时间。
- **导出只验证响应头与非空**：解析 xlsx/csv 会把 E2E 变脆；内容由 server export 测试负责。

## 6. 修改文件清单
### 6.1 必改文件（✱=新增）
1. `e2e/tests/_hr-workload.spec.ts` ✱
2. `e2e/tests/hr-workload.spec.ts` ✱（或条件修改 `e2e/tests/stats.spec.ts`，报告需说明选择）
3. `e2e/tests/helpers.ts`（可选）

### 6.2 禁止修改文件
- `server/**`、`client/**`
- `e2e/playwright.config.ts`、`e2e/global-setup.ts`、`e2e/fixtures/auth.ts`
- `.auth/**`、seed/migration

### 6.3 越界检测（交付报告贴结果）
```bash
git status --short -- e2e server client
git diff --stat -- server client e2e/playwright.config.ts e2e/global-setup.ts e2e/fixtures/auth.ts
```
要求：`server`、`client`、配置文件为 0 行。

## 7. 验收标准
### 7.1 硬性验收（审核方执行，你不跑）
- `cd e2e && pnpm exec playwright test --list`：能列出新用例，无语法错误。
- `cd e2e && pnpm exec playwright test tests/_hr-workload.spec.ts --project=admin`：通过。
- `cd e2e && pnpm exec playwright test tests/_hr-workload.spec.ts --project=hr`：通过（用例内部角色控制不冲突）。
- `cd e2e && pnpm exec playwright test tests/hr-workload.spec.ts --project=chromium`：通过（或若改 stats.spec.ts，则跑对应文件）。
- 越界检测为 0 行。

### 7.2 交付报告模板（最终回复必须包含）
1. 实施计划摘要（≤8 行）
2. 实际修改文件列表（对应 §6.1）
3. 新增用例清单与覆盖点
4. 权限/导出/空态处理说明
5. 未实现项与原因（若有）
6. 风险点（flaky 点、空数据、路由重定向）
7. 越界自检命令输出
8. 给审核方的逐条运行命令

按本提示词直接执行（headless 无人工确认）：先输出实施计划，然后动手，最终回复给出完整交付报告。
