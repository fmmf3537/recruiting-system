# 阶段 0 紧急修复 - Cursor Vibe Coding 提示词集

> **目标读者**：Cursor Composer / Cursor Agent
> **使用方式**：每次打开一个新的 Composer 会话，**只粘贴一个提示词**，不要合并
> **原则**：单一变更 + 测试先行 + 禁止越界
> **范围**：仅覆盖审计报告中"阶段 0：紧急修复"的 6 个任务

---

## 📋 提示词索引

| # | 修复项 | 优先级 | 提示词文件锚点 |
|---|--------|--------|----------------|
| 1 | `upload.ts` 顶层 await | P0 | [PROMPT-01](#prompt-01-修复-uploadts-顶层-await) |
| 2 | 引入 pino 日志 + PII redact | P0 | [PROMPT-02](#prompt-02-引入-pino-日志--pii-redact) |
| 3 | JWT user 查询 Redis 缓存 | P0 | [PROMPT-03](#prompt-03-jwt-user-查询加-redis-缓存) |
| 4 | 拆分 `candidate.service.ts` | P0 | [PROMPT-04](#prompt-04-拆分-candidateservicets-拆出-workhistory) |
| 5 | Prisma enum 改造 + 部门表 | P1 | [PROMPT-05](#prompt-05-prisma-enum-改造--部门表) |
| 6 | 所有查询字段加 Zod `.max()` | P1 | [PROMPT-06](#prompt-06-所有查询字段加-zod-max-长度限制) |

---

## ⚙️ 全局使用约束（每次粘贴前先看）

```
🚨 通用铁律（违反任何一条立即停止）：
1. 不要触碰本提示词未提及的任何文件
2. 不要"顺手"重构 / 改名 / 格式化未要求修改的代码
3. 不要安装提示词未列出的 npm 包
4. 不要修改 .env / docker / nginx 等配置，除非明确要求
5. 变更必须可被 git diff 一目了然地展示
6. 不要修改测试快照（*.snap）去让测试通过
```

### 📐 v1.1 元规则：当"行数约束"与"功能完整性"冲突时

> **本节基于 PROMPT-01 实战反馈编写**：用户指出"1-3 行"约束与推荐方案的 try/catch 块本身冲突。

当提示词中"X 行变更" / "Y 个文件"等量化约束与标准做法（try/catch、空值检查、错误传播）冲突时，按以下优先级处理：

| 优先级 | 约束类型 | 处理方式 |
|--------|---------|---------|
| 🔴 硬 | 功能完整性 / 安全校验 / 错误处理 | **不可妥协**，允许行数膨胀 |
| 🔴 硬 | "禁止做的事"清单 | 不可触碰 |
| 🟡 软 | "X 行 / Y 文件"等量化指标 | **允许 ±50% 偏差**，前提是偏差由标准错误处理导致 |
| 🟢 软 | 代码风格（命名、注释位置） | 与现有风格一致即可 |

**Cursor 自我 review 时**，如果实际行数超出预期，必须在末尾"实施备注"中说明。

**禁止的偏差**：删除 try/catch、删除空值检查、删除错误传播以"凑行数"。这会被视为引入新 bug。

### 📋 Cursor 完成后必须输出"实施备注"模板

每个提示词任务完成后，Cursor 必须输出以下 5 行小节（便于人工 review）：

```markdown
## 实施备注

- 实际改动：[实际行数 / 文件数]
- 推荐方案预估：[预估行数 / 文件数]
- 偏差原因：[解释多了什么 / 少了什么；如无偏差填"无"]
- 是否属于"标准做法的合理膨胀"：[是 / 否]
- 禁止事项逐条勾选：[✅/❌] × 4-5 条
```

---

<a id="prompt-01"></a>
## PROMPT-01：修复 `upload.ts` 顶层 await

### 任务说明
**问题**：`server/src/routes/upload.ts:28` 在 ES Module 顶层执行 `await fs.mkdir(...)`，导致模块导入阶段阻塞，进程启动失败会蔓延，且增加启动耗时。

### Cursor 提示词

```markdown
# 任务：修复 upload.ts 顶层 await 阻塞问题

## Context（你需要知道的事实）
- 项目使用 Express 4 + TypeScript + ES Modules (`"type": "module"`)
- 入口是 `server/src/index.ts`，启动顺序：创建 app → 启动 server → 注册 cron / worker
- 当前 `server/src/routes/upload.ts` 第 28 行有顶层 `await fs.mkdir(uploadDir, { recursive: true })`
- ES Module 顶层 await 在 import 阶段执行，会：
  1. 拖慢整个模块树加载
  2. mkdir 失败时让进程启动崩溃（应该 graceful 降级）
- 已存在的应用代码中有类似的可参考模式：`server/src/index.ts:16-19` 用的是「先 listen，再 catch error」的非阻塞模式

## 现有代码（不要重写，只移动位置）
文件：`server/src/routes/upload.ts`，第 27-29 行：
```ts
const uploadDir = path.resolve(process.cwd(), env.UPLOAD_DIR);
await fs.mkdir(uploadDir, { recursive: true });
const storage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    cb(null, uploadDir);
  },
  ...
});
```

## 要求的行为变更
1. 删除 `upload.ts` 第 28 行的顶层 `await fs.mkdir(...)`
2. 把 `uploadDir` 改为惰性计算（函数内部）或放在模块作用域但用同步 `fs.mkdirSync(..., { recursive: true })` + try/catch 兜底
3. `multer.diskStorage` 的 `destination` 回调保持异步语义：执行前先确保目录存在

## 推荐方案（你可以提更好的，但不要更复杂的）
在 `destination` 回调里用同步 `fs.mkdirSync(uploadDir, { recursive: true })`，因为：
- 该回调只在收到上传请求时才执行（不再是 import 时）
- 同步调用一次开销可忽略（目录已存在时是 noop）
- 失败时让 multer 回调 `(err)` 自然冒泡到全局 errorHandler

伪代码：
```ts
const storage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    try {
      fs.mkdirSync(uploadDir, { recursive: true });
      cb(null, uploadDir);
    } catch (err) {
      cb(err as Error);
    }
  },
  filename: ...,
});
```

## 禁止事项（不要做这些）
- ❌ 不要修改 `multer` 的 `limits`、`fileFilter` 配置
- ❌ 不要改动路由处理函数（`router.post('/', ...)` 的逻辑）
- ❌ 不要把 `uploadDir` 改成类或单例服务
- ❌ 不要新增 npm 依赖
- ❌ 不要触碰其他文件（`files.ts`、`file.service.ts` 都不动）

## 验收条件（必须全部 PASS）
1. ✅ `pnpm dev` 启动 server 时控制台无任何 `mkdir` 相关报错
2. ✅ 上传文件接口 `POST /api/upload` 功能正常（手动测一次）
3. ✅ 删除 `server/uploads/` 目录后重启 server，上传文件仍能成功（说明目录创建逻辑生效）
4. ✅ `pnpm test` 全部通过（不需要为本次改动新增测试，因为是被动修复）
5. ✅ `git diff server/src/routes/upload.ts` 行数与推荐方案伪代码大致一致（约 5-10 行，[软目标]）

## 完成后请输出
1. 修改后的 `upload.ts` 完整 diff
2. 验证步骤的截图或日志输出
3. 自我 review：是否触犯了任何"禁止事项"

## 实施备注（必填）

按 v1.1 元规则填写：
- 实际改动：[行数]
- 推荐方案预估：[7-10 行]
- 偏差原因：[无 / 解释多了什么]
- 是否属于"标准做法的合理膨胀"：[是 / 否]
- 禁止事项勾选：
  - [✅/❌] 不修改 multer limits / fileFilter
  - [✅/❌] 不改动 router.post 逻辑
  - [✅/❌] 不把 uploadDir 改成类/单例
  - [✅/❌] 不新增 npm 依赖
  - [✅/❌] 不触碰 files.ts / file.service.ts
```

