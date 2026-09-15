# E2E-INTV-EDIT 面试修改/取消 E2E 补齐 执行提示词

## ⚠️ 强约束（最优先阅读）
1. **纯 E2E 切片**：只允许改 `e2e/**`；**禁改** `server/**`、`client/**`、`server/prisma/**`、根配置、CI/部署文件。若发现应用层 bug，**不要顺手修**，写进交付报告风险项。
2. **文件预算 ≤ 3 个**：优先 `e2e/tests/_interview-edit.spec.ts`（新增）+ `e2e/tests/interviews.spec.ts`（条件修改）；确有必要才可条件修改 `e2e/tests/helpers.ts`（只加导出 helper，不改旧 helper 行为）。
3. **禁新增 npm 依赖**；禁改 `playwright.config.ts` 的项目划分；禁改 `.auth/**`、fixtures 账号。
4. 编码红线：UTF-8 无 BOM、LF、2 空格、单引号、行尾分号、中文注释；选择器优先 `getByRole` / 文案，禁止 `page.waitForTimeout` 以外的稳定等待，禁止 sleep 式硬等（除既有风格中的极短局部等待）。
5. **不跑验收命令**（playwright/test/lint 由审核方重跑）；**不要 git commit / push**。
6. headless 无人工确认：先输出实施计划，然后直接动手；最终按 §7.2 交付报告。

## 1. 任务 ID + 目标
### 1.1 任务 ID
E2E-INTV-EDIT

### 1.2 目标
为刚落地的面试 **修改 / 取消** 功能补 E2E 回归：覆盖 HR/admin 可编辑可取消、 interviewer/hiring_manager 403、改时间/改面试官触发冲突 409、UI 列表可从「编辑」进入并保存成功。

### 1.3 被测链路
| 链路 | 类型 | 必测点 |
|---|---|---|
| `PATCH /api/interviews/:id` | API | admin/hr 200；interviewer/hiring_manager 403；scheduledAt/interviewers 持久化 |
| `POST /api/interviews/:id/cancel` | API | hr 200；interviewer 403；status=cancelled |
| 冲突检测 | API | 同面试官时间重叠 PATCH → 409；错开后 PATCH → 200 |
| `/interviews` 列表 | UI | scheduled 行有「编辑」；弹窗改时间/地点保存；随后「取消」变已取消 |

## 2. 上下文
### 2.1 项目位置
E2E 在 `e2e/`，Playwright 配置：`e2e/playwright.config.ts`。
- `chromium` project：`testIgnore: ['**/_*.spec.ts']`，跑普通 UI spec。
- `admin/hr/hiring_manager/interviewer` project：`testMatch: ['**/_*.spec.ts']`，storageState 来自 `.auth/<role>.json`。
- `webServer`：server `:3001`，client `:5174`；client Vite 代理 `/api -> http://localhost:3001`，所以测试里可用 `baseURL + /api/...`。

### 2.2 已核实事实（可直接采信）
- `e2e/global-setup.ts` 会生成 `.auth/admin.json / hr.json / hiring_manager.json / interviewer.json`，内含 `ats_token` 与 `ats_user`。
- `e2e/tests/_interview-schedule.spec.ts` 已有模式：从 `.auth/admin.json` 读 token，用 `fetch(${baseURL}/api/...)` 打 API；候选人用唯一 suffix 创建，`finally` 里 DELETE 清理。
- `e2e/tests/helpers.ts` 的 `login(page, role)` 已支持角色注入；默认 admin。
- 应用层已上线能力（上一切片 INTV-EDIT，审核已通过）：
  - `PATCH /api/interviews/:id`、`POST /api/interviews/:id/cancel` 走 `requireMatrixPermission('interview:update')`；admin 通配，hr/member 可，hiring_manager/interviewer 403。
  - 仅 `scheduled` 可编辑；`completed` 不可取消；无物理删除。
  - 改 `scheduledAt/duration/interviewers` 会冲突检测并排除自身；同面试官重叠返回 409。
  - 改面试官会同步 `InterviewEvaluation`；已提交评估的面试官不可移除（本切片可不做这条 E2E，已由 server 测试覆盖）。

