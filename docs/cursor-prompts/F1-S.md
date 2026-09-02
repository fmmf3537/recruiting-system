# F1-S JD 完善与辅助生成·服务端 执行提示词

## ⚠️ 强约束（最优先阅读）

1. 本切片为**纯服务端**切片：`client/**`、`e2e/**` 一行都不许动。
2. 文件预算 **6 个**（§6.1 逐一编号）。
3. 不跑验收命令（`pnpm test` / `build` / `lint` 都不跑，审核方重跑）；不执行任何 prisma 命令（本切片无 schema 变更）。
4. 编码红线：禁整文件重写既有文件；新文件 UTF-8 无 BOM、LF 行尾、2 空格缩进、单引号、行尾分号；中文注释。
5. headless 无人工确认：先输出实施计划，然后直接动手。

## 1. 任务 ID + 目标

### 1.1 任务 ID
F1-S

### 1.2 任务目标
实现 PRD 阶段 5 的 F1「JD 完善与辅助生成」服务端：两个 AI 接口——对既有 JD 出诊断报告 + 优化稿（polish），以及按表单字段 + 同类型历史 JD 风格从零生成草稿（draft）。AI 产出**不落库**（草稿式产出，人工确认后由前端写入现有职位表单）。需求全文见根目录 `PRD_阶段5_AI招聘增强与HR考核_20260901.md` 第 4 章（必读）。

### 1.3 端点清单（新增 2 个）

| 方法 | 路径 | body | 返回 data | 权限 |
|---|---|---|---|---|
| POST | `/api/jobs/ai-polish` | `{ jdText, meta?: { title?, level?, departments?, type? } }` | `{ issues: [{ title, detail, severity }], improvedJd: string }` | `authenticate` + `requireMatrixPermission('ai:jd-assist')` + 限流 |
| POST | `/api/jobs/ai-draft` | `{ title, departments, level, type, freeText? }` | `{ draftJd: string }` | 同上 |

## 2. 上下文

### 2.1 项目位置
仓库根即项目根；后端在 `server/`。路径风格沿用相对路径 `../services/x`。

### 2.2 已核实事实（起草人已实读源码，可直接采信）

