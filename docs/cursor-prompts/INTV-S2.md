# INTV-S2 面试流程·服务端收尾（列表 include evaluations + round 筛选） 执行提示词

## ⚠️ 强约束（最优先阅读）

1. 本切片为**纯服务端**切片：`client/**`、`e2e/**` 一行不动；不改任何 package.json / tsconfig / eslint。
2. 文件预算 **2 个**（§6.1 逐一编号）：1 个 service 条件修改 + 1 个测试文件新增。
3. **不需要** schema 变更：不动 `server/prisma/**`，不新增 migration，不跑 prisma 命令。
4. 编码红线：禁整文件重写既有文件；新文件 UTF-8 无 BOM、LF 行尾、2 空格缩进、单引号、行尾分号；中文注释。
5. 不跑验收命令（`pnpm test` / `build` / `lint` 都不跑，审核方重跑）。
6. headless 无人工确认：先输出实施计划，然后直接动手。

## 1. 任务 ID + 目标

### 1.1 任务 ID
INTV-S2

### 1.2 任务目标
收掉 INTV-C 交付报告的 3 个已知缺口（服务端侧）：

1. **面试列表 include evaluations**：`getInterviews` 的 `InterviewListItem` 加 `evaluation` 字段（已提交评估的结论摘要）——前端面试管理「评估」列当前几乎总是「未评估」，因为后端没返回。
2. **round 筛选**：`getInterviews` 支持 `round` 查询参数过滤（面试轮次初试/复试/终面）。前端筛选 UI 已存在（`filterForm.round`），但后端忽略导致筛选不生效——**存量缺陷，本次补齐**。
3. **补前端 `InterviewListItem` 对应类型**：INTV-C 已在 client 侧做好 `evaluations?.[0]?.conclusion` 读取，需确认服务端返回字段名与该读取一致（见 §2.2 契约）。

> 说明：交付报告 §5.2 说「hiring 面试官列依赖后端 include」——**已核实不需要**：`getInterviews` 第 311 行已返回 `interviewers`（Json 标量随行带出），hiring 列表用它显示即可。**本切片只做 evaluations + round。**

## 2. 上下文

### 2.1 项目位置
后端在 `server/`（Express 4 + TS ESM + Prisma 5.22）。核心文件 `server/src/services/interview-scheduler.service.ts`（526 行）单文件即可。

### 2.2 关键已核实事实（起草人已实读源码，可直接采信）

- **`getInterviews` 现状**（252-324 行）：
  - 解构 `page/pageSize/candidateId/jobId/status/startDate/endDate`——**无 round**。
  - `where` 只处理 candidateId/jobId/status/startDate/endDate（275-289 行）——**无 round**。
  - `include: { candidate, job, createdBy }`（297-301 行）——**无 evaluations**。
  - result map（307-324 行）：`interviewers` 已返回；**无 evaluation 字段**。
- **`InterviewListQuery`**（18-26 行）：page/pageSize/candidateId/jobId/status/startDate/endDate——**需加 `round?: string`**。
- **`InterviewListItem`**（67-84 行）：含 round/type/interviewers/scheduledAt/...——**需加 `evaluation?: { conclusion: string | null } | null`**（取已提交评估第一条）。
- **前端契约**（已核实 `client/src/views/interviews/index.vue` 461-464 行）：
  ```ts
  evaluations?: Array<{ conclusion?: string | null }>;
  // 使用：row.evaluations?.[0]?.conclusion
  ```
  → **服务端字段名必须叫 `evaluations`（数组）**，前端读 `[0]?.conclusion`。**不要**用单数 `evaluation`，否则前端 reading 会 miss。
- **评估模型**：`InterviewEvaluation`（interviewId + interviewerId 唯一），`submittedAt` null=待填写。取「已提交」的条件 `submittedAt: { not: null }`；排序取最早提交（`orderBy: { submittedAt: 'asc' }`? 实际上一次面试多位面试官，前端只取第一条的 conclusion——取**任意一条已提交**即可，建议 `take: 1` + `orderBy: { updatedAt: 'desc' }` 取最近）。
- **round 取值**：`round` 是面试轮次字符串（初试/复试/终面）。筛选 `where.round = query.round`（精确匹配）。
- **缓存**：`cacheKey` 已含 `JSON.stringify(query)`（267 行）——加 round 参数后 cache key 自动含新字段，无需处理。

### 2.3 数据契约（交付后前端直接用）

面试列表项新增字段：
```ts
evaluations: Array<{
  conclusion: string | null;
  submittedAt: string;   // 用于前端可进一步判断
}>
```

## 3. 必读约束

### 3.1 evaluations include（重点）
`findMany` 的 include 加：
```ts
evaluations: {
  where: { submittedAt: { not: null } },
  orderBy: { updatedAt: 'desc' },
  select: { conclusion: true, submittedAt: true },
  take: 1,
},
```
前端 `row.evaluations?.[0]?.conclusion` 直接命中。

### 3.2 round 筛选
1. `InterviewListQuery` 加 `round?: string`
2. `getInterviews` 解构加 `round`
3. `if (round) where.round = round;`
> 前端已传 round（`params.round`），后端接住即可。

### 3.3 返回类型
`InterviewListItem` 加：
```ts
evaluations: Array<{ conclusion: string | null; submittedAt: string }>;
```
result map 加 `evaluations: it.evaluations.map((e) => ({ conclusion: e.conclusion, submittedAt: e.submittedAt.toISOString() }))`。

