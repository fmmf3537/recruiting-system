# F5-S 猎头推荐通道·服务端 执行提示词

## ⚠️ 强约束（最优先阅读）

1. 本切片为**纯服务端**切片：`client/**`、`e2e/**` 一行都不许动。
2. 文件预算 **15 个**（§6.1 逐一编号）；其中 5 个为既有文件的**条件修改**——必须最小化改动 + 中文注释说明，交付报告逐条列出。
3. 不跑验收命令（`pnpm test` / `build` / `lint` 都不跑，审核方重跑）；**允许且必须**执行 `npx prisma generate`（纯 codegen）；**禁止**执行 `prisma migrate dev/deploy/reset`（迁移只生成 SQL 文件，由人工 apply）。
4. 编码红线：禁整文件重写既有文件；新文件 UTF-8 无 BOM、LF 行尾、2 空格缩进、单引号、行尾分号（Prettier 惯例）；中文注释。
5. headless 无人工确认：先输出实施计划，然后直接动手。
6. **本切片含系统首个无鉴权写接口**，§3.3 安全红线是从人工安全复核简报继承的硬性要求，一条都不许打折扣。复核简报全文见 `docs/F5-S-安全复核简报.md`（必读）。

## 1. 任务 ID + 目标

### 1.1 任务 ID
F5-S

### 1.2 任务目标
实现 PRD 阶段 5 的 F5「猎头推荐通道」服务端：HR 维护猎头机构并生成推荐链接（可绑职位、默认 90 天有效期、可停用）；猎头通过公开链接免登录查看落地页信息并提交推荐（表单 + 简历文件），系统自动创建候选人（source=猎头:机构名）、触发简历解析、站内通知链接创建人；疑似重复仅内部标记不回显。需求全文见 `PRD_阶段5_AI招聘增强与HR考核_20260901.md` 第 7 章（必读）。

### 1.3 端点清单（新增 8 个，仅 2 个公开）

| 方法 | 路径 | 说明 | 权限 |
|---|---|---|---|
| POST | `/api/agencies` | 新增机构 | authenticate + requireMatrixPermission('agency:manage') |
| PATCH | `/api/agencies/:id` | 编辑机构（含启停用） | 同上 |
| GET | `/api/agencies` | 机构列表（含链接数/推荐数） | 同上 |
| POST | `/api/agencies/:id/links` | 生成推荐链接 | 同上 |
| DELETE | `/api/agencies/links/:linkId` | 停用链接（置 disabledAt，不物理删） | 同上 |
| GET | `/api/agencies/:id/stats` | 机构转化漏斗 | 同上 |
| GET | `/api/referral/:token` | **公开**：落地页信息（机构名 + 职位名） | 无鉴权 + referralPageLimiter |
| POST | `/api/referral/:token` | **公开**：提交推荐（multer + 表单） | 无鉴权 + referralLimiter |

## 2. 上下文

### 2.1 项目位置
仓库根即项目根；后端在 `server/`。既有代码多用相对路径 `../services/x`——沿用。

### 2.2 关键已核实事实（起草人已实读源码，可直接采信）