- **LLM 入口**：`server/src/lib/llm.ts` 的 `callLLM(prompt, systemPrompt?, purpose = 'unknown')`（第三参 purpose 是 F2-S 加的，直接用 `'jd-polish'` / `'jd-draft'`）。60s 超时。LLM 返回需剥 ```` ```json ```` 围栏再 parse（参照 `match-score.service.ts` 的解析写法）。
- **权限矩阵**：`server/src/services/role-permission.service.ts` 硬编码列表。新权限点 `ai:jd-assist` 加入 `HR_PERMISSIONS` 与 `HIRING_MANAGER_PERMISSIONS`（admin 为 `'*'`；**interviewer 不给**，PRD §4.4 明确）。中间件 `requireMatrixPermission(code)` 来自 `../middleware/role`。
- **限流范式**：`routes/candidates.ts` 顶部 `parseResumeLimiter`（express-rate-limit，windowMs + max + 中文 message）。本切片限流：15 分钟 20 次（`windowMs: 15*60*1000, max: 20`），两个接口共用或各挂一个均可（推荐各挂一个独立计数）。
- **路由注册位置**：`routes/jobs.ts` 中 `POST /` 在 69 行、`GET /:id` 在 93 行。两个新路由都是 POST 固定路径 `/ai-polish`、`/ai-draft`，与 `POST /`、`GET /:id` 均无冲突，注册在「路由定义」注释之后、`POST /` 之前即可。
- **Job 模型**：字段含 `title / departments(Json) / level / type / description / requirements / status`（`server/prisma/schema.prisma` 117-161 行，表 `job`）。
- **OperationLog**：`prisma.operationLog.create({ data: { userId, targetType, targetId, action, detail } })`；本切片 action 用 `'ai_jd_polish'` / `'ai_jd_draft'`，`targetType: 'Job'`，`targetId`：polish 无 jobId 时填 `'new'`，draft 填 `'new'`。
- **AppError**：`import { AppError } from '../middleware/errorHandler'`。
- **响应惯例**：`res.json({ success: true, data })`；controller 薄壳 try/catch next(error)（参照 `match-score.controller.ts`）。
- **测试范式**：单测 `vi.mock('../../src/lib/prisma', ...)` + `vi.mock('../../src/lib/llm', ...)`（参照 `tests/unit/match-score.service.test.ts`）；集成测试 supertest + `x-test-role` 头注入角色（参照 `tests/integration/match-score.test.ts` 顶部 mock 块，含 `x-test-role: 'none'` 哨兵模拟 401 的写法）。

### 2.3 可复用模块
`callLLM`（带 purpose）、`requireMatrixPermission`、express-rate-limit、`dictionaryService` 不需要。

## 3. 必读约束

### 3.1 代码范式
service 函数式导出 + AppError（参照 `match-score.service.ts` / `ai-matcher.service.ts`）。

### 3.2 命名规范
文件 kebab-case：`jd-assist.service.ts` / `jd-assist.controller.ts`。

### 3.3 权限矩阵（本切片相关）
| 角色 | ai:jd-assist |
|---|---|
| admin | ✅（`*`） |
| hr / member（归一化 hr） | ✅ |
| hiring_manager | ✅ |
| interviewer | ❌（403） |

### 3.4 审计约定
两个接口每次调用（成功或失败）写 OperationLog：detail 含 `{ purpose, jdLength / title, success, error? }`，**不记录 JD 全文**（日志瘦身）。

## 4. 实施任务

### 4.1 `server/src/services/role-permission.service.ts`（条件修改）
`HR_PERMISSIONS`、`HIRING_MANAGER_PERMISSIONS` 各追加 `'ai:jd-assist'`（加在 F2-S 的 `'ai:match-score'` 旁边）。

### 4.2 `server/src/services/jd-assist.service.ts`（新增，核心）
- `polishJd(input: { jdText: string; meta?: {...} }, userId: string)`：
  1. 校验 jdText 非空（空抛 AppError 400「JD 内容不能为空」）。
  2. prompt：当前 JD 全文 + 元信息（职级/部门/类型），要求 LLM 输出 JSON `{ issues: [{title, detail, severity: '高'|'中'|'低'}], improvedJd: '完整优化稿' }`；system prompt 定位「资深招聘 JD 顾问」。
  3. `callLLM(prompt, systemPrompt, 'jd-polish')`，剥围栏 parse；结构校验：issues 必须是数组且每项有 title/detail，improvedJd 必须非空字符串；LLM 输出不合格**重试 1 次**，仍不合格抛 AppError 500「AI 返回格式异常，请重试」。
  4. 写 OperationLog，返回结果。
- `draftJd(input: { title, departments, level, type, freeText? }, userId: string)`：
  1. 必填校验：title/departments/level/type 缺一抛 AppError 400（路由层 zod 先挡一道，service 再兜底）。
  2. 查同 `type` 最近 3 份 JD（`prisma.job.findMany({ where: { type, status: { not: 'closed' } }, orderBy: { createdAt: 'desc' }, take: 3, select: { title, description, requirements } })`）作风格参考；没有则跳过参考段（空自由描述也要能生成，PRD §4.5）。
  3. prompt：表单字段 + freeText + 参考 JD（每份 description+requirements 各截断 1500 字防 token 爆），要求输出 JSON `{ draftJd: '...' }`，草稿必须含「岗位职责 / 任职要求 / 加分项」三段结构。
  4. `callLLM(..., 'jd-draft')`，同样剥围栏 + 校验 + 重试 1 次 + OperationLog。

### 4.3 `server/src/controllers/jd-assist.controller.ts`（新增）
两个薄壳 handler，透传 `req.user!.userId` 给 service 写日志。

### 4.4 `server/src/routes/jobs.ts`（条件修改）
- 文件顶部 import jdAssistController、express-rate-limit、requireMatrixPermission（若尚未 import）。
- 定义两个 limiter（15 分钟 20 次，中文提示「AI 辅助生成调用过于频繁，请稍后再试」）。
- 注册 `POST /ai-polish`、`POST /ai-draft`（在 `POST /` 之前）：authenticate + 各自 limiter + requireMatrixPermission('ai:jd-assist') + validate(zod schema)。
- zod：ai-polish body `{ jdText: z.string().min(10).max(20000), meta: z.object({...}).partial().optional() }`；ai-draft body `{ title: z.string().min(2).max(100), departments: z.array(z.string().max(50)).min(1).max(10), level: z.string().max(50), type: z.string().max(20), freeText: z.string().max(2000).optional() }`。

### 4.5 `server/tests/unit/jd-assist.service.test.ts`（新增）
mock prisma + llm。覆盖至少：polish 正常返回（issues+improvedJd）、空 jdText 400、LLM 返回非法 JSON 重试后仍失败抛 500、draft 无参考 JD 也能生成、draft 缺必填 400、参考 JD 截断逻辑（长文被截到 1500 字）。

### 4.6 `server/tests/integration/jd-assist.test.ts`（新增）
supertest（mock 范式参照 match-score.test.ts，含 x-test-role 注入与 'none' 哨兵）。覆盖：两接口正常路径（mock callLLM）、无 token 401、interviewer 403、zod 拦截（jdText 过短 400）。

## 5. 关键决策点

### 5.1 不落库
AI 产出只返回不落任何表（PRD §4.4）；**不要**自作主张加「建议历史」表。

### 5.2 与 F2 打分零耦合
本切片不读 AiMatchScore、不调 match-score 任何东西。

### 5.3 执行器环境特注
headless；无 prisma generate（schema 未变）；写完即交付。

### 5.4 不做清单
- 不做前端弹窗（F1-C 负责）
- 不做流式输出
- 不做英文 JD
- 不动 `ai-matcher.service.ts` / `match-score.service.ts` / `job.service.ts`
- 不 git commit、不跑验收命令

## 6. 修改文件清单

### 6.1 必改文件（6 个；✱=新增，其余为条件修改）
1. `server/src/services/role-permission.service.ts`
2. ✱ `server/src/services/jd-assist.service.ts`
3. ✱ `server/src/controllers/jd-assist.controller.ts`
4. `server/src/routes/jobs.ts`
5. ✱ `server/tests/unit/jd-assist.service.test.ts`
6. ✱ `server/tests/integration/jd-assist.test.ts`

### 6.2 禁止修改文件
清单以外一切；特别地：`client/**`、`e2e/**`、`prisma/**`、任何 package.json、`llm.ts`。

### 6.3 越界检测（交付前自检）
- `git status --short` 只允许出现 6.1 的 6 个路径。
- `git diff --stat -- client e2e prisma` 必须 0 行。

## 7. 验收标准

### 7.1 硬性验收（审核方执行，你不跑；仅供了解通过线）
- `server pnpm build`（tsc）：0 错误。
- `server pnpm test`：基线 46 文件 / 445 用例全过 + 新增 2 个测试文件全过。
- `server pnpm lint:check`：不新增 error（存量基线 17870e/215w；新文件只准出现 import/extensions、import/order、no-restricted-syntax 等存量规则类报错，不得引入新规则类）。
- git status 仅 6 个预算文件；无 BOM。

### 7.2 交付报告模板（最终回复必须完整包含）
1. 完成范围概述
2. 6 个文件逐个说明（条件修改逐处 before→after）
3. 两个接口的 prompt 结构摘要
4. 越界自检（git status 全文）
5. 已知问题与遗留风险
6. 红线自检确认

按本提示词直接执行（headless 环境无人工确认环节）：先输出实施计划，然后动手，最终回复给出完整交付报告。