## 4. 实施任务

### 4.1 `server/src/services/interview-scheduler.service.ts`（条件修改）

1. `InterviewListQuery`（18 行）：加 `round?: string;`
2. `InterviewListItem`（67 行）：加 `evaluations: Array<{ conclusion: string | null; submittedAt: string }>;`
3. `getInterviews` 解构（256-264 行）：加 `round`
4. where（273-289 行）：加 `if (round) where.round = round;`
5. include（297-301 行）：加 evaluations（§3.1）
6. result map（307-324 行）：加 `evaluations: it.evaluations.map(...)`

### 4.1b ✱ `server/src/routes/interviews.ts`（条件修改，必做）

`listInterviewQuerySchema`（88-97 行）**当前无 round**，前端传 `?round=` 会被 zod strip。加：

```ts
round: z.enum(['初试', '复试', '终面'] as [string, ...string[]]).optional(),
```

> 复用文件顶部已有的 `INTERVIEW_ROUNDS` 常量（17 行 `round: z.enum([...INTERVIEW_ROUNDS]...)`），保持与创建/更新 schema 一致：
> `round: z.enum([...INTERVIEW_ROUNDS] as [string, ...string[]]).optional(),`

### 4.2 ✱ `server/tests/integration/interview-list-round-eval.test.ts`（新增）

覆盖：
- **round 筛选**：`GET /api/interviews?round=初试` → service where 含 round（mock prisma.interview.findMany 断言 where 有 `round: '初试'`）；不同 round 返回过滤
- **evaluations include**：`GET /api/interviews` → findMany 的 include.evaluations 含 `where.submittedAt.not=null` + `take:1`；返回项带 `evaluations` 数组
- **无 round 参数**：不带 round 时 where 无 round（不打扰现有查询）
- **有 evaluations 的项**：mock 返回带 conclusion 的评估 → 列表项 evaluations[0].conclusion 正确透传
- **缓存交互**：round 不同 → cache key 不同（可选，验证 query 序列化含 round）

> 参照 `server/tests/integration/interview-scheduler.test.ts` 或 `interview-outline.test.ts` 的 mock 模式（vi.mock prisma + supertest）。注意 mock 需包含 `interview.findMany` 的 include 断言。

## 5. 关键决策点

### 5.1 evaluations 字段名：复数数组
前端已读 `evaluations?.[0]?.conclusion`（INTV-C 交付），服务端必须返回**数组** `evaluations`。**不要改前端**，服务端对齐前端契约。

### 5.2 take:1 + 最近优先
一次面试多位面试官，前端只要第一条结论。用 `orderBy: { updatedAt: 'desc' }` + `take: 1` 取最近提交的。若你想"聚合所有已提交结论"，那是另一个需求（本次不做，保持前端契约简单）。

### 5.3 round 精确匹配
面试轮次是枚举字符串（初试/复试/终面）——精确 `=` 匹配即可，不做模糊。

### 5.4 不动创建/更新
`createInterview` / `updateInterview` 的 round 已支持，只补**列表查询**的 round 筛选。改这两方法外的现有逻辑不动。

## 6. 修改文件清单

### 6.1 必改文件（2 个；✱=新增）
1. `server/src/services/interview-scheduler.service.ts`（round 筛选 + evaluations include + 类型）
2. ✱ `server/tests/integration/interview-list-round-eval.test.ts`

### 6.2 禁止修改文件
- `client/**`、`e2e/**`、任何 tsconfig / eslint / vite
- `server/prisma/**`（schema / migrations **禁止**）
- `server/src/controllers/interview.controller.ts`（查询参数已透传 query，无需改）
- `server/src/routes/interviews.ts`（查询 schema 需确认是否含 round——若 `listInterviewQuerySchema` 没有 round，**需要加**！见 §7 检查点）

> **注意**：`server/src/routes/interviews.ts` 的 `listInterviewQuerySchema`（zod）若不含 `round`，前端传 `?round=` 会被 zod strip 掉——**1 个必选改动**：在 listQuerySchema 加 `round: z.string().max(20).optional()`。请检查并处理，若已有则跳。

### 6.3 越界检测（交付前自检）
- `git status --short` 仅出现 6.1 + §7 检查点决定的文件。
- `git diff --stat -- client e2e server/prisma` 必须 0 行。

## 7. 验收标准

### 7.1 硬性验收（审核方执行，你不跑）
- `server pnpm build`（tsc）：0 错误。
- `server pnpm test`：基线 62 文件 / 604 用例 + 本切片新测试全过（预期 63 文件 / 615+ 用例）。
- `server pnpm lint:check`：不新增 error（新增代码遵循全仓惯例）。
- client / e2e / server/prisma 0 行。

### 7.2 交付报告模板（最终回复必须完整包含）
1. 完成范围概述（文件数 + 是否动了 routes 的 zod）。
2. 条件修改逐处 before→after 摘要 + 中文注释。
3. round 筛选实现（Query 类型 / where / zod 是否补）。
4. evaluations include 实现（字段名对齐前端契约 / take:1 理由）。
5. 越界自检（git status 全文）。
6. 已知问题与遗留风险。
7. 红线自检确认。

按本提示词直接执行（headless 环境无人工确认环节）：先输出实施计划，然后动手，最终回复给出完整交付报告。