- **上传处理范式**：`server/src/routes/upload.ts` 的 `processUploadedFile`（50-75 行）：multer diskStorage 先存 `{uuid}.tmp` → `validateAndRenameUpload(file.path, uploadDir, file.mimetype)`（magic bytes + 白名单 + UUID 重命名，来自 `../utils/upload-file`）→ `createUploadRecord`（来自 `../services/file.service`）→ `buildFileApiPath(filename)` 生成 URL。`uploadDir = path.resolve(process.cwd(), env.UPLOAD_DIR)`；multer limits 用 `env.MAX_FILE_SIZE`。**公开提交必须复用同一链路**，uploadedById 记链接创建人。
- **限流范式**：`server/src/middleware/rate-limit.ts` 已有 feishuLimiter 等（express-rate-limit，standardHeaders: true）。`app.ts:65` 已配 `trust proxy=1`，按真实客户端 IP 聚桶。本切片在此文件追加两个限流器。
- **简历解析**：`server/src/workers/resume-parser.worker.ts` 监听 `resume-parse` 队列，job.data = `{ filePath, mimetype, userId }`，解析后**删除临时文件**（注意：本切片传入的是正式存储的简历，**不能删**——见 §4.8）。解析核心 `parseResume(buf, mimetype)` 在 `server/src/services/resume-parser.service.ts`（52 行起，返回结构化结果，动手前先读返回结构）。队列：`resumeParseQueue` 来自 `../lib/queue`。
- **候选人创建**：`candidate.service.ts` 的 `createCandidate(data: CreateCandidateInput, createdById, scope?)`（168 行起）内部已做查重（`checkDuplicate(phone, email, undefined, scope)` 返回 `{ duplicates, hasHiddenDuplicate }`）。`CreateCandidateInput`（38 行起）含 consentAt/consentNote。**反直觉点 1**：`createCandidate` 传 `jobIds` 会触发 F2-S 的 AI 自动打分钩子——按人工复核决定 A1，猎头候选人**不打分**，所以本切片调 `createCandidate` 时**不传 jobIds**，绑职位时由 referral.service 直接 `prisma.candidateJob.create(...)` 绕过钩子。
- **Candidate.email 必填（schema）但 PRD 表单邮箱选填**：反直觉点 2——邮箱为空时存 `''` 空串，且**查重跳过邮箱维度**（空串会在 `isEmailUsed` 里互相误伤）。展示侧「—」由前端处理，服务端不管。
- **通知**：`notification.service.ts` 的 `createNotification({ recipientId, title, content, type, businessId?, businessType? })`。type 是自由字符串，本切片用 `'agency_referral'`，businessType `'candidate'`。
- **权限矩阵**：`role-permission.service.ts` 的 `HR_PERMISSIONS` 追加 `'agency:manage'`（admin 是 `'*'` 天然拥有；hiring_manager/interviewer 不给）。中间件 `requireMatrixPermission(code)` 来自 `../middleware/role`。
- **路由挂载**：`server/src/routes/index.ts`（39-63 行一串 `router.use`）追加两行挂载 agencies 与 referral。公开路由文件内部**不加** authenticate 中间件。
- **AppError**：`import { AppError } from '../middleware/errorHandler'`；asyncHandler 同在 errorHandler。
- **迁移目录命名**：`server/prisma/migrations/YYYYMMDDHHMMSS_<name>/`，本切片用 `20260902130000_add_agency_referral`。只写 SQL + `npx prisma generate`。
- **测试范式**：单测 `vi.mock('../../src/lib/prisma', ...)`（参照 `tests/unit/interview-outline.service.test.ts`）；集成测试 supertest + `x-test-role` 头（参照 `tests/integration/interview-outline.test.ts`，含 prisma/queue/redis/auth 的 mock 全套写法——注意**公开接口的测试不需要 x-test-role 头**，它根本不过 authenticate）。假 ID 用合法 cuid 格式。
- **操作日志**：`prisma.operationLog.create({ data: { userId, targetType, targetId, action, detail } })`。

### 2.3 数据模型（新增 2 表，与 PRD §7.4 一致）

```prisma
model Agency {
  id          String   @id @default(cuid())
  name        String   @unique
  contact     String?
  phone       String?
  enabled     Boolean  @default(true) // 停用后其所有链接失效（级联判断，不改链接行）
  remark      String?
  createdById String
  createdAt   DateTime @default(now())
  links       AgencyLink[]
  @@map("agency")
}

model AgencyLink {
  id          String    @id @default(cuid())
  agencyId    String
  agency      Agency    @relation(fields: [agencyId], references: [id])
  token       String    @unique   // crypto.randomBytes(16).toString('hex')，32 位 hex
  jobId       String?
  job         Job?      @relation(fields: [jobId], references: [id], onDelete: SetNull)
  expiresAt   DateTime?           // 空 = 长期有效；人工复核决定 D：创建默认 90 天
  disabledAt  DateTime?           // 一键停用（软停用，不物理删）
  createdById String              // 生成链接的 HR，推荐候选人归属到 TA
  createdAt   DateTime  @default(now())
  @@map("agency_link")
}
```

