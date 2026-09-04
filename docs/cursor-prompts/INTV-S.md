# INTV-S 面试流程·服务端（权限修正 + 面试官下拉接口） 执行提示词

## ⚠️ 强约束（最优先阅读）

1. 本切片为**纯服务端**切片：`client/**`、`e2e/**` 一行不动；不改任何 package.json / tsconfig / eslint。
2. 文件预算 **4 个**（§6.1 逐一编号）；其中 3 个为既有文件的**条件修改**——最小化改动 + 中文注释，交付报告逐条列出。
3. **不需要** schema 变更：不动 `server/prisma/**`，不新增 migration，不跑 `prisma migrate/generate/seed`。
4. 编码红线：禁整文件重写既有文件；新文件 UTF-8 无 BOM、LF 行尾、2 空格缩进、单引号、行尾分号；中文注释。
5. 不跑验收命令（`pnpm test` / `build` / `lint` 都不跑，审核方重跑）。
6. headless 无人工确认：先输出实施计划，然后直接动手。

## 1. 任务 ID + 目标

### 1.1 任务 ID
INTV-S

### 1.2 任务目标
修复面试流程的服务端权限问题（前端入口恢复在 INTV-C 做）：
- **新增** `GET /api/users/interviewer-options`：返回可选面试官列表（interviewer / hr / hiring_manager 角色），供 HR 安排面试时选择面试官（现状 `/users` 是 admin-only，HR 拿不到面试官列表 → 下拉为空）。
- **面试官身份接口开放给 hiring_manager**：`/api/interview/*`（today / pending-evaluations / history / evaluation）的 `interviewerGuard` 从 `admin|interviewer` 增加到 `admin|interviewer|hiring_manager`——用人经理作为面试官参场时可用（权限矩阵已授权 `evaluation:read/update` + `ai:interview-outline`，service 层有"该场面试官"精确校验，不越权）。
- **complete 权限收紧**：`POST /api/interviews/:id/complete` 从「仅 authenticate」改为「admin 或**该场面试官之一**（interviewer / hiring_manager，按 interviewers JSON 匹配）」——面试官可标记自己参与的面试完成（用户已确认）。
- **cancel 权限收紧**：`POST /api/interviews/:id/cancel` 从「仅 authenticate」改为「admin 或 hr」（用户确认：HR、admin 可以 cancel）。

## 2. 上下文

### 2.1 项目位置
后端在 `server/`（Express 4 + TS ESM + Prisma 5.22）。既有代码用相对路径 ../。**动手前先读** `server/src/services/interview-scheduler.service.ts`（505 行）与 `server/src/routes/interview.ts`（单数，202 行）、`server/src/routes/interviews.ts`（复数，237 行）、`server/src/controllers/interview.controller.ts`（207 行）、`server/src/routes/users.ts`（367 行）。

### 2.2 关键已核实事实（起草人已实读源码，可直接采信）

- **`server/src/routes/interview.ts`（单数，面试官工作台）**：
  - `interviewerGuard = [authenticate, requireRole('admin', 'interviewer')]`（第 10 行）→ **改为加 `'hiring_manager'`**。
  - 接口：`GET /my`、`GET /today`、`GET /pending-evaluations`、`GET /history`、`PUT /:id/evaluation`。**全部走 interviewerGuard**，改一处 guard 即可全开。
  - `PUT /:id/evaluation` 内部已有精确校验（155-160 行）：非 admin 必须 `loadVisibleInterviewIds(userId)` 含该面试（即该场面试官之一），upsert 用 `interviewerId: userId`——**改 guard 不产生越权**，无需动 service 逻辑。
- **`server/src/routes/interviews.ts`（复数，面试管理）**：
  - `POST /:id/cancel`（219-224 行）仅 authenticate → **加 `requireRole('admin', 'hr')`**。
  - `POST /:id/complete`（230-235 行）仅 authenticate → **改为 controller 内精确校验**（admin 或该场面试官）。