---

<a id="prompt-02"></a>
## PROMPT-02：引入 pino 日志 + PII redact

### 任务说明
**问题**：业务代码大量 `console.log/console.error`，且错误堆栈可能泄漏 PII（候选人姓名、手机、邮箱），不符合个保法。

### Cursor 提示词

```markdown
# 任务：引入 pino 结构化日志，并 redact PII 字段

## Context
- 服务端运行时：`server/src/`，Node 18+，Express 4
- 当前日志：`morgan('combined')` + 业务代码里大量 `console.log/console.error`
- 风险：日志可能含候选人姓名/手机/邮箱/简历 URL；如推送至 ELK 等三方平台违反个保法
- 已有依赖：`pino` 不在 `server/package.json`，需要新增
- 风格约束：本项目所有改动不引入与 lint/prettier 不兼容的代码

## Phase 1：安装与初始化
1. 在 `server/` 目录执行：
   ```bash
   pnpm add pino
   pnpm add -D @types/pino
   ```
2. 新建文件 `server/src/lib/logger.ts`，导出 `logger` 实例：
   ```ts
   import pino from 'pino';
   import { env } from './env';

   export const logger = pino({
     level: env.NODE_ENV === 'production' ? 'info' : 'debug',
     // 生产用 JSON 输出便于日志聚合；开发用 pretty（可选 pino-pretty）
     ...(env.NODE_ENV === 'development' && {
       transport: { target: 'pino-pretty', options: { colorize: true } },
     }),
     // 关键：redact 所有 PII 字段（防止日志泄漏个保法敏感数据）
     redact: {
       paths: [
         'req.headers.authorization',
         'req.headers.cookie',
         '*.password',
         '*.phone',
         '*.email',
         '*.name',         // 注意：这会 redact 候选人姓名
         '*.resumeUrl',
         '*.*.phone',
         '*.*.email',
         '*.*.name',
         '*.detail.password',
         '*.detail.phone',
         '*.detail.email',
       ],
       censor: '[REDACTED]',
     },
     // 不打印完整 Error 对象的非标准字段（堆栈保留）
     formatters: {
       level: (label) => ({ level: label }),
     },
   });

   export default logger;
   ```

## Phase 2：在 `app.ts` 接入请求日志
- 把 `morgan('combined')` 替换为 pino-http（需要 `pnpm add pino-http` 和 `@types/pino-http -D`）
- 让请求日志自带 `requestId`、`userId`（如有）

## Phase 3：替换业务代码中的 console.*
**只替换这些文件**（不要扩散）：
- `server/src/services/candidate.service.ts`
- `server/src/services/stats.service.ts`
- `server/src/services/anonymize.service.ts`
- `server/src/services/reminder.service.ts`
- `server/src/controllers/candidate.controller.ts`
- `server/src/index.ts`

替换规则：
| 现状 | 改为 |
|------|------|
| `console.log('xxx', data)` | `logger.info({ data }, 'xxx')` |
| `console.error('xxx', err)` | `logger.error({ err }, 'xxx')` |
| `console.warn('xxx')` | `logger.warn('xxx')` |

## 禁止事项
- ❌ 不要把 console.log 一刀切全部替换（保留 `startup banner` 等用户可见的输出）
- ❌ 不要删除任何日志，只改格式
- ❌ 不要新增除 pino / pino-http 之外的依赖
- ❌ 不要触碰 `morgan` 之外的中间件
- ❌ 不要修改 `lib/env.ts` 添加日志开关
- ❌ 不要 redact `'name'` 字段的一次性大范围：保持 `'*.name'` 路径限定（否则日志里连方法名都没了）

## 必须新增的测试
文件：`server/tests/unit/logger.test.ts`
测试用例：
1. `logger.info({ phone: '138...' }, 'test')` 输出中不应包含 `138`
2. `logger.error({ err: new Error('bad'), candidate: { name: '张三', email: 'a@b.com' } }, 'fail')` 输出中不应包含 `张三` 或 `a@b.com`
3. `logger.info({ userId: 'u1', requestId: 'r1' })` 输出应正常包含 `userId` 和 `requestId`
4. `logger.info('plain message')` 应正常输出

测试用 vitest 现有 setup，无需启动 server。

## 验收条件
1. ✅ `pnpm test` 全部通过，新测试 4 个全绿
2. ✅ 启动 server，`POST /api/upload` 等接口正常
3. ✅ 故意触发一个 4xx 错误，查看日志确认：
   - 包含 HTTP 方法、URL、状态码
   - 不含任何 phone/email/name 字面值
4. ✅ `pnpm lint` 无新增报错
5. ✅ `git diff` 只触及：1 个新文件 + 上述 6 个旧文件 + `package.json`/`pnpm-lock.yaml`

## 完成后请输出
1. `logger.test.ts` 完整代码
2. 修改的 6 个旧文件的 console → logger diff
3. 一段日志样例（redact 后的）
```