`Job` 模型追加 relation 行 `agencyLinks AgencyLink[]`（不动既有字段）。

## 3. 必读约束

### 3.1 人工复核已拍板的 4 个决策（写死，不许偏离）
- **A1**：猎头来源候选人**不自动 AI 打分**（绕过 createCandidate 的 jobIds 钩子，见 §2.2 反直觉点 1）
- **B1**：公开提交成功只回显固定文案「已提交，将由 HR 联系候选人」，不回显候选人 ID、不回显是否疑似重复
- **C**：授权勾选必填，`consentNote` 写 `猎头机构（{机构名}）承诺已获候选人授权`，`consentAt` 写当前时间
- **D**：生成链接默认有效期 **90 天**（body 可显式传 expiresAt 覆盖，传 null 则长期有效）

### 3.2 代码范式
参照 `match-score.service.ts`（service 函数式导出 + AppError）与 `routes/upload.ts`（multer + 限流 + validateAndRenameUpload 链路）。

### 3.3 安全红线（人工安全复核继承，硬性）
1. token 必须 `crypto.randomBytes(16).toString('hex')`（node crypto，禁止 Math.random）
2. token 不存在 / 过期 / 链接停用 / 机构停用 → 统一 **410 Gone**，响应体固定 `{ success: false, error: '链接已失效' }`，四种情况**不做任何区分**
3. POST 限流 15 分钟 10 次/IP（`referralLimiter`），GET 限流 15 分钟 60 次/IP（`referralPageLimiter`），都加进 `middleware/rate-limit.ts`
4. 提交表单 Zod 严格校验：姓名 2-30 字、手机 `^1[3-9]\d{9}$`、邮箱可选但填了必须格式正确、推荐理由 ≤1000 字可选、**consent 必须 z.literal(true)**（未勾选 400「请确认已获得候选人授权」）
5. 文件只走 `validateAndRenameUpload` 链路；MIME 白名单 pdf/doc/docx（与 parse-resume 的 allowedTypes 对齐，doc 也允许——PRD 写明 pdf/doc/docx）
6. 查重结果绝不回显；疑似重复时候选人 `sourceNote` 写「疑似重复待核实（与现有候选人手机号/邮箱重复）」，通知内容里告知 HR
7. OperationLog 记录每次公开提交：userId = 链接创建人，action `'agency_referral_submit'`，detail 含 `{ agencyId, linkId, tokenSuffix: token 后 4 位, duplicated }`；链接生成/停用也各写一条（action `'agency_link_create'` / `'agency_link_disable'`）
8. 落地页 GET 只返回 `{ agencyName, jobTitle }`（jobTitle 可为 null），**绝不**返回机构联系方式、创建人、其他候选人等任何额外字段

## 4. 实施任务

### 4.1 `server/prisma/schema.prisma`（条件修改）
新增 Agency / AgencyLink 模型（§2.3，放文件末尾区域，加表头中文注释）；`Job` 模型追加 `agencyLinks AgencyLink[]`。

### 4.2 `server/prisma/migrations/20260902130000_add_agency_referral/migration.sql`（新增）
手写迁移 SQL（参照 `20260902000000_add_interview_question_outline/migration.sql` 风格）：两表 + agency.name 唯一索引 + agency_link.token 唯一索引 + jobId 外键 `ON DELETE SET NULL` + agencyId 外键（级联规则用默认 Restrict，不级联删链接）。然后 `npx prisma generate`。