- **`server/src/controllers/interview.controller.ts`**：
  - `cancelInterview`（112-128 行）：已传 scope 给 service。加角色中间件即可。
  - `completeInterview`（134-145 行）：调 `interviewSchedulerService.completeInterview(req.params.id)`（无 user 入参）。**不能用路由 requireRole('admin','interviewer','hiring_manager') 一刀切**（会放行不在该场的 interviewer）→ 需在 controller 内查 `interview.interviewers` JSON 匹配当前 userId。
- **`interview-scheduler.service.ts`**：
  - `completeInterview(id)`（420-445 行）：无 userId 参数，完成后发 F4 积分（归属 `interview.createdById`）。本切片**不动此方法**；权限校验在 controller 层做。
  - `cancelInterview(id, reason, scope)`（382-418 行）：有可见性校验（assertCandidateVisible），本切片不动逻辑，只加角色中间件。
- **`server/src/routes/users.ts`**：
  - `GET /`（54-58 行）`:authorize('admin')` —— 这是 HR 拿不到用户列表的根源。
  - `GET /approver-options`（122-137 行）只返回 admin（供 Offer 审批人）——**不适合**当面试官下拉。
  - **新增** `GET /interviewer-options`（注册在 `/approver-options` 之后、`/:id` 之前）：返回 `role IN ('interviewer', 'hr', 'hiring_manager', 'admin')` 的用户 id/name（**admin 也返回**——admin 经常亲自面试；但排 bo t？不需要，就这 4 角色）。`select: { id: true, name: true, department: true }`，`orderBy: { createdAt: 'asc' }`，`authenticate` 即可（登录用户可读，HR 安排面试要用）。
- **前端现状**（供理解上下文，不改）：`loadUsers()` 在 `client/src/views/interviews/index.vue` 497-507 行调 `getUserList`（`/users`，admin-only）→ HR 403 → catch 吞掉 → 面试官下拉空。INTV-C 会把前端切到新接口。

### 2.3 权限语义（用户已确认）

| 动作 | 允许角色 | 校验层级 |
|------|---------|---------|
| complete 面试 | admin 或 **该场面试官之一**（interviewer / hiring_manager，按 interviewers JSON id 匹配）| controller 内精确校验 |
| cancel 面试 | admin / hr | 路由中间件 `requireRole('admin', 'hr')` |
| 面试官工作台（/api/interview/*）| admin / interviewer / **hiring_manager** | 路由 guard 放开 |
| 面试官下拉选项 | 登录用户可读 | 路由 authenticate（返回 4 角色）|

## 3. 必读约束

### 3.1 interviewers JSON 结构
`Interview.interviewers` 是 `Json`，形如 `[{ "id": "xxx", "name": "张三" }]`（创建时传入）。判断"该场面试官"：`Array.isArray(interviewers) && interviewers.some((u: any) => u.id === userId)`。**注意 Prisma 返回的 Json 可能是 `any` 或 `Prisma.JsonValue`，操作前先 `as any[]`（加 eslint-disable 注释，参照 interview-scheduler.service.ts 内已有做法）。**

### 3.2 complete 校验的顺序
controller 内：
1. `findUnique` 拿 interview（含 interviewers）——不存在 404
2. role === 'admin' → 放行
3. 否则判断 interviewers 里有无当前 userId → 有放行，无 403「仅面试官可标记完成」
4. 调 service.completeInterview

### 3.3 cancel 角色
路由加 `requireRole('admin', 'hr')`。**注意**：hiring_manager 即使作为面试官也**不能 cancel**（用户确认 cancel 只给 HR/admin）——但他能 complete。

### 3.4 新增接口的响应
`GET /api/users/interviewer-options` 返回：
```json
{ "success": true, "data": [{ "id": "cmx", "name": "张三", "department": "技术部" }] }
```
不返回 email / phone / password 等敏感字段。

## 4. 实施任务

### 4.1 `server/src/routes/users.ts`（条件修改）

在 `GET /approver-options` 路由之后、`GET /:id` 之前，新增：

```ts
/**
 * GET /api/users/interviewer-options
 * 可选面试官列表（interviewer / hr / hiring_manager / admin），供面试安排选择面试官
 * 权限：登录用户（仅返回 id/name/department，无敏感信息）
 * 注意：注册在 /:id 之前，避免被当作 id 匹配
 */