---

<a id="prompt-03"></a>
## PROMPT-03：JWT user 查询加 Redis 缓存

### 任务说明
**问题**：`server/src/middleware/auth.ts` 的 `loadUserFromToken` 每个请求都查 DB（`prisma.user.findUnique`），高并发下成为瓶颈。

### Cursor 提示词

```markdown
# 任务：JWT 中间件加 Redis 用户信息缓存

## Context
- 路径：`server/src/middleware/auth.ts`
- 当前实现（不要重写逻辑，只加缓存层）：
  ```ts
  const user = await prisma.user.findUnique({
    where: { id: decoded.userId },
    select: { id, email, role, department, tokenVersion },
  });
  ```
- 已有工具：`server/src/lib/redis.ts` 导出 `redis`、`getFromCache`、`setCache`
- 关键约束：tokenVersion 变更（改密、重置密码）必须立即失效缓存

## 缓存策略
1. **缓存 key**：`auth:user:${userId}`
2. **缓存 value**：完整的 user 查询结果（不含 password）
3. **TTL**：60 秒（短期，自动兜底 DB 一致性）
4. **失效策略**：
   - TTL 过期自然失效
   - **写操作时主动失效**：`changePassword`、`resetPassword` 时 `redis.del('auth:user:${userId}')`
   - **升级提示**：tokenVersion 修改时同样失效（见下方 Phase 3）

## Phase 1：修改 `auth.ts`
在 `loadUserFromToken` 函数中：
```ts
// 1. 先查 Redis
const cacheKey = `auth:user:${decoded.userId}`;
let user = await getFromCache<{
  id: string; email: string; role: string;
  department: string | null; tokenVersion: number;
}>(cacheKey);

