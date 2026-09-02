# F3-S 面试大纲·服务端 执行提示词

## ⚠️ 强约束（最优先阅读）

1. 本切片为**纯服务端**切片：`client/**`、`e2e/**` 一行都不许动。
2. 文件预算 **10 个**（§6.1 逐一编号）；其中 6 个为既有文件的**条件修改**——必须最小化改动 + 中文注释说明，交付报告逐条列出。
3. 不跑验收命令（`pnpm test` / `build` / `lint` 都不跑，审核方重跑）；**允许且必须**执行 `npx prisma generate`（纯 codegen）；**禁止**执行 `prisma migrate dev/deploy/reset`（迁移只生成 SQL 文件，由人工 apply）。
4. 编码红线：禁整文件重写既有文件；新文件 UTF-8 无 BOM、LF 行尾、2 空格缩进、单引号、行尾分号（Prettier 惯例）；中文注释。
5. headless 无人工确认：先输出实施计划，然后直接动手。

## 1. 任务 ID + 目标

### 1.1 任务 ID
F3-S

### 1.2 任务目标
实现 PRD 阶段 5 的 F3「面试问题一键生成」服务端全链路：面试官/HR 在面试记录上一键生成按**考察方向**差异化的面试问题大纲（含参考答案），LLM 输出经服务端结构校验后落库 `InterviewQuestionOutline`（版本化，上限 10 版）；支持指令式整体再生成（adjustNote）与手动微调定稿（不调 LLM）；面试创建/编辑支持 `focusType` 字段。需求全文见仓库根 `PRD_阶段5_AI招聘增强与HR考核_20260901.md` 第 5 章（必读，含 5.3 出题侧重表与 5.5 数据模型原文）。

### 1.3 端点清单（新增 3 个）

| 方法 | 路径 | 说明 | 权限 |
|---|---|---|---|
| POST | `/api/interviews/:id/question-outline` | 生成/再生成大纲，body: `{ focusType, adjustNote? }`，focusType 必填，**同步**返回新版本 | `authenticate` + `requireMatrixPermission('ai:interview-outline')` + service 层精细校验 |
| GET | `/api/interviews/:id/question-outlines` | 版本列表（version 降序） | `authenticate` + 同上权限点 + service 层精细校验 |
| PATCH | `/api/interviews/:id/question-outline/:version` | 手动微调定稿（body: `{ outline }`），**不调 LLM** | 同 POST |

另外：`POST /api/interviews` 与 `PATCH /api/interviews/:id` 的 zod schema 增加可选 `focusType` 字段（条件修改既有路由文件）。

## 2. 上下文

### 2.1 项目位置
仓库根即项目根；后端在 `server/`（Express 4 + TS ESM + Prisma 5.22）。既有代码多用相对路径 `../services/x`——**沿用相对路径风格**。

### 2.2 关键已核实事实（起草人已实读源码，可直接采信）