router.get(
  '/interviewer-options',
  authenticate,
  asyncHandler(async (_req, res) => {
    const users = await prisma.user.findMany({
      where: { role: { in: ['interviewer', 'hr', 'hiring_manager', 'admin'] } },
      select: { id: true, name: true, department: true },
      orderBy: { createdAt: 'asc' },
    });
    res.json({ success: true, data: users });
  })
);
```

### 4.2 `server/src/routes/interview.ts`（单数，条件修改）

第 10 行：
```ts
const interviewerGuard = [authenticate, requireRole('admin', 'interviewer')] as const;
```
改为：
```ts
// 用人经理（hiring_manager）作为面试官参场时也需要工作台/评估入口；
// service 层有「该场面试官」精确校验，role 放开不产生越权
const interviewerGuard = [
  authenticate,
  requireRole('admin', 'interviewer', 'hiring_manager'),
] as const;
```

### 4.3 `server/src/routes/interviews.ts`（复数，条件修改）

1. `POST /:id/cancel`（219-224 行）：在 `authenticate` 后加 `requireRole('admin', 'hr')`。
2. `POST /:id/complete`（230-235 行）：去掉「无校验」，改为 `authenticate` + controller 内精确校验（见 4.4）。**不加 requireRole**（角色多样，controller 判断更准）。

### 4.4 `server/src/controllers/interview.controller.ts`（条件修改）

`completeInterview`（134-145 行）改为：

```ts
async completeInterview(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const userId = req.user!.userId;
    const interview = await prisma.interview.findUnique({
      where: { id: req.params.id },
      select: { id: true, interviewers: true },
    });
    if (!interview) {
      throw new AppError('面试安排不存在', 404);
    }
    // 仅面试官之一可标记完成（admin 直通）；hiring_manager 同为面试官可完成，
    // 但普通 interviewer 只能完成自己参与的那场
    if (req.user!.role !== 'admin') {
      const list = Array.isArray(interview.interviewers)
        ? (interview.interviewers as Array<{ id?: string }>)
        : [];
      const isInterviewer = list.some((u) => u.id === userId);
      if (!isInterviewer) {
        throw new AppError('仅参与本次面试的面试官可标记完成', 403);
      }
    }
    await interviewSchedulerService.completeInterview(req.params.id);
    res.json({ success: true, message: '面试已标记为完成，请及时录入面试反馈' });
  } catch (error) {
    next(error);
  }
}
```

> 需要 import `prisma` 到 controller（检查现有 import——该 controller 可能没 import prisma，若有则复用 `AppError`；没有则加 `import prisma from '../lib/prisma'`，参照其他 controller 写法）。
> 若 controller 里不宜直接碰 prisma（三层架构惯例），可改为在 service 加一个「校验是否该场面试官」方法——**二选一，交付报告说明选择**。我倾向放 service：service 已有 `assertCandidateVisible` 惯例，加 `assertInterviewerOf(id, userId)` 更符合分层。

### 4.5 测试（新增 1 个文件）

✱ `server/tests/integration/interview-permission.test.ts`：
- `GET /api/users/interviewer-options`：
  - 无 token → 401
  - hr 登录 → 200 返回 interviewer/hr/hiring_manager/admin 用户（不含 email/phone）
- `GET /api/interview/today`：
  - hiring_manager → 200（原 403 修复）
  - interviewer → 200
- `PUT /api/interviews/:id/evaluation`：
  - hiring_manager 且是该场面试官 → 200（mock interviewers 含该用户）
  - hiring_manager 但不是该场面试官 → 403（loadVisibleInterviewIds 不含）
- `POST /api/interviews/:id/complete`：
  - 该场 interviewer → 200
  - 不在 interviewers 里的 interviewer → 403
  - hiring_manager 是该场面试官 → 200
  - admin → 200
- `POST /api/interviews/:id/cancel`：
  - hr → 200
  - admin → 200
  - interviewer（即使该场面试官）→ 403
  - hiring_manager → 403（用户确认：cancel 仅 hr/admin）

> 测试 mock prisma（参照 `server/tests/integration/interview-scheduler.test.ts` 或 `interview-outline.test.ts` 模式：`x-test-role` 头注入角色 + mock prisma.interview.findUnique 返回固定 interviewers JSON）。

## 5. 关键决策点

### 5.1 权限校验位置：controller vs service
complete 的「该场面试官」校验放 **service**（新方法 `assertInterviewerOf`）更符合三层架构（controller 不碰 prisma）。**建议 service 方案**：
```ts
// interview-scheduler.service.ts
async assertInterviewerOf(interviewId: string, userId: string): Promise<void> {
  const interview = await prisma.interview.findUnique({
    where: { id: interviewId },
    select: { interviewers: true },
  });
  if (!interview) throw new AppError('面试安排不存在', 404);
  const list = Array.isArray(interview.interviewers)
    ? (interview.interviewers as Array<{ id?: string }>)
    : [];
  if (!list.some((u) => u.id === userId)) {
    throw new AppError('仅参与本次面试的面试官可标记完成', 403);
  }
}
```
controller 调：role !== 'admin' → `await service.assertInterviewerOf(id, userId)` → `service.completeInterview(id)`。

### 5.2 interviewer-options 返回 admin 吗
**返回**。admin 常亲自参面（面试官工作台对 admin 开放是现有行为）；安排面试时选 admin 作为面试官合理。若你不想让 admin 出现在候选列表，交付报告说明即可（默认含）。

### 5.3 不动 service 现有方法
`completeInterview` / `cancelInterview` 的**现有逻辑不动**（积分、可见性校验原样）——只加权限层。

## 6. 修改文件清单

### 6.1 必改文件（4 个；✱=新增）
1. `server/src/routes/users.ts`（interviewer-options 接口）
2. `server/src/routes/interview.ts`（interviewerGuard 加 hiring_manager）
3. `server/src/routes/interviews.ts`（cancel 加角色、complete 去硬校验）
4. `server/src/services/interview-scheduler.service.ts`（新增 assertInterviewerOf）
5. `server/src/controllers/interview.controller.ts`（complete 用新校验）
6. ✱ `server/tests/integration/interview-permission.test.ts`

### 6.2 禁止修改文件
- `client/**`、`e2e/**`、任何 tsconfig / eslint / vite
- `server/prisma/**`（schema / migrations **禁止**）
- `server/src/routes/users.ts` 的既有接口逻辑（只追加新路由）
- `server/src/services/interview-scheduler.service.ts` 的 complete/cancel 现有逻辑（只加新方法）

### 6.3 越界检测（交付前自检）
- `git status --short` 仅出现 6.1 的 6 个路径。
- `git diff --stat -- client e2e server/prisma` 必须 0 行。
- 无 package.json / lockfile 改动。

## 7. 验收标准

### 7.1 硬性验收（审核方执行，你不跑）
- `server pnpm build`（tsc）：0 错误。
- `server pnpm test`：基线 56 文件 / 600 用例 + 本切片新测试全过（预期 57 文件 / 620+ 用例）。
- `server pnpm lint:check`：不新增 error（新增代码遵循全仓 import/extension 惯例；interviewers JSON 操作加 eslint-disable 注释）。
- client / e2e / server/prisma 0 行。

### 7.2 交付报告模板（最终回复必须完整包含）
1. 完成范围概述（6 文件）。
2. 文件逐个说明（新增写职责；条件修改**逐处**列 before→after 摘要 + 中文注释）。
3. 权限矩阵确认（complete / cancel / 工作台 / interviewer-options 各自的角色与校验层级）。
4. assertInterviewerOf 实现说明（interviewers JSON 匹配 + 位置选择 controller vs service 的结论）。
5. 越界自检（git status 全文 + 0 行检查）。
6. 已知问题与遗留风险（如 interviewer-options 含 admin 的取舍）。
7. 红线自检确认。

按本提示词直接执行（headless 环境无人工确认环节）：先输出实施计划，然后动手，最终回复给出完整交付报告。