// 2. miss 则查 DB 并回填
if (!user) {
  user = await prisma.user.findUnique({
    where: { id: decoded.userId },
    select: { id: true, email: true, role: true, department: true, tokenVersion: true },
  });
  if (user) {
    await setCache(cacheKey, user, 60);
  }
}

// 3. 后续 tokenVersion / email / role 校验逻辑保持不变
```

## Phase 2：写操作失效缓存
**只在两个地方加**：
1. `server/src/routes/auth.ts` 的 `changePassword` 接口（成功更新后）
2. `server/src/routes/users.ts` 的 `reset-password` 接口（如果存在）

每处加一行：
```ts
await redis.del(`auth:user:${user.id}`);
```

## Phase 3：tokenVersion 增量时的缓存失效
当 `prisma.user.update({ ..., data: { tokenVersion: { increment: 1 } } })` 时，
同一事务或紧接其后的代码中失效缓存。**优先查找现有修改 tokenVersion 的位置**（grep `tokenVersion: { increment`），
在那些位置统一加 `redis.del(\`auth:user:${userId}\`)`。

## 禁止事项
- ❌ 不要修改 JWT payload 结构
- ❌ 不要修改 tokenVersion 校验逻辑（只在缓存中保留它，不删除校验）
- ❌ 不要把 TTL 设长于 300 秒（防 stale）
- ❌ 不要改用内存 LRU（如 lru-cache）—— 必须用 Redis（多实例一致）
- ❌ 不要触碰 auth.ts 之外的其他中间件

## 必须新增的测试
文件：`server/tests/integration/auth-cache.test.ts`（vitest + supertest）
测试用例：
1. 第一次请求 → 触发 DB 查询，缓存写入
2. 第二次请求（同 token）→ 不触发 DB 查询（用 spy 验证 `prisma.user.findUnique` 只被调用 1 次）
3. 修改密码 → 缓存被清空
4. 缓存击穿：第一次请求进行中，第二个并发请求应复用同一结果（不重复查 DB，可用 Promise.all 测试）

参考已有 `server/tests/integration/auth.test.ts` 的 mock 风格。

## 验收条件
1. ✅ `pnpm test` 全部通过，新测试 4 个全绿
2. ✅ `pnpm test:coverage` 检查 `middleware/auth.ts` 覆盖率不下降
3. ✅ 手动测试：登录后连续访问 5 个受保护接口，DB query 次数应 ≤ 1（用 prisma log 验证）
4. ✅ 修改密码后立刻用旧 token 请求，应返回 401（说明缓存失效）

## 完成后请输出
1. 修改后的 `auth.ts` 完整 diff
2. 新增测试文件
3. DB 查询次数验证日志
```

---

<a id="prompt-04"></a>
## PROMPT-04：拆分 `candidate.service.ts`（拆出 WorkHistory）

### 任务说明
**问题**：`candidate.service.ts` 单文件 1522 行，承担 6+ 个职责。第一步：仅拆出 WorkHistory（最小动作，不涉及业务逻辑变更）。

### Cursor 提示词

```markdown
# 任务：从 candidate.service.ts 中拆出 WorkHistory 到独立 service

## Context
- 当前文件：`server/src/services/candidate.service.ts`（1522 行）
- WorkHistory 相关方法已存在（行号 1147-1268）：
  - `createWorkHistory(data)`
  - `createWorkHistories(candidateId, histories)`
  - `getWorkHistories(candidateId)`
  - `updateWorkHistory(id, data)`
  - `deleteWorkHistory(id)`
- 相关类型：`CreateWorkHistoryInput`（行号 1515）
- 相关 controller：`server/src/controllers/candidate.controller.ts` 调用了部分方法
- 现有路由：`server/src/routes/candidates.ts` 中 `GET /:id/work-history` 等

## 拆分原则
**纯重构，零业务变更**。所有方法体一行不动，只是物理位置移动 + import 调整。

## Phase 1：新建 `server/src/services/work-history.service.ts`
内容：从 `candidate.service.ts` 中剪切以下内容到新文件：
- 所有 WorkHistory 方法（保持原样，包括方法名、参数、返回类型、注释）
- `CreateWorkHistoryInput` 接口
- 在文件顶部加 import（复制自 candidate.service.ts 中用到的 imports）

文件末尾导出：
```ts
export const workHistoryService = new WorkHistoryService();
```

## Phase 2：从 `candidate.service.ts` 删除
- 删除上述所有 WorkHistory 方法和接口
- 删除不再使用的 import（如 `WorkHistory` type 如果不再用）
- 删除 `CreateWorkHistoryInput` 接口

## Phase 3：调整 controller
文件：`server/src/controllers/candidate.controller.ts`
把所有对 `candidateService.createWorkHistory` 等的调用改为 `workHistoryService.xxx`。
（如果有现成路由调用 service 的代码，一并修改）

## Phase 4：路由层
**不改路由**，只在 service 暴露的实例名上调整。如果路由直接引用了 `candidateService.xxx` 方法，调整为 `workHistoryService.xxx`。

## 禁止事项
- ❌ 不要合并或简化任何 WorkHistory 方法
- ❌ 不要调换参数顺序
- ❌ 不要改可见性校验逻辑
- ❌ 不要顺手拆分其他模块（InterviewFeedback / Activity / Batch 这些以后再说）
- ❌ 不要修改任何 caller 之外的代码
- ❌ 不要修改 Prisma schema
- ❌ 不要新增 npm 依赖

## 必须新增的测试
文件：`server/tests/unit/work-history.service.test.ts`
测试用例（按现有 `candidate.service.test.ts` 的 mock 风格写）：
1. `createWorkHistory` 成功创建一条记录
2. `createWorkHistory` 候选人不存在时抛 404
3. `createWorkHistories` 批量创建，按 `startDate desc` 返回
4. `createWorkHistories` 传入空数组时返回 `[]` 不报错
5. `updateWorkHistory` 工作经历不存在时抛 404
6. `deleteWorkHistory` 工作经历不存在时抛 404
7. `getWorkHistories` 按 `startDate desc` 返回

## 验收条件
1. ✅ `pnpm test` 全部通过，包括：
   - 新增的 `work-history.service.test.ts` 7 个用例
   - 现有的 `candidate.service.test.ts` 仍然全绿（说明业务逻辑没破）
2. ✅ `git diff --stat` 显示：
   - `candidate.service.ts` 减少与移出方法对应的行数（含方法签名、注释）[软目标：±30%]
   - `work-history.service.ts` 新增 ~120 行
   - 其他文件改动控制在 5 行内
3. ✅ `pnpm type-check`（如果配置了）通过
4. ✅ `pnpm lint` 通过
5. ✅ 手动测试：候选人详情页 → 工作经历模块，加/改/删均正常

## 完成后请输出
1. 新文件 `work-history.service.ts` 完整代码
2. `candidate.service.ts` 的 diff
3. 受影响的 controller / route 改动
4. 新增测试文件
5. **重要**：声明本次拆分未触发任何业务逻辑变更（行对行移动）

## 实施备注（必填）

按 v1.1 元规则填写：
- 实际改动：[列出 candidate.service.ts 减少行数 + work-history.service.ts 新增行数 + 其他改动]
- 推荐方案预估：[对应 ~120 行迁移]
- 偏差原因：[无 / 解释]
- 是否属于"标准做法的合理膨胀"：[是 / 否]
- 禁止事项勾选：
  - [✅/❌] 不合并/简化 WorkHistory 方法
  - [✅/❌] 不调换参数顺序
  - [✅/❌] 不修改可见性校验逻辑
  - [✅/❌] 不顺手拆分其他模块
  - [✅/❌] 不修改 Prisma schema
  - [✅/❌] 不新增 npm 依赖
```

---

<a id="prompt-05"></a>
## PROMPT-05：Prisma enum 改造 + 部门表

### 任务说明
**问题**：`User.role`、`Job.status`、`StageRecord.status` 等用字符串，魔法字符串散落代码中；`Job.departments` 用 JSON 数组，无法用 FK 约束。

### Cursor 提示词

```markdown
# 任务：Prisma enum 改造（先做 role/status/result 三个核心 enum）

## ⚠️ 大范围变更警告
本次是**数据库 schema 变更**，必须配套 migration。本提示词只覆盖**最小切片**：
1. 仅改造 `User.role`、`StageRecord.status`、`InterviewFeedback.conclusion`、`Offer.result`、`Offer.status`、`Interview.status`
2. **不**改造 `Job.departments`（那部分单独做，本次先跳过）
3. **不**改造 PipelineTemplate.stages 数组（业务保留自由文本）
4. 仅替换字符串为 enum 常量，**不改业务逻辑**

## Context
- `server/prisma/schema.prisma` 已声明所有模型
- `server/src/constants/index.ts` 已有部分常量定义（如 `DEFAULT_STAGE`），可以参考
- 现有字符串值（grep 出来后统一映射）：
  - `User.role`: `'admin'`, `'member'`
  - `StageRecord.status`: `'in_progress'`, `'passed'`, `'rejected'`
  - `InterviewFeedback.conclusion`: `'pass'`, `'reject'`, `'pending'`
  - `Offer.result`: `'pending'`, `'accepted'`, `'rejected'`
  - `Offer.status`: `'draft'`, `'pending_approval'`, `'approved'`, `'rejected'`, `'sent'`
  - `Interview.status`: `'scheduled'`, `'completed'`, `'cancelled'`, `'no_show'`
- `stage` 字段保留为 String（不同模板自定义，本提示词不动）

## Phase 1：修改 schema.prisma
在文件顶部加：
```prisma
enum UserRole {
  admin
  member
}

enum StageStatus {
  in_progress
  passed
  rejected
}

enum InterviewConclusion {
  pass
  reject
  pending
}

enum OfferResult {
  pending
  accepted
  rejected
}

enum OfferStatus {
  draft
  pending_approval
  approved
  rejected
  sent
}

enum InterviewStatus {
  scheduled
  completed
  cancelled
  no_show
}
```

修改模型字段（仅修改 type，不改其他）：
```prisma
model User {
  role UserRole
  ...
}

model StageRecord {
  status StageStatus
  ...
}

model InterviewFeedback {
  conclusion InterviewConclusion
  ...
}

model Offer {
  result OfferResult
  status OfferStatus
  ...
}

model Interview {
  status InterviewStatus @default(scheduled)
  ...
}
```

## Phase 2：生成 migration
```bash
cd server
npx prisma migrate dev --name add_enum_types
```
**运行前**检查生成的 migration SQL，确保 ALTER TABLE 用了 `USING` 子句把字符串映射到 enum：
```sql
ALTER TABLE "user" ALTER COLUMN "role" TYPE "UserRole" USING "role"::"UserRole";
```

## Phase 3：替换代码中的魔法字符串
**只改这 5 个文件（清单不变）**：
- `server/src/services/candidate.service.ts`
- `server/src/services/offer.service.ts`
- `server/src/services/interview-scheduler.service.ts`
- `server/src/services/interview-evaluation.service.ts`
- `server/src/services/anonymize.service.ts`

替换规则：
| 改前 | 改后 |
|------|------|
| `status: 'in_progress'` | `status: StageStatus.in_progress` |
| `where: { role: 'admin' }` | `where: { role: UserRole.admin }` |
| `result === 'accepted'` | `result === OfferResult.accepted` |

## Phase 4：Prisma Client 类型
`prisma generate` 后 TypeScript 应能自动推断 enum 类型；如果仍有字符串字面量报错，import 对应 enum 即可。

## 禁止事项
- ❌ 不要新增 enum 类型（如 `StageStageEnum`，那是过度设计）
- ❌ 不要修改模型关系、索引、字段名
- ❌ 不要触碰 `Job.departments`、`PipelineTemplate.stages`、`Candidate.skills` 等 JSON 字段
- ❌ 不要触碰测试 snapshot
- ❌ 不要在 migration 中加 seed 数据修改
- ❌ 不要触碰 `prisma/seed.ts`
- ❌ 不要硬删除 enum 值（如果某个字符串没用到，保留 enum 定义）

## 必须新增的测试
文件：`server/tests/unit/enum-migration.test.ts`
测试用例：
1. 验证 Prisma Client 生成的类型中 `User.role` 是 `UserRole` 类型（编译期检查）
2. 用 mock 验证 `prisma.user.create` 时传入 `UserRole.admin` 合法，传入非法字符串被 TypeScript 拒绝
3. 验证 `where: { role: UserRole.admin }` 在 mock 中能被正确接收

## 验收条件
1. ✅ `pnpm prisma migrate dev` 成功，迁移文件生成
2. ✅ `pnpm test` 全部通过
3. ✅ `pnpm type-check` 无新增报错（如果有的话）
4. ✅ `pnpm lint` 通过
5. ✅ 启动 server 后手动测试：登录、创建候选人、推进阶段、创建 Offer、安排面试，所有流程正常
6. ✅ 数据库里 `pg_dump` 确认 enum 类型已创建：
   ```sql
   SELECT typname FROM pg_type WHERE typtype = 'e' ORDER BY typname;
   ```
   应看到 6 个新增 enum

## 回滚预案
如果迁移后启动失败：
```bash
cd server
npx prisma migrate resolve --rolled-back add_enum_types
# 或重置
npx prisma migrate reset
```

## 完成后请输出
1. migration 文件内容
2. 5 个 service 文件的改动 diff
3. 验收清单逐项确认

## 实施备注（必填）

按 v1.1 元规则填写：
- 实际改动：[行数]
- 推荐方案预估：[枚举字段数量 + service 替换 console.log 数量]
- 偏差原因：[无 / 解释]
- 是否属于"标准做法的合理膨胀"：[是 / 否]
- 禁止事项勾选：
  - [✅/❌] 不新增 enum 类型
  - [✅/❌] 不修改模型关系/索引/字段名
  - [✅/❌] 不触碰 Job.departments / PipelineTemplate.stages
  - [✅/❌] 不触碰测试 snapshot
  - [✅/❌] 不在 migration 中加 seed 数据修改
  - [✅/❌] 不硬删除 enum 值
```

---

<a id="prompt-06"></a>
## PROMPT-06：所有查询字段加 Zod `.max()` 长度限制

### 任务说明
**问题**：Zod schema 没有字段长度上限，攻击者可发超长字段（如 1MB `keyword`），消耗 DB CPU。

### Cursor 提示词

```markdown
# 任务：为关键 Zod schema 补全长度限制

## Context
- 已有：`server/src/middleware/validate.ts` 导出 `validate`、`validateAll`、`passwordSchema`
- 路由文件全部用 z.object 定义输入 schema（散落在 routes/*.ts）
- 重点目标：**所有字符串字段都加 `.max(N)`**，数字字段加范围

## 字段长度上限标准（用这个常量集，不要自定义）
| 字段类型 | 长度限制 | 理由 |
|---------|---------|------|
| 邮箱 | 254 | RFC 5321 |
| 姓名 | 50 | 业务合理 |
| 密码 | 100 | 防 DoS |
| 标题 | 200 | 职位/HC 申请标题 |
| 描述/正文（短） | 500 | 短文本 |
| 富文本（长） | 5000 | 业务文案 |
| JSON 字段 | 5000 字符序列化后 | 防巨型 JSON |
| URL | 2048 | 浏览器 URL 限制 |
| keyword（搜索） | 100 | 搜索词 |
| 手机号 | 20 | 含国际区号 |

## Phase 1：扫描所有 Zod schema
```bash
cd server
grep -rn "z.string()" src/routes/ src/controllers/ | wc -l
```
预期会找到 50+ 处。

## Phase 2：批量替换
**只修改 z.string() 和 z.number()**，不修改 z.object 结构。

替换规则（用一个简单的 sed/手动编辑均可）：
- 找到 `z.string(` 但没有 `.max(` 的，统一改为 `z.string().max(N)`
- 找不到 `z.string(` 但用了其他形式的（如 `z.string().min(6)`），改为 `z.string().min(6).max(100)`
- 数字字段：`z.number()` 加 `.int().min(0)` 或合理范围

## Phase 3：受影响的路由（仅供参考，全量修改）
- `auth.ts`：`email`、`password`、`name`、`authCode`
- `users.ts`：所有 user 相关
- `candidates.ts`：name、phone、email、school、currentCompany 等
- `jobs.ts`：title、description、requirements 等
- `offers.ts`：salary、note
- `hc-requests.ts`：title、department、reason、reasonNote 等
- `tags.ts`：name、color
- `email.ts`：subject、body
- `search query`：所有 `keyword` 字段

## 禁止事项
- ❌ 不要修改 `.min()` 已经定义的下限
- ❌ 不要把 `z.string()` 改为 `z.coerce.string()`（会改变语义）
- ❌ 不要修改密码字段的复杂度校验（`passwordSchema` 不动）
- ❌ 不要触碰 enum 字段
- ❌ 不要新增更复杂的校验（如正则），仅加 `.max`
- ❌ 不要修改 Prisma schema

## 必须新增的测试
文件：`server/tests/integration/zod-length-limit.test.ts`
测试用例（supertest + 真实 schema 校验）：
1. `POST /api/auth/login` body 中 `password` 长度 101 → 400
2. `POST /api/candidates` body 中 `name` 长度 51 → 400
3. `GET /api/candidates?keyword=` keyword 长度 101 → 400（query）
4. `POST /api/jobs` body 中 `title` 长度 201 → 400
5. 正常长度（边界值）仍然通过

每个用例必须用 supertest 真实发送请求，断言 HTTP 400 + 错误信息包含"超出最大长度"或类似。

## 验收条件
> 注：v1.1 元规则 —— "X 行 / Y 文件"是软目标，允许 ±50% 偏差（前提是标准错误处理）。
1. ✅ `pnpm test` 全部通过，新测试 5 个全绿
2. ✅ `git diff --stat` 显示 routes/ 下文件普遍增加 1-3 行
3. ✅ 边界值测试通过：
   - 邮箱 254 字符 ✓
   - 邮箱 255 字符 ✗
4. ✅ `pnpm lint` 通过

## 完成后请输出
1. 修改文件总数（`git diff --stat | wc -l`）
2. 新增测试文件
3. 验收清单

## 实施备注（必填）

按 v1.1 元规则填写：
- 实际改动：[routes/ 下文件改动行数]
- 推荐方案预估：[N 个 z.string() → z.string().max(N) 替换]
- 偏差原因：[无 / 解释]
- 是否属于"标准做法的合理膨胀"：[是 / 否]
- 禁止事项勾选：
  - [✅/❌] 不修改 .min() 下限
  - [✅/❌] 不改 z.string() → z.coerce.string()
  - [✅/❌] 不动 passwordSchema
  - [✅/❌] 不触碰 enum 字段
  - [✅/❌] 不新增正则校验
  - [✅/❌] 不修改 Prisma schema
```

---

## 🎯 使用指南总结

### 推荐执行顺序
1. **PROMPT-01**（最简单，10 分钟）→ 建立信心
2. **PROMPT-02**（引入依赖，30 分钟）→ 基础设施
3. **PROMPT-03**（关键性能优化，1-2 小时）
4. **PROMPT-04**（纯重构，2-3 小时）
5. **PROMPT-05**（数据库迁移，最复杂，半天到一天）
6. **PROMPT-06**（批量改造，半天）

### 每个提示词的"打开方式"
1. **新开 Cursor Composer 对话**（避免上下文混乱）
2. **只粘贴一个提示词**（不要合并）
3. 等待 Cursor 输出 diff 后，**人工 review**：
   - 是否触犯"禁止事项"
   - 测试是否真的写完
4. **运行 `pnpm test`** 验证
5. **commit 时引用 DEBT 编号**：`fix: DEBT-xxx 修复 xxx`

### 失败应对
- 如果 Cursor 越界（改了不该改的文件）→ 立即 `git checkout -- <file>` + 重开会话
- 如果测试挂了 → 让 Cursor 先单独修测试，不要急着改业务代码
- 如果数据库 migration 失败 → 参考 PROMPT-05 的"回滚预案"

### 不要做的事
- ❌ 不要把 6 个提示词合并成一个会话（上下文会爆炸）
- ❌ 不要跳过测试只让 Cursor 改业务代码
- ❌ 不要在 PROMPT-05 没完成前开始 PROMPT-06（数据库变更需独立 commit）

---

> **生成时间**：基于项目 2026 年 4 月代码快照
> **约定**：每个提示词都是**自包含**的（自带 Context / 现有代码 / 验收条件），可独立使用
> **可演进**：完成 6 个提示词后，按相同模板继续生成阶段 1（可观测性）的提示词