### 4.3 `server/src/services/agency.service.ts`（新增）
导出：
- `createAgency(data: { name, contact?, phone?, remark? }, userId)`：name 去空格后查重，重复 400「机构名称已存在」。
- `updateAgency(id, data)`：部分更新（name/contact/phone/remark/enabled）；name 重复同样 400。
- `listAgencies()`：全部机构 + 各机构链接数（`_count.links`）+ 推荐数（`prisma.candidate.count({ where: { source: '猎头:' + name } })`，用 `$queryRaw` 或循环 count 均可，机构数量级小不用优化）。
- `createAgencyLink(agencyId, data: { jobId?, expiresAt?: string | null }, userId)`：机构不存在 404、已停用 400；jobId 提供时校验职位存在；**expiresAt 缺省 = 当前 +90 天，显式 null = 长期**；token = `crypto.randomBytes(16).toString('hex')`；写 OperationLog；返回完整链接记录（含拼好的路径 `/referral/${token}`）。
- `disableAgencyLink(linkId, userId)`：置 `disabledAt = now`（幂等：已停用直接返回）；写 OperationLog。
- `getAgencyStats(agencyId)`：机构不存在 404。按 `source = '猎头:' + agency.name` 聚合：`{ total, stages: [{ stage, count }], offers, joined }`——total 为候选人总数；stages 取每个候选人**最新** StageRecord（参照既有「当前阶段」查询惯例，先看 `stats.service.ts` 或 candidate 列表怎么取当前阶段再动手）；offers = 这些候选人中有 Offer 记录的数量；joined = Offer.joined = true 的数量。

### 4.4 `server/src/services/referral.service.ts`（新增，核心）
导出：
- `RESOLUTION_GONE = { success: false, error: '链接已失效' }` 常量语义：内部统一 `assertLinkUsable(token)` 私有函数——查 link（include agency/job），token 不存在 / `disabledAt` 非空 / `expiresAt` 已过 / `agency.enabled === false` → 一律抛 `AppError('链接已失效', 410)`。
- `getReferralInfo(token)`：`assertLinkUsable` 后返回 `{ agencyName, jobTitle }`（§3.3-8 字段收敛）。
- `submitReferral(token, form: { name, phone, email?, reason? }, file: Express.Multer.File)`：
  1. `assertLinkUsable`。
  2. 文件走 `validateAndRenameUpload` + `createUploadRecord`（uploadedById = link.createdById）+ `buildFileApiPath`（参照 upload.ts 的 processUploadedFile，可抽用但**不要改 upload.ts**，在本 service 内复刻该流程并注明出处）。
  3. 查重：`checkDuplicate(form.phone, form.email || undefined, undefined, undefined)`（email 空串时传 undefined 跳过邮箱维度）。
  4. `createCandidate`（candidate.service，**不传 scope、不传 jobIds**）：`{ name, phone, email: form.email || '', education: '', resumeUrl, source: '猎头:' + agency.name, sourceNote: 有重复时写 §3.3-6 标记（无重复则不传）, intro: form.reason, consentAt: new Date().toISOString(), consentNote: '猎头机构（' + agency.name + '）承诺已获候选人授权' }`。注意 `education` 是必填字段——传空串，简历解析回填。
  5. link.jobId 非空时：`prisma.candidateJob.create({ data: { candidateId, jobId: link.jobId } })`（绕过打分钩子，A1）。
  6. 触发解析：`resumeParseQueue.add('parse', { filePath: 重命名后的文件绝对路径, mimetype, userId: link.createdById, candidateId })`（candidateId 是本切片新增的负载字段，见 §4.8；失败仅记日志不阻塞）。
  7. 站内通知链接创建人：`createNotification({ recipientId: link.createdById, title: '新猎头推荐：' + form.name, content: 含机构名/职位名/是否疑似重复, type: 'agency_referral', businessId: candidateId, businessType: 'candidate' })`。
  8. OperationLog（§3.3-7）。
  9. 返回固定成功结构 `{ success: true, message: '已提交，将由 HR 联系候选人' }`（B1，**不含** candidateId）。
- 任何步骤抛错时：已创建的上传记录/候选人尽量不回滚（与系统既有风格一致，失败由 HR 清理），但简历文件已落库而候选人创建失败时要在日志里明显标记。

### 4.5 `server/src/controllers/agency.controller.ts` + `referral.controller.ts`（新增 2 个）
薄壳：取参 → 调 service → `{ success, data }` / `{ success, message }` 响应。referral.controller 的 submit 从 `req.file` + `req.body` 取参（multer 表单字段都是字符串，zod 在路由层已校验）。