- **LLM 入口**：`server/src/lib/llm.ts` 导出 `callLLM(prompt, systemPrompt?, purpose = 'unknown')`（purpose 第三参是 F2-S 加的，已存在，直接用）。本切片 purpose 传 `'interview-outline'`。
- **JSON 解析惯例**：LLM 返回需剥离 ```` ```json ```` 围栏再 `JSON.parse`（参照 `match-score.service.ts` 或 `ai-matcher.service.ts` 118-125 行）。**解析失败或结构校验不合格各重试 1 次**（与 F1-S jd-assist 一致的重试惯例）。
- **Interview 模型**（`server/prisma/schema.prisma` 356 行起）：`round`（初试/复试/终面，轮次）、`type`（电话/视频/现场，形式）、`interviewers Json`（`[{id, name}]`，id 即用户 id）、`scheduledAt`、`duration`、`status`（InterviewStatus 枚举）、`createdById`；已有 relation 字段 `evaluations InterviewEvaluation[]`（384 行附近，加在 `updatedAt` 之后）。本切片追加 `focusType String?` 与 `questionOutlines InterviewQuestionOutline[]`。
- **InterviewFeedback**（328 行起）：`candidateId + round + interviewerName + conclusion + feedbackContent`（富文本，取纯文本摘要即可）。
- **InterviewEvaluation**（393 行起）：`interviewId + interviewerId + dimensions Json? + overallScore Int? + conclusion String? + submittedAt DateTime?`（null=待填写，只取已提交的）。
- **路由文件** `server/src/routes/interviews.ts`：`createInterviewSchema`（12 行起）与 `updateInterviewSchema`（38 行起）zod 就地定义；已有路由顺序：`POST /`、`GET /`、`GET /conflicts`、`GET /:id`、`GET /:id/evaluations`、`PATCH /:id`、`POST /:id/cancel`、`POST /:id/complete`。新路由注册在 `GET /conflicts` 之后、`GET /:id` 之前更稳妥（`/:id/question-outline` 与 `/:id` 不冲突，但保持「静态段优先」惯例）。params 校验惯例：`z.string().max(50).cuid('无效的面试ID')`。
- **service** `interview-scheduler.service.ts`：`CreateInterviewInput`（26 行起）/`UpdateInterviewInput`（39 行起）两个 interface 各加 `focusType?: string`；`createInterview`/`updateInterview` 透传入库（动手前先读这两个函数现状，最小改动）。该文件已 import `assertCandidateVisible`（第 9 行）可直接参照。
- **可见性**：`candidate-visibility.service.ts` 导出 `scopeFromUser(user)` 与 `assertCandidateVisible(candidateId, scope)`（越权抛 AppError 403）。面试的候选人可见性 = 对 `interview.candidateId` 调 `assertCandidateVisible`。
- **权限矩阵**：`server/src/services/role-permission.service.ts` 硬编码 `HR_PERMISSIONS`（5 行起，已有 `'ai:match-score'`、`'ai:jd-assist'`）/`HIRING_MANAGER_PERMISSIONS`/`INTERVIEWER_PERMISSIONS`。中间件 `requireMatrixPermission(code)` 来自 `../middleware/role`（用法参照 `routes/candidates.ts` 第 192 行附近）。
- **字典机制**：`dictionary.service.ts` 顶部 `DEFAULT_DICTIONARIES` 常量按 category 分组（`{ code, name, sortOrder, description? }`），`getDictionaries(category)` 在分类为空时自动初始化默认值（`ensureDefaults`）。本切片追加 `interview_focus_type` 分类 5 项（§4.7）。
- **操作日志**：`prisma.operationLog.create({ data: { userId, targetType, targetId, action, detail } })`。
- **AppError**：`import { AppError } from '../middleware/errorHandler'`。
- **迁移目录命名**：`server/prisma/migrations/YYYYMMDDHHMMSS_<name>/migration.sql`。本切片用 `20260902000000_add_interview_question_outline`（目录已有同名前缀 `20260901000000_*` 两个并存，不冲突）。只写 SQL 文件 + `npx prisma generate`。
- **测试范式**：单测 `vi.mock('../../src/lib/prisma', ...)` 手搓模型方法 mock（参照 `tests/unit/candidate.service.test.ts` 开头 60 行）；mock LLM 用 `vi.mock('../../src/lib/llm', ...)`。集成测试 supertest，`x-test-role` 头注入角色（admin/hr/hiring_manager/interviewer），`x-test-role: 'none'` 哨兵模拟 401；假 ID 必须用合法 cuid 格式（c 开头 + 24 位小写字母数字），否则路由 cuid 校验 400（参照 `tests/integration/match-score.test.ts`）。
- **AiMatchScore 表已存在**（F2-S 已建，`candidateId + jobId` 唯一）：大纲输入组装时可查 `prisma.aiMatchScore.findUnique({ where: { candidateId_jobId } })` 取 `overallScore/grade/summary`，查不到就跳过（可选输入，不为它报错）。

### 2.3 数据模型（新增 1 表 + Interview 加 1 字段 + 1 字典）

```prisma
model InterviewQuestionOutline {
  id          String   @id @default(cuid())
  interviewId String
  version     Int
  focusType   String   // 本版大纲使用的考察方向（快照，不随面试记录变更）
  outline     Json     // { sections: [{ theme, questions: [{ question, intent, referenceAnswer, followUp? }] }], durationAdvice? }
  adjustNote  String?  // 本版本的调整指令（v1 为 null）
  editedById  String?  // 手动微调人（PATCH 定稿时记录）
  createdById String
  createdAt   DateTime @default(now())

  interview Interview @relation(fields: [interviewId], references: [id], onDelete: Cascade)

  @@unique([interviewId, version])
  @@map("interview_question_outline")
}
```

`Interview` 模型追加：`focusType String?`（可空兼容存量）+ relation 行 `questionOutlines InterviewQuestionOutline[]`。

## 3. 必读约束

### 3.1 代码范式
参照 `server/src/services/match-score.service.ts`（LLM 调用 + 结构校验 + 重试 + OperationLog + AppError，F2-S 产物，先读它再动手）与 `interview-evaluation.service.ts`（面试官身份校验惯例）。

### 3.2 权限矩阵（本切片新增权限点 `ai:interview-outline`）

| 角色 | 权限点 | service 层精细规则 |
|---|---|---|
| admin | ✅（`*`） | 全部面试可生成/查看/定稿 |
| hr | ✅ | 候选人可见性校验通过即可（`assertCandidateVisible`） |
| hiring_manager | ✅ | 必须是该场面试 `interviewers` 中的一员（按 id 比对），否则 403 |
| interviewer | ✅ | 同 hiring_manager：必须是该场面试官 |

设计理由：PRD 5.5 写「权限：该场面试的面试官 + HR + admin」。hiring_manager 作为面试官参场时应可用，所以权限点给三个角色，精细规则在 service 层收敛。

### 3.3 审计约定
生成成功/失败均写 OperationLog：`targetType: 'Interview'`，`targetId: interviewId`，`action: 'ai_question_outline'`，`detail` 含 `{ version?, focusType, adjustNote?, error? }`。手动定稿（PATCH）写 `action: 'question_outline_edit'`，detail 含 `{ version, editedById }`。

## 4. 实施任务

### 4.1 `server/prisma/schema.prisma`（条件修改）
- `Interview` 模型加 `focusType String?`（放 `notes` 之后，加中文注释「考察方向：字典 interview_focus_type，可空兼容存量」）与 `questionOutlines InterviewQuestionOutline[]`（放 `evaluations` 旁）。
- 新增 `InterviewQuestionOutline` 模型（§2.3，放 `InterviewEvaluation` 模型之后，加表头中文注释）。

### 4.2 `server/prisma/migrations/20260902000000_add_interview_question_outline/migration.sql`（新增）
手写迁移 SQL（参照 `20260901000000_add_ai_match_score/migration.sql` 的风格）：`ALTER TABLE "interview" ADD COLUMN "focusType" TEXT;` + 建表 `interview_question_outline`（全部外键/唯一约束/索引齐备，外键 `ON DELETE CASCADE`）。**只写文件，不执行任何 migrate 命令**。然后执行 `npx prisma generate`。

### 4.3 `server/src/services/interview-outline.service.ts`（新增，核心）
导出：
- `FOCUS_TYPE_GUIDANCE` 常量：PRD 5.3 出题侧重表内置为 prompt 指引（HR 面→求职动机/职业稳定性/薪资期望/文化匹配/离职原因；技术面→专业技能深度/项目技术细节/问题解决思路/行业体系标准实操如 GJB9001C；综合面→项目复盘/抗压应变/跨部门协作/职业规划；主管面→管理思维/目标拆解/团队匹配/价值观；交叉面→协作场景/沟通风格/上下游配合）。字典里没有的新方向（admin 自定义）不设指引，prompt 里写「按方向名称自行把握侧重」。
- `MAX_OUTLINE_VERSIONS = 10`。
- `generateOutline(interviewId, input: { focusType: string; adjustNote?: string }, user)`：
  1. 查 interview（含 candidate、job）；不存在 404。
  2. 权限精细校验（§3.2）：admin 直通；hr 走 `assertCandidateVisible`；hiring_manager/interviewer 校验 `interviewers` 数组成员身份（`Array<{id,name}>`，按 id 比对），不满足抛 403。
  3. `focusType` 必填且必须是字典 `interview_focus_type` 中 enabled 项，否则 400（错误信息列出可选项）。
  4. **版本上限**：已有版本数 ≥ 10 → AppError 400「版本数已达上限（10），无法继续生成」。
  5. **输入组装**（全部中文 prompt）：
     - JD：job.title/level/type/description/requirements（jobId 可空，空则注明「未关联职位」）
     - 简历：candidate 结构化字段（skills/workYears/education/school/currentCompany/currentPosition/workHistories）
     - 本轮信息：round（第几轮）+ type（面试形式）+ duration
     - 前几轮反馈：同 candidateId 的其他面试中 `scheduledAt` 早于本场的，取其已提交 InterviewEvaluation 的 `conclusion + overallScore + dimensions` 摘要；另查该候选人 `InterviewFeedback`（取 conclusion + feedbackContent 纯文本截断 500 字）。没有则注明「首轮面试，无历史反馈」。prompt 中要求 AI 承接历史反馈、避免重复提问。
     - AiMatchScore（可选）：candidateId+jobId 查到则附 `overallScore/grade/summary`。
     - 考察方向 + 对应 `FOCUS_TYPE_GUIDANCE` 指引。
     - `adjustNote` 非空时：附上一版 outline JSON + 调整指令，要求整体再生成。
  6. `callLLM(prompt, systemPrompt, 'interview-outline')`；解析 JSON（剥围栏）→ **服务端结构校验**：`sections` 为非空数组、每项含 `theme` 与非空 `questions`、每个 question 含 `question/intent/referenceAnswer` 字符串。解析失败或结构不合格各重试 1 次，仍失败写 OperationLog 失败记录并抛 AppError 500「AI 大纲生成失败，请稍后重试」。
  7. 落库新版本：`version = max(version) + 1`，`focusType` 快照、`adjustNote`、`createdById = user.id`。成功后写 OperationLog。
  8. 返回新版本完整记录。
- `listOutlines(interviewId, user)`：同 §3.2 精细校验后按 version 降序返回（含创建人姓名，join User 或单独查）。
- `finalizeOutline(interviewId, version, outline, user)`：同 §3.2 精细校验；**服务端校验 outline 结构**（同生成时的校验规则，不合格 400）；更新该版本 `outline` 与 `editedById = user.id`；**不调 LLM**；写 OperationLog（`question_outline_edit`）。版本不存在 404。

### 4.4 `server/src/controllers/interview-outline.controller.ts`（新增）
三个 handler，薄壳：取参 → 调 service（传 `req.user!`）→ 统一 `{ success, data }` 响应（参照 `match-score.controller.ts` 风格）。

### 4.5 `server/src/routes/interviews.ts`（条件修改）
- `createInterviewSchema` / `updateInterviewSchema` 各加 `focusType: z.string().max(50).optional()`（字典有效性由 service 层校验，zod 只做格式约束——zod 无法异步查字典，交付报告里说明这一点）。
- 新增 3 条路由（注册在 `GET /conflicts` 之后、`GET /:id` 之前）：
  - `POST /:id/question-outline`：authenticate + requireMatrixPermission('ai:interview-outline') + validateAll({ params: interviewIdSchema, body: z.object({ focusType: z.string().min(1).max(50), adjustNote: z.string().max(1000).optional() }) })
  - `GET /:id/question-outlines`：authenticate + requireMatrixPermission + params 校验
  - `PATCH /:id/question-outline/:version`：authenticate + requireMatrixPermission + validateAll({ params: z.object({ id: cuid, version: z.coerce.number().int().min(1) }), body: z.object({ outline: z.record(z.unknown()) }) })
- controller 引用 `interviewOutlineController`。

### 4.6 `server/src/services/interview-scheduler.service.ts`（条件修改）
`CreateInterviewInput` / `UpdateInterviewInput` 各加 `focusType?: string`；`createInterview` / `updateInterview` 中透传 `focusType` 入库（若提供了 focusType，先查字典 `interview_focus_type` enabled 项校验，无效抛 AppError 400——可抽一个小的共享校验函数放 interview-outline.service 里导出复用，避免重复）。所有改动处加中文注释。

### 4.7 `server/src/services/dictionary.service.ts`（条件修改）
`DEFAULT_DICTIONARIES` 追加 `interview_focus_type` 5 项（不带 description——侧重指引在 prompt 常量里）：
`hr` HR面 1 / `tech` 技术面 2 / `comprehensive` 综合面 3 / `manager` 主管面 4 / `cross` 交叉面 5。

### 4.8 `server/src/services/role-permission.service.ts`（条件修改）
`HR_PERMISSIONS`、`HIRING_MANAGER_PERMISSIONS`、`INTERVIEWER_PERMISSIONS` 各追加 `'ai:interview-outline'`。

### 4.9 `server/tests/unit/interview-outline.service.test.ts`（新增）
mock prisma（interview/interviewQuestionOutline/interviewEvaluation/interviewFeedback/aiMatchScore/dictionary/operationLog/candidate/job 相关模型方法）与 `../../src/lib/llm`。覆盖至少：
- 正常生成 v1（校验落库字段：version=1、focusType 快照、adjustNote=null）
- 带 adjustNote 再生成 v2（prompt 中包含上一版内容与调整指令——可通过 callLLM mock 的调用参数断言）
- focusType 非字典 enabled 项 → 400
- 版本达 10 → 400
- interviewer 非该场面试官 → 403；是该场面试官 → 放行
- LLM 输出结构不合格重试 1 次后仍失败 → AppError 500 + OperationLog 失败记录
- finalizeOutline 手动定稿：结构不合格 400；成功时不调 LLM（断言 callLLM 未被调用）且写 editedById
- 前几轮反馈组装：有历史评估/反馈时 prompt 含其结论（断言 prompt 字符串包含关键内容）

### 4.10 `server/tests/integration/interview-outline.test.ts`（新增）
supertest 覆盖 3 新接口 + 创建/编辑面试带 focusType：正常路径、无 token 401（`x-test-role: 'none'`）、无权限角色越权 403、假 ID 用合法 cuid 格式（参照 `tests/integration/match-score.test.ts` 的 app 构建与 mock 方式）。

## 5. 关键决策点

### 5.1 生成 = 同步执行
与 F2-S 手动打分一致：POST 同步调 LLM 返回完整新版本（前端 loading 锁防重复点击由 F3-C 负责）。不走队列、不做站内通知。

### 5.2 出题侧重不放字典
PRD 5.3 明确：字典只配方向「名称与启停用」，侧重指引写死在 prompt 常量（`FOCUS_TYPE_GUIDANCE`）。admin 新增自定义方向时 prompt 写「按方向名称自行把握侧重」。不要把侧重塞进字典 description。

### 5.3 zod 不校验字典值
创建/编辑面试的 `focusType` 在 zod 只做 `string().max(50)`，字典有效性在 service 层校验（zod 无法异步查库）。生成接口的 focusType 必须严格校验字典 enabled 项。

### 5.4 不做清单
- 不做前端（F3-C 切片负责：生成按钮、版本历史、参考答案折叠、评估页对照、表单加考察方向）
- 不做版本「回退」专用接口（查看旧版 + 手动定稿已覆盖回退语义）
- 不做生成完成的站内通知
- 不做英文题目支持（PRD 开放问题，默认不需要）
- 不 git commit、不跑验收命令

### 5.5 执行器环境特注
headless；`npx prisma generate` 必须成功（否则 tsc 会报 InterviewQuestionOutline 类型缺失，审核必挂）；除 generate 外不执行任何 prisma 命令。

## 6. 修改文件清单

### 6.1 必改文件（10 个；✱=新增，其余为条件修改）
1. `server/prisma/schema.prisma`
2. ✱ `server/prisma/migrations/20260902000000_add_interview_question_outline/migration.sql`
3. ✱ `server/src/services/interview-outline.service.ts`
4. ✱ `server/src/controllers/interview-outline.controller.ts`
5. `server/src/routes/interviews.ts`
6. `server/src/services/interview-scheduler.service.ts`
7. `server/src/services/dictionary.service.ts`
8. `server/src/services/role-permission.service.ts`
9. ✱ `server/tests/unit/interview-outline.service.test.ts`
10. ✱ `server/tests/integration/interview-outline.test.ts`

### 6.2 禁止修改文件
清单以外一切；特别地：`client/**`、`e2e/**`、任何 package.json、`interview.controller.ts`、`interview-evaluation.service.ts`、`match-score.service.ts`、`.eslintrc.cjs`、tsconfig。`npx prisma generate` 产生的 `node_modules` 变更不算改动。

### 6.3 越界检测（交付前自检）
- `git status --short` 只允许出现 6.1 的 10 个路径（migration 目录算 1 个）。
- `git diff --stat -- client e2e` 必须 0 行。

## 7. 验收标准

### 7.1 硬性验收（审核方执行，你不跑；仅供了解通过线）
- `server pnpm build`（tsc）：0 错误。
- `server pnpm test`：基线 48 文件 / 465 用例全过 + 新增 2 个测试文件全过（用例数 ≥ 465+20）。
- `server pnpm lint:check`：不新增 error（存量基线 17984e/221w；增量只许是 import/extensions、no-restricted-syntax、no-await-in-loop 等存量规则类，新文件 <63 错/文件）。
- git status 仅 10 个预算文件；无 BOM。

### 7.2 交付报告模板（最终回复必须完整包含）
1. 完成范围概述
2. 10 个文件逐个说明（新增文件写职责；条件修改文件**逐处**列 before→after 摘要）
3. 反直觉点处理确认（出题侧重放 prompt 常量而非字典、zod 不校验字典值的原因、手动定稿不调 LLM、版本快照语义）
4. 权限精细校验实现说明（§3.2 四角色矩阵如何落地）
5. migration SQL 全文（供人工 review 后 apply）
6. 越界自检（git status 全文）
7. 已知问题与遗留风险
8. 红线自检确认

按本提示词直接执行（headless 环境无人工确认环节）：先输出实施计划，然后动手，最终回复给出完整交付报告。