### 2.3 角色/账号契约
- 账号来自 `e2e/fixtures/auth.ts`：admin/hr/hiring_manager/interviewer；**不得改账号密码**。
- 需要用户 id 时，从 `.auth/<role>.json` 的 `ats_user` JSON 中解析 `id`，不要硬编码 cuid。

## 3. 必读约束
### 3.1 反直觉点
1. `_*.spec.ts` 会被 4 个 role project 都匹配到；若用例只想跑 admin，必须在 test 内用 `testInfo.project.name !== 'admin'` 跳过，或显式读取 `.auth/admin.json` 但不依赖 project storageState。
2. API 层 `fetch` 默认不会带 Playwright storageState；必须显式 `Authorization: Bearer <token>`。
3. UI 测试不要用后端端口 `3001` 作为页面地址；页面走 `baseURL`（5174），API 也走 `baseURL + /api`（Vite proxy）。
4. 面试官冲突时间用「明天/后天」动态生成，禁止写死日期。
5. UI 的 `el-date-picker` 可直接对 `input[placeholder="选择日期时间"]` `fill('YYYY-MM-DD HH:mm:ss')`，不要点开日历面板逐格点。

### 3.2 权限矩阵（E2E 断言口径）
- admin：API/UI 均可编辑、取消 scheduled 面试。
- hr：API 200；UI 可见「编辑/取消」。
- hiring_manager：API 403；UI 不显示编辑/取消（本切片可只测 API 403，UI 权限已由前端条件渲染覆盖）。
- interviewer：API 403；UI 不显示编辑/取消（同上）。

### 3.3 数据清理约定
- 每个 API 用例创建候选人/面试后必须 `finally` 清理：先取消仍 scheduled 的面试（容错 400/404），再 DELETE 候选人。
- 候选人姓名/邮箱/手机号必须含 `Date.now()` suffix，避免并行/重试污染。

## 4. 实施任务（逐文件）
1. `e2e/tests/_interview-edit.spec.ts`（✱新增，API 层）
   - 文件头部注释写明：保护 `PATCH /api/interviews/:id` + `cancel` 的权限与冲突链路。
   - 内置 helper：`loadToken(role)`、`loadUserId(role)`、`apiHeaders(role)`、`createCandidate(headers)`、`createScheduledInterview(headers, { candidateId, interviewerIds, scheduledAt, duration? })`、`cleanupCandidate(headers, candidateId)`。
   - 用例 A（admin/hr 正路径）：admin 创建候选人+面试；hr token `PATCH` 改 `scheduledAt`（+1 天）与 `location` → 200；GET 详情断言时间与地点已持久化；hr `cancel` → 200 且 `status=cancelled`。
   - 用例 B（403）：admin 创建 scheduled 面试；interviewer token `PATCH` → 403；hiring_manager token `cancel` → 403。
   - 用例 C（冲突）：用 admin 作为面试官 I1 创建面试 A（明天 10:00，60 分钟）；再创建面试 B（明天 12:00，60 分钟，同 I1）成功；把 B `PATCH` 到明天 10:30 → 409；再 `PATCH` 到明天 13:00 → 200。
   - 所有用例 `finally` 清理候选人。