### 4.6 `server/src/routes/agencies.ts`（新增）
6 条管理路由（§1.3），全部 `authenticate + requireMatrixPermission('agency:manage')` + zod 校验（机构 name 1-50 字；links body `{ jobId: z.string().cuid().optional(), expiresAt: z.string().datetime().nullable().optional() }`）。注意 DELETE 路径 `/links/:linkId` 注册在 `/:id` 之前（静态段优先）。

### 4.7 `server/src/routes/referral.ts`（新增）
2 条公开路由（§1.3），**不加 authenticate**：
- `GET /:token`：referralPageLimiter + params 校验（token 必须 32 位 hex 正则，不符直接走 410 路径——不要 400，防探测）
- `POST /:token`：referralLimiter + multer（diskStorage tmp uuid，limits 用 env.MAX_FILE_SIZE，单文件字段名 `file`）+ zod 校验 body（§3.3-4；multer 表单里 consent 是字符串 `'true'`，zod 用 `z.literal('true')` 或预处理）
- token 校验失败/链接不可用 → 统一 410（§3.3-2）

### 4.8 `server/src/workers/resume-parser.worker.ts`（条件修改）
- job.data 新增可选 `candidateId`。
- **只有非 candidateId 模式（存量预解析流程）才删除临时文件**；candidateId 模式的文件是正式存储简历，禁止删除。
- candidateId 模式：解析成功后 `prisma.candidate.update`，只回填**为空**的字段（`skills`（Json）/ `education` / `workYears` / `school` / `currentCompany` / `currentPosition`，按 parseResume 返回结构映射；先读 resume-parser.service.ts 确认字段名），不覆盖已有值；失败仅 console.error 不抛（参照 ai-match-score.worker 的容错风格）。加中文注释。

### 4.9 `server/src/middleware/rate-limit.ts`（条件修改）
追加 `referralLimiter`（15min/10 次，message「提交过于频繁，请稍后再试」）与 `referralPageLimiter`（15min/60 次，message「访问过于频繁，请稍后再试」）。

### 4.10 `server/src/services/role-permission.service.ts`（条件修改）
`HR_PERMISSIONS` 追加 `'agency:manage'`。

### 4.11 `server/src/routes/index.ts`（条件修改）
追加两行：`router.use('/agencies', agencyRoutes);` 与 `router.use('/referral', referralRoutes);`（位置随既有字母序风格即可）。

### 4.12 `server/tests/unit/referral.service.test.ts`（新增）
mock prisma（agencyLink/agency/candidate/candidateJob/operationLog/uploadRecord 等）+ `../../src/lib/queue` + `../services/file.service`（如被直接引用）+ candidate.service 的 createCandidate（可 mock `../../src/services/candidate.service` 只 stub createCandidate 与 checkDuplicate 路径，或 mock prisma 到底层——参照既有单测选成本低的）。覆盖至少：
- 四种失效场景（token 不存在/过期/disabledAt/机构停用）全部 410 且 message 一致
- 正常提交：createCandidate 参数核对（source/consentNote/consentAt/education 空串、**无 jobIds**）+ candidateJob 直接创建 + 不触发 aiMatchScoreQueue + resumeParseQueue.add 带 candidateId + 通知与 OperationLog
- 疑似重复：sourceNote 标记 + 通知内容含提示；响应仍固定文案不含 ID
- email 空串：checkDuplicate 第二参为 undefined

### 4.13 `server/tests/unit/agency.service.test.ts`（新增）
覆盖：name 重复 400、停用机构创建链接 400、默认 90 天有效期、显式 null 长期有效、disable 幂等、stats 聚合（total/stages/offers/joined）。

