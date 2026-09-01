# F2-S 简历自动打分·服务端 执行提示词

## ⚠️ 强约束（最优先阅读）

1. 本切片为**纯服务端**切片：`client/**`、`e2e/**` 一行都不许动。
2. 文件预算 **16 个**（§6.1 逐一编号）；其中 9 个为既有文件的**条件修改**——必须最小化改动 + 中文注释说明，交付报告逐条列出。
3. 不跑验收命令（`pnpm test` / `build` / `lint` 都不跑，审核方重跑）；**允许且必须**执行 `npx prisma generate`（纯 codegen）；**禁止**执行 `prisma migrate dev/deploy/reset`（迁移只生成 SQL 文件，由人工 apply）。
4. 编码红线：禁整文件重写既有文件；新文件 UTF-8 无 BOM、LF 行尾、2 空格缩进、单引号、行尾分号（Prettier 惯例）；中文注释。
5. headless 无人工确认：先输出实施计划，然后直接动手。

## 1. 任务 ID + 目标

### 1.1 任务 ID
F2-S

### 1.2 任务目标
实现 PRD 阶段 5 的 F2「简历自动打分」服务端全链路：候选人关联职位后由 BullMQ 异步触发 AI 多维打分（也可手动补打），LLM 输出经服务端按字典权重**重算校验**后落库 `AiMatchScore`；JD 变更自动标记旧分过期；重复内容 hash 去重不重复调 LLM。需求全文见仓库根 `PRD_阶段5_AI招聘增强与HR考核_20260901.md` 第 3 章（必读）。

### 1.3 端点清单（新增 3 个）

| 方法 | 路径 | 说明 | 权限 |
|---|---|---|---|
| POST | `/api/candidates/:id/match-score` | 手动触发打分（body: `{ jobId }`），**同步**执行返回结果 | `authenticate` + `requireMatrixPermission('ai:match-score')` + 候选人可见性 |
| GET | `/api/candidates/:id/match-scores` | 候选人全部职位打分列表 | `authenticate` + 候选人可见性 |
| GET | `/api/jobs/:id/match-scores` | 职位下候选人打分列表（按 overallScore 降序） | `authenticate` + 职位部门可见 |

## 2. 上下文

### 2.1 项目位置
仓库根即项目根；后端在 `server/`（Express 4 + TS ESM + Prisma 5.22 + BullMQ）。路径别名 `@services/*` 等已配置（见 `server/tsconfig.json`），但既有代码多用相对路径 `../services/x`——**沿用相对路径风格**。

### 2.2 关键已核实事实（起草人已实读源码，可直接采信）