2. `e2e/tests/interviews.spec.ts`（条件修改，UI 层）
   - 保持现有 4 个用例不动。
   - 新增用例「scheduled 面试可在列表编辑并取消」：
     1. `login(page)`（admin）→ 创建唯一候选人 + scheduled 面试（可复用本文件局部 helper 或从 `_interview-edit.spec.ts` 抽出的模式复制最小实现；不要跨 spec import 私有 helper）。
     2. `page.goto('/interviews')`，按唯一候选人姓名定位行：`page.locator('.el-table__body tr', { hasText: candidateName })`。
     3. 行内点击 `getByRole('button', { name: '编辑' })`；弹窗内填 `input[placeholder="选择日期时间"]` 为后天 `09:30:00`，地点输入框填 `E2E-会议室-${suffix}`；点「保存」。
     4. 断言出现成功消息（`面试安排已更新`）且该行包含新地点。
     5. 同行点「取消」，在 `.el-message-box__input input` 填原因，点确认；断言该行状态包含「已取消」。
     6. `finally` 用 API 清理候选人。
   - 若行定位受分页影响：创建后先 `page.goto('/interviews')`，再用表格第一页查找；若未找到，允许用 API `GET /api/interviews?candidateId=...` 做兜底断言并在报告中说明。

3. `e2e/tests/helpers.ts`（可选，仅当需要）
   - 只允许新增导出：`loadAuthToken(role)` / `loadAuthUserId(role)`，实现复用现有 `loadStorageState`；不得改 `login()` 签名与行为。

## 5. 关键决策点（默认方案 + 理由）
- **API 用例放 `_interview-edit.spec.ts`**：权限/冲突是接口契约，API 层稳定、快；UI 只保留一条最关键的编辑+取消闭环，降低 flaky。
- **冲突用例不创建真实第二个面试官**：同一位面试官两场面试即可稳定触发 409；错开后必须 200，证明“排除自身/时间窗”没写反。
- **UI 不改既有 beforeEach**：新增用例内部自己创建数据并清理，避免影响现有 4 个冒烟用例。
- **不覆盖“已提交评估面试官不可移除”的 E2E**：该链路需要制造 submitted evaluation，成本高且已有 server 单测/集成覆盖；E2E 只保权限与冲突主链路。

## 6. 修改文件清单
### 6.1 必改文件（✱=新增）
1. `e2e/tests/_interview-edit.spec.ts` ✱
2. `e2e/tests/interviews.spec.ts`
3. `e2e/tests/helpers.ts`（可选；不改则报告写“未改”）

### 6.2 禁止修改文件
- `server/**`、`client/**`
- `e2e/playwright.config.ts`、`e2e/global-setup.ts`、`e2e/fixtures/auth.ts`
- `.auth/**`、任何 seed/migration

### 6.3 越界检测（自检命令，交付报告贴结果）
```bash
git status --short -- e2e
git diff --stat -- server client e2e/playwright.config.ts e2e/global-setup.ts e2e/fixtures/auth.ts
```
要求：`server`、`client`、`playwright.config.ts`、`global-setup.ts`、`fixtures/auth.ts` 必须 0 行。

## 7. 验收标准
### 7.1 硬性验收（审核方执行，你不跑）
- `cd e2e && pnpm exec playwright test --list`：能列出新用例，无语法错误。
- `cd e2e && pnpm exec playwright test tests/_interview-edit.spec.ts --project=admin`：通过。
- `cd e2e && pnpm exec playwright test tests/_interview-edit.spec.ts --project=hr`：通过（用例内部按 token 控角色，project 差异不导致失败）。
- `cd e2e && pnpm exec playwright test tests/interviews.spec.ts --project=chromium`：既有 4 条 + 新增 1 条全过。
- `git diff --stat -- server client e2e/playwright.config.ts e2e/global-setup.ts e2e/fixtures/auth.ts`：0 行。
- 不新增 lint/type 负担；E2E 文件遵循既有风格。

### 7.2 交付报告模板（最终回复必须包含）
1. 实施计划摘要（≤8 行）
2. 实际修改文件列表（对应 §6.1）
3. 每个文件 before→after / 新增用例清单
4. 权限/冲突/清理逻辑如何落地
5. 未实现项与原因（若有）
6. 风险点（flaky 点、时区/日期、分页依赖）
7. 越界自检命令输出
8. 给审核方的逐条运行命令（按 §7.1）

按本提示词直接执行（headless 无人工确认）：先输出实施计划，然后动手，最终回复给出完整交付报告。