### 4.14 `server/tests/integration/referral.test.ts`（新增）
supertest 公开边界测试（**不带 x-test-role**；auth mock 参照 interview-outline 集成测试但公开路由根本不过 authenticate）。覆盖：
- GET 正常返回仅 `{ agencyName, jobTitle }` 两字段
- GET/POST 伪造 token（32 位 hex 但不存在的、非 hex 格式的）→ 410
- POST 未勾授权 → 400；文件缺失 → 400
- POST 正常提交（multer 用构造的小文件；mock validateAndRenameUpload 链路的 prisma 部分）
- 管理接口无 token → 401（authenticate 照旧），interviewer 角色 → 403

## 5. 关键决策点

### 5.1 邮箱空串策略
schema 改可空影响面太大（全系统 email 当 string 用），本切片存 `''`，查重跳过，展示层 F5-C 处理「—」。不为它改 schema。

### 5.2 解析回填不覆盖已有值
猎头填的表单字段优先；解析只补空字段。worker 里逐字段判断。

### 5.3 不做清单
- 不做前端（F5-C：机构管理页 + 公开推荐页 + 候选人来源筛选）
- 不做机构维度权限隔离（hr 都能看全部机构，PRD 未要求）
- 不做链接点击统计
- 不做 F4 积分联动（F4-S1 统一做事件埋点，本切片只保证 OperationLog 动作名规范）
- 不 git commit、不跑验收命令

## 6. 修改文件清单

### 6.1 必改文件（15 个；✱=新增，其余为条件修改）
1. `server/prisma/schema.prisma`
2. ✱ `server/prisma/migrations/20260902130000_add_agency_referral/migration.sql`
3. ✱ `server/src/services/agency.service.ts`
4. ✱ `server/src/services/referral.service.ts`
5. ✱ `server/src/controllers/agency.controller.ts`
6. ✱ `server/src/controllers/referral.controller.ts`
7. ✱ `server/src/routes/agencies.ts`
8. ✱ `server/src/routes/referral.ts`
9. `server/src/routes/index.ts`
10. `server/src/middleware/rate-limit.ts`
11. `server/src/services/role-permission.service.ts`
12. `server/src/workers/resume-parser.worker.ts`
13. ✱ `server/tests/unit/referral.service.test.ts`
14. ✱ `server/tests/unit/agency.service.test.ts`
15. ✱ `server/tests/integration/referral.test.ts`

### 6.2 禁止修改文件
清单以外一切；特别地：`client/**`、`e2e/**`、任何 package.json、`routes/upload.ts`、`candidate.service.ts`、`resume-parser.service.ts`、`.eslintrc.cjs`、tsconfig。`npx prisma generate` 产生的 `node_modules` 变更不算改动。

### 6.3 越界检测（交付前自检）
- `git status --short` 只允许出现 6.1 的 15 个路径（migration 目录算 1 个）。
- `git diff --stat -- client e2e` 必须 0 行。

## 7. 验收标准

### 7.1 硬性验收（审核方执行，你不跑；仅供了解通过线）
- `server pnpm build`（tsc）：0 错误。
- `server pnpm test`：基线 50 文件 / 488 用例全过 + 新增 3 个测试文件全过（用例数 ≥ 488+25）。
- `server pnpm lint:check`：不新增 error（存量基线 18144e/225w；增量只许是 import/extensions、no-restricted-syntax 等存量规则类，新文件 <63 错/文件）。
- git status 仅 15 个预算文件；无 BOM。
- **安全专项**（审核方逐条过 §3.3 的 8 条红线，重点抽查：token 生成方式、410 一致性、响应字段收敛、绕过打分钩子）。

### 7.2 交付报告模板（最终回复必须完整包含）
1. 完成范围概述
2. 15 个文件逐个说明（新增写职责；条件修改**逐处**列 before→after 摘要）
3. 安全红线 8 条逐条落实说明（§3.3）
4. 人工复核 4 决策（A1/B1/C/D）落实确认
5. migration SQL 全文（供人工 review 后 apply）
6. 越界自检（git status 全文）
7. 已知问题与遗留风险
8. 红线自检确认

按本提示词直接执行（headless 环境无人工确认环节）：先输出实施计划，然后动手，最终回复给出完整交付报告。