- **LLM 入口**：`server/src/lib/llm.ts` 导出 `callLLM(prompt: string, systemPrompt?: string)`，返回 `{ content, usage? }`；60s 超时；Prometheus 指标 `llmCallDuration` 的 `purpose` 标签目前硬编码 `'unknown'`。本切片需给 `callLLM` 增加**可选第三参数** `purpose: string = 'unknown'` 并传入 `startTimer` 标签（条件修改 llm.ts，向后兼容）。
- **JSON 解析惯例**：LLM 返回需剥离 ```` ```json ```` 围栏再 `JSON.parse`（参照 `ai-matcher.service.ts` 118-125 行与 `llm.ts` 130-138 行）。
- **队列**：`server/src/lib/queue.ts` 目前只有 `resumeParseQueue`（6 行文件）；worker 参照 `server/src/workers/resume-parser.worker.ts`；worker 在 `server/src/index.ts` 第 18 行以 `import './workers/resume-parser.worker';` 副作用方式启动——新 worker 同样加一行 import。
- **简历解析流程与打分触发点（反直觉，务必理解）**：上传简历的解析（`POST /api/candidates/parse-resume`）发生在**候选人创建之前**（解析结果由前端轮询回填表单），解析时没有 candidateId，**无法**在解析 worker 里触发打分。因此自动打分钩子在 `candidate.service.ts` 约 207-213 行：`createCandidate` 内 `data.jobIds` 非空时 `prisma.candidateJob.createMany(...)` 之后，对每个 jobId 投递打分任务（fire-and-forget，失败只记日志不阻塞创建）。动手前先 grep 确认 `candidateJob` 是否还有其他创建入口（如「为存量候选人关联职位」接口），若有同样挂钩子并在报告中列出。
- **可见性**：`candidate-visibility.service.ts` 导出 `scopeFromUser(user)` 与 `assertCandidateVisible(candidateId, scope)`（越权抛 `AppError('...', 403)`）；controller 里用 `scopeFromUser(req.user!)` 透传（参照 `candidate.controller.ts` 第 5、27 行）。
- **权限矩阵**：`server/src/services/role-permission.service.ts` 硬编码角色权限列表。新增权限点 `ai:match-score`：加入 `HR_PERMISSIONS` 与 `HIRING_MANAGER_PERMISSIONS`（admin 是 `'*'` 天然拥有；interviewer 不给——只能看分不能触发）。中间件 `requireMatrixPermission(code)` 来自 `../middleware/role`（用法参照 `routes/candidates.ts` 第 192 行）。
- **字典机制**：`dictionary.service.ts` 顶部 `DEFAULT_DICTIONARIES` 常量（`evaluation_dimension` 等分类），`getDictionaries(category)` 会在分类为空时自动初始化默认值（`ensureDefaults`）。**Dictionary 表无 weight 字段**（字段：category/code/name/sortOrder/enabled/description）——权重约定存 `description` 字段，纯数字字符串（如 `"40"`）；解析失败/缺失时按 0 处理并在所有维度权重和为 0 时回退为**等权**。新增 `matching_dimension` 默认 5 维（追加进 `DEFAULT_DICTIONARIES`，description 即权重）：
  专业技能匹配 40 / 工作经验与年限 25 / 学历与院校背景 15 / 职业稳定性 10 / 加分项（证书/行业背景）10。
- **操作日志**：直接 `prisma.operationLog.create({ data: { userId, targetType, targetId, action, detail } })`（参照 `candidate.service.ts` 第 149 行）。
- **AppError**：`import { AppError } from '../middleware/errorHandler'`。
- **Zod 校验**：路由文件内就地定义 schema，`validate(schema)` / `validate(schema, 'params')`（参照 `routes/candidates.ts`）。
- **路由挂载**：候选人两接口加进 `server/src/routes/candidates.ts`（注意注册在 `/:id` 这类参数路由**之前**）；职位接口加进 `server/src/routes/jobs.ts`。无需动 `routes/index.ts`。
- **测试范式**：单测 `vi.mock('../../src/lib/prisma', ...)` 手搓模型方法 mock（参照 `tests/unit/candidate.service.test.ts` 开头 60 行，含 `$transaction` 直通写法）；集成测试 supertest（参照 `tests/integration/role-middleware.test.ts`）。mock LLM 用 `vi.mock('../../src/lib/llm', ...)` 只导出有 `callLLM` 的 stub。

### 2.3 数据模型（新增 1 表，对 PRD §3.5 有一处最小扩展）

```prisma
model AiMatchScore {
  id            String   @id @default(cuid())
  candidateId   String
  jobId         String
  overallScore  Int
  grade         String
  summary       String?
  dimensions    Json
  risks         Json?
  highlights    Json?
  stale         Boolean  @default(false)
  model         String?
  promptVersion String   @default("v1")
  triggeredBy   String   // auto / manual
  createdById   String?
  resumeHash    String?  // ← 对 PRD 的最小扩展：hash 去重所需（PRD 3.6 成本控制要求，但模型漏了字段）
  jdHash        String?  // ← 同上
  createdAt     DateTime @default(now())
  updatedAt     DateTime @updatedAt

  candidate Candidate @relation(fields: [candidateId], references: [id], onDelete: Cascade)
  job       Job       @relation(fields: [jobId], references: [id], onDelete: Cascade)

  @@unique([candidateId, jobId])
  @@index([jobId, overallScore])
  @@map("ai_match_score")
}
```

`Candidate` 与 `Job` 模型各追加一行 relation 字段（`aiMatchScores AiMatchScore[]`），不动既有字段。

## 3. 必读约束

### 3.1 代码范式
参照 `server/src/services/ai-matcher.service.ts`（service 函数式导出 + AppError + scope 透传）与 `candidate.service.ts` 的 OperationLog 写法。

### 3.2 命名规范
文件 kebab-case；service 导出命名函数；日志 logger 用既有 `../lib/logger`（如 candidate.controller 所示）或 console 沿用同文件风格。

### 3.3 权限矩阵（本切片相关，已实读）

| 角色 | ai:match-score | 说明 |
|---|---|---|
| admin | ✅（`*`） | 全数据可见 |
| hr（含 member 归一化） | ✅ | 触发 + 查看 |
| hiring_manager | ✅ | 触发 + 查看（PRD 3.1 明确用人部门可看分） |
| interviewer | ❌ | 仅可通过两个 GET 查看（走可见性），不能触发 |

### 3.4 审计约定
打分成功/失败均写 OperationLog：`targetType: 'Candidate'`，`targetId: candidateId`，`action: 'ai_match_score'`，`detail` 含 `{ jobId, triggeredBy, overallScore?, grade?, error? }`。

## 4. 实施任务

### 4.1 `server/prisma/schema.prisma`（条件修改）
新增 `AiMatchScore` 模型（§2.3）+ `Candidate`/`Job` 各追加 relation 行。

### 4.2 `server/prisma/migrations/<timestamp>_add_ai_match_score/migration.sql`（新增）
手写迁移 SQL（参照 `server/prisma/migrations/` 既有目录的 SQL 风格；表名 `ai_match_score`，全部外键/索引/唯一约束齐备）。**只写文件，不执行任何 migrate 命令**。然后执行 `npx prisma generate` 更新 client 类型。

### 4.3 `server/src/lib/llm.ts`（条件修改）
`callLLM` 加可选第三参 `purpose: string = 'unknown'`，替换 `startTimer` 里硬编码的 `'unknown'`。加中文注释。其余不动。

### 4.4 `server/src/lib/queue.ts`（条件修改）
追加导出 `aiMatchScoreQueue`（队列名 `ai-match-score`，同连接）。

### 4.5 `server/src/services/match-score.service.ts`（新增，核心）
导出：
- `DEFAULT_MATCH_DIMENSIONS` 常量（5 维兜底，与字典默认值一致）。
- `GRADE_THRESHOLDS`：强烈推荐 ≥85 / 推荐 70-84 / 待定 50-69 / 不推荐 <50。
- `scoreCandidateForJob(candidateId, jobId, opts: { triggeredBy: 'auto'|'manual', createdById?: string })`：
  1. 查 candidate（含 skills/workYears/education/school/currentCompany/currentPosition/workHistories）与 job（title/level/type/description/requirements/skills）；任一不存在抛 AppError 404。
  2. 算 `resumeHash` = sha256(候选人关键字段 JSON)，`jdHash` = sha256(description + requirements)（node `crypto`）。
  3. **hash 去重**：已有同 candidate+job 记录且 resumeHash、jdHash 均相同 → 直接返回旧记录（不调 LLM），并写 OperationLog（detail 标 `deduped: true`）。
  4. 字典加载：`dictionaryService.getDictionaries('matching_dimension')`，取 enabled 项，权重 = `parseInt(description)`，失败/和为 0 回退等权；字典空回退 `DEFAULT_MATCH_DIMENSIONS`。
  5. 组装 prompt（JD 全文 + 简历结构化信息 + 维度含权重与出题指引），`callLLM(prompt, systemPrompt, 'match-score')`。
  6. 解析 JSON（剥围栏）；校验 dimensions 数组；**服务端重算** `overallScore = round(Σ score×weight / Σweight)`，不信任 LLM 给的综合分；`grade` 由重算分按 `GRADE_THRESHOLDS` 得出。LLM 输出缺维度时该维度按 0 计入并在 detail 记录。
  7. upsert `AiMatchScore`（`candidateId_jobId` 唯一键），写 `resumeHash/jdHash/model（从 LLM_CONFIG 推导或记录 env.LLM_PROVIDER）/promptVersion/triggeredBy/createdById`，`stale=false`。
  8. 成功/失败各写一条 OperationLog；失败抛 AppError 500「AI 打分失败，请稍后重试」（LLM 异常重试 1 次后仍失败才落失败）。
- `listCandidateMatchScores(candidateId, scope)`：`assertCandidateVisible` 后查全部打分（含 job 标题）。
- `listJobMatchScores(jobId, scope)`：按 overallScore 降序（含候选人姓名）；非 admin 且 scope.department 非空时校验 job.departments 包含该部门，否则 403（参照 job 相关既有校验惯例，先读 `job.service.ts` 确认）。

### 4.6 `server/src/workers/ai-match-score.worker.ts`（新增）
Worker 监听 `ai-match-score`，调 `scoreCandidateForJob(job.data.candidateId, job.data.jobId, { triggeredBy: 'auto', createdById: job.data.userId })`；失败仅 console.error + OperationLog（**绝不**让 worker 抛出影响其他任务；打分失败不阻塞任何主流程）。

### 4.7 `server/src/index.ts`（条件修改）
第 18 行后追加 `import './workers/ai-match-score.worker';`。

### 4.8 `server/src/services/candidate.service.ts`（条件修改）
`createCandidate` 的 `candidateJob.createMany` 之后：对每个 jobId `aiMatchScoreQueue.add('score', { candidateId, jobId, userId: createdById })`，try/catch 包裹只记日志（打分是增强功能，绝不能阻塞候选人创建）。若 grep 发现其他 candidateJob 创建入口，同法处理。所有改动处加中文注释。

### 4.9 `server/src/services/job.service.ts`（条件修改）
`updateJob`（约 302 行）内 description 或 requirements 实际变化时：`prisma.aiMatchScore.updateMany({ where: { jobId }, data: { stale: true } })`。加中文注释。不动其他逻辑。

### 4.10 `server/src/services/dictionary.service.ts`（条件修改）
`DEFAULT_DICTIONARIES` 追加 `matching_dimension` 5 项（code 用英文语义码，description 填权重数字字符串）。

### 4.11 `server/src/services/role-permission.service.ts`（条件修改）
`HR_PERMISSIONS`、`HIRING_MANAGER_PERMISSIONS` 各追加 `'ai:match-score'`。

### 4.12 `server/src/controllers/match-score.controller.ts`（新增）
三个 handler，薄壳：取参 → scopeFromUser → 调 service → 统一 `{ success, data }` 响应（参照既有 controller 风格）。POST 从 body 取 `jobId`。

### 4.13 `server/src/routes/candidates.ts`（条件修改）
新增两条路由（注册位置必须在 `/:id` 参数路由之前）：
- `POST /:id/match-score`：authenticate + requireMatrixPermission('ai:match-score') + validate（params: id；body: `{ jobId: z.string().min(1).max(50) }`）
- `GET /:id/match-scores`：authenticate + params 校验

### 4.14 `server/src/routes/jobs.ts`（条件修改）
新增 `GET /:id/match-scores`：authenticate + params 校验（同样注意注册顺序）。

### 4.15 `server/tests/unit/match-score.service.test.ts`（新增）
mock prisma（含 aiMatchScore/dictionary/candidate/job/operationLog 模型）与 `../../src/lib/llm`。覆盖至少：服务端重算纠正 LLM 错误综合分、四档 grade 边界（85/70/50）、hash 去重跳过 LLM、字典空回退默认维度、权重解析失败回退等权、LLM 两次失败落 AppError、upsert 幂等。

### 4.16 `server/tests/integration/match-score.test.ts`（新增）
supertest 覆盖 3 接口：正常路径、无 token 401、越权 403（参照 `tests/integration/role-middleware.test.ts` 的 app 构建与 mock 方式）。

## 5. 关键决策点

### 5.1 手动触发 = 同步执行
PRD 允许同步或异步。本切片 POST 接口**同步**调 service 返回完整打分结果（前端 loading 等待），不走队列——实现简单、结果立得；自动触发才走 BullMQ。不要自作主张改成异步 + 通知（站内通知属后续增强）。

### 5.2 权重存 description
Dictionary 表无 weight 列（已实读确认）。权重写 description 纯数字字符串；不要为加 weight 列去改 Dictionary 模型（影响面太大，留给用户拍板）。

### 5.3 简历内容来源
打分输入用**数据库里的结构化字段**（解析流程已回填），不读简历原始文件、不重新调简历解析。

### 5.4 执行器环境特注
headless；`npx prisma generate` 必须成功（否则 tsc 会报 AiMatchScore 类型缺失，审核必挂）；除 generate 外不执行任何 prisma 命令。

### 5.5 不做清单
- 不做前端（F2-C 切片负责）
- 不做打分完成的站内通知
- 不做历史版本保留（upsert 覆盖即可）
- 不做按职位类型差异化维度（PRD 开放问题，v1 全局一套）
- 不改 `ai-matcher.service.ts` 既有推荐接口（保留兼容）
- 不 git commit、不跑验收命令

## 6. 修改文件清单

### 6.1 必改文件（16 个；✱=新增，其余为条件修改）
1. `server/prisma/schema.prisma`
2. ✱ `server/prisma/migrations/<timestamp>_add_ai_match_score/migration.sql`
3. `server/src/lib/llm.ts`
4. `server/src/lib/queue.ts`
5. ✱ `server/src/workers/ai-match-score.worker.ts`
6. `server/src/index.ts`
7. ✱ `server/src/services/match-score.service.ts`
8. ✱ `server/src/controllers/match-score.controller.ts`
9. `server/src/routes/candidates.ts`
10. `server/src/routes/jobs.ts`
11. `server/src/services/candidate.service.ts`
12. `server/src/services/job.service.ts`
13. `server/src/services/dictionary.service.ts`
14. `server/src/services/role-permission.service.ts`
15. ✱ `server/tests/unit/match-score.service.test.ts`
16. ✱ `server/tests/integration/match-score.test.ts`

### 6.2 禁止修改文件
清单以外一切；特别地：`client/**`、`e2e/**`、任何 package.json、`ai-matcher.service.ts`、`resume-parser.worker.ts`、`.eslintrc.cjs`、tsconfig。`npx prisma generate` 产生的 `node_modules` 变更不算改动。

### 6.3 越界检测（交付前自检）
- `git status --short` 只允许出现 6.1 的 16 个路径（migration 目录算 1 个）。
- `git diff --stat -- client e2e` 必须 0 行。

## 7. 验收标准

### 7.1 硬性验收（审核方执行，你不跑；仅供了解通过线）
- `server pnpm build`（tsc）：0 错误。
- `server pnpm test`：基线 44 文件 / 427 用例全过 + 新增 2 个测试文件全过（用例数 ≥ 427+15）。
- `server pnpm lint:check`：不新增 error（存量基线 17682e/210w；新增代码自身 0 error 0 warning 目标）。
- git status 仅 16 个预算文件；无 BOM。

### 7.2 交付报告模板（最终回复必须完整包含）
1. 完成范围概述
2. 16 个文件逐个说明（新增文件写职责；条件修改文件**逐处**列 before→after 摘要）
3. 反直觉点处理确认（解析无 candidateId 的触发点选择、权重存 description、手动同步、重算不信任 LLM）
4. grep 确认 candidateJob 全部创建入口的结果
5. migration SQL 全文（供人工 review 后 apply）
6. 越界自检（git status 全文）
7. 已知问题与遗留风险
8. 红线自检确认

按本提示词直接执行（headless 环境无人工确认环节）：先输出实施计划，然后动手，最终回复给出完整交付报告。
