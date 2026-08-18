# Kimi Code 改造提示词方案 —— 招聘管理系统（ATS）

> 用法：每个代码块是一条完整提示词，按阶段顺序粘贴进 Kimi Code 执行。
> **重要**：每执行一条提示词前，先在 git 上提交一次（`git commit`），这样完成后把 diff 发给我审核时边界清晰。
> 执行顺序即优先级顺序，不要跳阶段。每条提示词完成后跑一次测试再提交。

---

## 阶段一：安全与合规（上线前必须完成）

### 提示词 1.1 —— 简历文件访问鉴权

```
先阅读项目根目录的 AGENTS.md 了解项目规范。

背景：这是一个 Express + Prisma + Vue3 的招聘管理系统。当前简历等上传文件存放在 server/uploads/，Nginx 配置（nginx/nginx.conf）把 /uploads/ 直接映射为静态目录，任何人拿到 URL 就能下载简历，存在敏感个人信息泄露风险。

任务：把上传文件的访问改为鉴权后可访问。
1. 后端：在 server/src/routes/files.ts（或新增专用路由）中实现带 authenticate 中间件的文件下载接口，校验 JWT 后读取 server/uploads/ 下的文件并返回（注意防路径遍历：文件名必须匹配 UUID 格式白名单，禁止出现 ../）。文件下载行为写入 OperationLog（action: 'resume_download'）。
2. Nginx：将 /uploads/ 的静态映射改为内部跳转（internal location + X-Accel-Redirect 方案），外部直接访问 /uploads/ 返回 403，仅允许后端鉴权后通过 X-Accel-Redirect 内部转发。开发环境（无 Nginx）由 Express 直接 sendFile。
3. 前端：把代码里所有直接拼接 /uploads/xxx 访问简历的地方，改为调用新的鉴权下载接口（axios 需要带 Authorization 头，注意二进制流下载处理）。
4. UploadRecord 表已有，下载接口需要校验文件记录存在。

约束：最小变更；中文注释；优先使用 tsconfig/vite 别名导入；类型安全不用 any。

验收标准：未登录访问简历 URL 返回 401/403；登录后可正常预览/下载；路径遍历请求（如 /uploads/..%2f..%2f.env）被拒绝；docker-compose 和 nginx 两套配置都改到位。完成后运行 server 端测试确保不破坏现有用例。
```

### 提示词 1.2 —— JWT 吊销机制与密码重置

```
先阅读项目根目录的 AGENTS.md 了解项目规范。

背景：Express + JWT 认证（server/src/routes/auth.ts，jsonwebtoken）。当前问题：① logout 只是客户端删 token，服务端无法吊销，成员离职后 token 在有效期内仍可用；② 没有忘记密码/重置密码流程；③ 密码策略只要求 6 位，偏弱。

任务：
1. JWT 吊销：给 User 表加 tokenVersion 字段（Int, 默认 0，需要 prisma migrate dev 生成迁移并 prisma generate）。签发 JWT 时把 tokenVersion 放进 payload；authenticate 中间件校验时比对数据库中的 tokenVersion，不一致则 401。修改密码、管理员重置密码、管理员禁用/删除用户时 tokenVersion +1，实现"改密即全端下线"。
2. 管理员重置密码：在 users 路由增加 POST /api/users/:id/reset-password（仅 admin），生成随机 12 位临时密码返回给管理员（仅本次返回，不落明文），同时 tokenVersion +1 强制该用户重新登录，并写入 OperationLog。
3. 密码策略：新密码校验升级为至少 8 位且同时包含字母和数字，统一在 Zod schema 层实现（auth.ts 的 changePassword、register 及 users 路由），前端表单提示同步更新。
4. 前端：成员管理页（client/src/views/users/index.vue）加"重置密码"按钮（仅 admin 可见），重置成功后弹窗展示临时密码并提示复制。

约束：最小变更；中文注释；别名导入；不用 any。数据库变更必须生成 migration。

验收标准：改密后旧 token 立即失效（写集成测试验证）；管理员重置密码后目标用户旧 token 失效；弱密码（纯数字、7位）被前后端同时拒绝；现有测试全部通过。
```

### 提示词 1.3 —— 候选人数据权限隔离

```
先阅读项目根目录的 AGENTS.md 了解项目规范。

背景：User 表有 department 字段，职位列表（job.controller.ts 中 getUserDepartment）已按部门过滤，但候选人模块（server/src/services/candidate.service.ts）没有任何数据隔离，任何 member 可查看全部候选人（含手机号、邮箱）。

任务：实现候选人的数据可见性控制。
1. 规则：admin 看全部；member 仅可见"自己创建的候选人（createdById = 自己）+ 被指派给自己的阶段记录（StageRecord.assigneeId = 自己）关联的候选人 + 自己部门职位（Job.departments 包含自己 department）下关联的候选人"。department 为 null 的 member 仅看前两类。
2. 在 candidate.service.ts 的列表查询、详情查询、批量操作（推进阶段/打标签）中统一注入该可见性条件；详情访问无权限返回 403。注意保持现有避免 N+1 的批量查询风格。
3. 统计接口（stats.service.ts）中涉及候选人/工作量的统计，member 视角同样按上述范围过滤（admin 不变）。
4. 前端无需大改，但候选人列表页给 member 一个"我相关的"范围提示文案即可。

约束：最小变更；中文注释；别名导入；不用 any；权限过滤集中在 service 层，不要散落在 controller。

验收标准：在 server/tests/unit/candidate.service.test.ts 补充权限过滤用例（admin 全量、member 仅相关、跨部门不可见）；在 tests/integration/candidate.test.ts 补一个 member 访问他人候选人详情返回 403 的用例；现有测试全部通过。
```

### 提示词 1.4 —— 个人信息保护（PIPL）合规改造

```
先阅读项目根目录的 AGENTS.md 了解项目规范。

背景：系统存储候选人姓名、电话、邮箱、简历等敏感个人信息，需补基本的个保法合规能力。

任务：
1. 授权同意：Candidate 表加 consentAt（DateTime?）和 consentNote（String?）字段（生成 migration）。新增/编辑候选人表单（client/src/views/candidates/CandidateForm.vue）增加"已获得候选人授权同意"勾选项与授权时间记录，保存时写入。候选人详情页展示授权状态，未授权的候选人给出醒目标识。
2. 数据保留与匿名化：Candidate 表加 anonymizedAt（DateTime?）。新增 service 方法：对"淘汰超过 2 年且未入职"的候选人执行匿名化（姓名改"已匿名"、手机/邮箱清空、删除简历物理文件、保留统计所需的阶段/来源等脱敏数据），并写入 OperationLog。在 server 启动时注册一个 node-cron 每日凌晨执行的定时任务调用该方法（新增依赖 node-cron，同步更新 .env.example 加 ANONYMIZE_CRON 开关配置）。
3. 性别/年龄合规：Candidate.gender 改为选填（schema 校验、前端表单同步改为非必填），候选人列表默认不展示性别和年龄列。
4. 简历查看审计：候选人详情中每次打开简历预览/下载，写入 OperationLog（action: 'resume_view'，若提示词 1.1 的下载日志已实现则复用其模式）。

约束：最小变更；中文注释；别名导入；不用 any；数据库变更必须生成 migration 并 prisma generate；新增环境变量同步更新 .env.example 和 server/src/lib/env.ts。

验收标准：未授权候选人在列表/详情有明显标识；匿名化方法有单测（验证字段清空、文件删除、统计字段保留）；性别非必填全流程通过；现有测试全部通过。
```

---

## 阶段二：核心流程闭环

### 提示词 2.1 —— Offer 多级审批流

```
先阅读项目根目录的 AGENTS.md 了解项目规范。

背景：HC 编制申请（HCRequest）已有完整审批流（draft→submitted→approved/rejected），但 Offer 直接创建即生效，涉及薪资成本却无审批。请参照 HCRequest 的既有模式为 Offer 增加审批。

任务：
1. Offer 表加字段：status（draft/pending_approval/approved/rejected/sent，默认 draft）、approverId、approveNote、approvedAt、rejectedAt（生成 migration）。新增 offer_approval 相关操作写入 OperationLog。
2. 后端 offer.service.ts / offer 路由新增：提交审批（draft→pending_approval）、审批通过/拒绝（仅 admin 或被指定审批人）、审批通过后才允许标记为已发送/录入候选人答复结果。前端 OfferForm/OfferDetail 增加审批状态展示与操作按钮（按角色显隐）。
3. 通知：提交审批时给审批人发站内通知，审批结果给创建人发站内通知（复用 notification.service）。
4. 兼容：历史已存在 Offer 迁移后 status 默认为 'sent'（保持现有行为）。

约束：最小变更；复用 HCRequest 的交互与代码模式；中文注释；别名导入；不用 any。

验收标准：server/tests/unit/offer.service.test.ts 补审批流转用例（非法状态跳转被拒绝、非审批人审批被拒）；集成测试覆盖提交/审批/拒绝三个接口；前端创建 Offer 后默认草稿，需提交审批→通过后才能录入接受/拒绝结果；现有测试全部通过。
```

### 提示词 2.2 —— 结构化面试评估表 + 反馈催收

```
先阅读项目根目录的 AGENTS.md 了解项目规范。

背景：当前面试反馈（InterviewFeedback）只有富文本 + pass/reject/pending 结论，且 interviewerName 是 HR 手填的字符串。需要升级为结构化评估表并让面试官本人填写。

任务：
1. 数据模型：新增 InterviewEvaluation 表（关联 Interview 与 User（面试官），含 dimensions Json（如 [{name:'专业能力',score:4,comment:'...'}]）、overallScore、conclusion、submittedAt），生成 migration。评估维度做成可在字典表（Dictionary 新 category: evaluation_dimension）配置的项。
2. 后端：面试安排创建时按 interviewers 自动为每位面试官生成待填评估；新增评估提交接口（面试官本人可提交/修改自己的，admin 可查看全部）；Interview 详情聚合各面试官评估。
3. 催收：面试结束（scheduledAt + duration）后 24 小时未提交评估的面试官，生成站内催收通知（复用 notification.service；调度可挂到已有的定时任务机制上，若没有则用 node-cron 每小时扫描一次）。
4. 前端：新增"我的面试"工作台页（面试官视角：待评估列表 + 评估表单，维度评分用 el-rate 或 el-input-number），面试管理详情页展示各面试官评分明细与雷达图（用项目已有的 echarts）。保留原 InterviewFeedback 兼容历史数据，新反馈走新表。

约束：最小变更；中文注释；别名导入；不用 any；数据库变更必须生成 migration；新增路由注册到 server/src/routes/index.ts 和前端路由。

验收标准：评估提交/催收逻辑有单测；面试官只能提交自己的评估（集成测试验证越权返回 403）；催收任务扫描逻辑可单测（mock 时间）；现有测试全部通过。
```

### 提示词 2.3 —— 自动化提醒调度器

```
先阅读项目根目录的 AGENTS.md 了解项目规范。

背景：CommunicationLog.followUpAt（下次跟进时间）、Interview.scheduledAt、StageRecord.enteredAt 等提醒数据基础都已在库里，但系统没有任何调度器去扫描触发提醒，提醒链条是断的（现有仅 resume-parser 一个 BullMQ worker）。

任务：实现统一的提醒调度器。
1. 用 node-cron（如阶段一已引入则复用）在 server 启动时注册每小时扫描任务，可配置开关（.env.example 加 REMINDER_CRON_ENABLED，同步 env.ts）。
2. 三类提醒：① 跟进到期：CommunicationLog.followUpAt 已过且未生成过提醒的，给创建人发站内通知；② 面试前提醒：scheduledAt 在未来 2 小时内且未提醒过的面试，给创建人及所有面试官发站内通知；③ 阶段停留超时：StageRecord 处于 in_progress 且 enteredAt 超过 7 天（阈值做成 env 可配），给 assignee 和其部门管理者发站内通知。
3. 防重复：Notification 表加 dedupeKey（String? 唯一索引）字段（生成 migration），提醒写入前用 dedupeKey 幂等去重。
4. 通知中心前端（client/src/views/notifications/index.vue）支持按 type 筛选。

约束：最小变更；中文注释；别名导入；不用 any；扫描逻辑抽成独立 service 便于单测（mock 时间）。

验收标准：三类提醒各有单测（含"不重复发送"用例）；扫描任务失败不拖垮主进程（try/catch + 日志）；现有测试全部通过。
```

### 提示词 2.4 —— 按职位类型自定义招聘流程（Pipeline）

```
先阅读项目根目录的 AGENTS.md 了解项目规范。

背景：招聘阶段目前全局硬编码为七阶段（入库/初筛/复试/终面/拟录用/Offer/入职），前端 client/src/views/candidates/index.vue 和后端校验里都写死了。校招需要"笔试"、实习可能只需一轮，需要支持按职位类型自定义流程。

任务：
1. 新增 PipelineTemplate 表（name、type（社招/校招/实习）、stages Json 有序数组、enabled、isDefault），生成 migration 并 seed 一个与现有七阶段一致的默认模板。
2. Job 表加 pipelineTemplateId（可空，空则用该 type 的默认模板）。
3. 候选人推进阶段时，目标阶段的合法选项从该候选人关联职位的 pipeline 模板取（未关联职位用默认模板）；后端校验同步改造，淘汰/通过逻辑不变。前端候选人详情/批量推进弹窗的阶段下拉改为动态从接口获取。
4. 设置页新增 Pipeline 模板管理（admin）：列表、新建、编辑（拖拽或上下移排序阶段）、启停用。

约束：最小变更；中文注释；别名导入；不用 any；阶段字符串迁移期间保持对存量 StageRecord 数据兼容（老阶段值仍可展示，仅推进选项按模板）。

验收标准：单测覆盖"按模板校验目标阶段合法性"和"无模板回退默认"；集成测试覆盖推进到模板外阶段返回 400；前端不同职位类型的候选人推进选项不同；现有测试全部通过。
```

### 提示词 2.5 —— 面试日历与会议邀请（ics）

```
先阅读项目根目录的 AGENTS.md 了解项目规范。

背景：面试安排已有冲突检测和日历视图，但面试官/候选人收不到任何日历邀请，全靠人肉通知。系统已有 SMTP 邮件能力（server/src/services/mail.service.ts）和飞书 OAuth 登录基础。

任务：
1. 创建/改期面试时，自动向所有面试官和候选人发送带 .ics 附件的会议邀请邮件（标题含候选人、职位、轮次、时间、地点/链接；改期发送更新，取消发送取消）。用 icalendar 或手写 RFC5545 格式均可，新增依赖需说明。
2. 邮件模板化：ics 邀请邮件走 EmailTemplate 体系（新增系统内置模板，可在设置页编辑文案）。
3. 面试详情/列表加"重发邀请"按钮。
4. 预留飞书日历集成接口封装（server/src/lib/ 下新增 feishu-calendar.ts，利用已有 feishu-auth 的 tenant token 创建日程），若 app 权限未配置则优雅降级只发邮件，不报错。

约束：最小变更；中文注释；别名导入；不用 any；邮件发送失败要落 EmailLog 且不影响面试创建主流程。

验收标准：ics 生成逻辑有单测（时间、时区 Asia/Shanghai、UID 稳定性）；改期/取消触发的邮件类型正确；SMTP 未配置时静默降级不报错；现有测试全部通过。
```

---

## 阶段三：获客与数据质量

### 提示词 3.1 —— 候选人投递门户（公开 careers 页）

```
先阅读项目根目录的 AGENTS.md 了解项目规范。

背景：目前候选人全靠 HR 手工录入/上传简历，没有对外投递入口。需要新增一个无需登录的公开投递门户。

任务：
1. 前端：新增公开路由 /careers（不走 DefaultLayout，独立简洁页面）：职位列表（仅 status=open，展示标题/部门/地点/类型）、职位详情、投递表单（姓名/手机/邮箱/期望薪资/简历上传/来源自动标记为"官网投递"），表单含"授权同意个人信息处理"必选勾选框（写入 Candidate.consentAt，对接阶段一的合规字段）。
2. 后端：新增公开 API（/api/public/jobs、/api/public/jobs/:id、/api/public/apply），必须做：严格限流（IP 维度，投递接口 10 分钟 3 次）、Zod 校验、复用 duplicate-checker 重复检测（重复时静默关联职位而非报错，避免信息泄露）、简历上传复用现有 multer + UUID 改名逻辑。公开接口只允许暴露必要字段（职位详情不含 HC、薪资等内部信息）。
3. 投递成功后候选人自动关联职位并进入"入库"阶段，给该职位创建人发站内通知。
4. Nginx 与 CORS 配置同步检查，确保公开接口不需要 Authorization 头即可访问。

约束：最小变更；中文注释；别名导入；不用 any；公开接口的安全校验单独写中间件，不要影响现有鉴权链路。

验收标准：集成测试覆盖公开投递全流程（成功投递、限流触发、重复投递关联、恶意字段注入被拒）；未登录可访问 /careers；投递的候选人带 consentAt；现有测试全部通过。
```

### 提示词 3.2 —— 渠道追踪链接

```
先阅读项目根目录的 AGENTS.md 了解项目规范。

背景：候选人来源（source）目前靠 HR 手填字符串，无法准确归因。基于已有的投递门户（/careers），需要支持渠道追踪链接。

任务：
1. 新增 RecruitmentChannel 表（name、code 唯一、note、enabled），生成 migration 并 seed 常见渠道（BOSS直聘、智联、猎聘、内推、官网）。
2. 渠道生成专属投递链接：/careers?channel={code}，门户提交时把 code 写入 Candidate.source（存 code，展示 name）。链接在渠道管理页可一键复制、可生成二维码（前端用 qrcode 库）。
3. 设置页新增渠道管理（admin）：增删改、启停用、每个渠道的投递量/录用量统计（复用 stats.service 的渠道效果分析，改为按 RecruitmentChannel 关联统计，保留对手填历史 source 的兼容展示）。

约束：最小变更；中文注释；别名导入；不用 any。

验收标准：渠道链接投递的候选人来源自动归因且不可被前端篡改（以服务端解析为准）；统计口径切换后历史数据仍可查；渠道 CRUD 有集成测试；现有测试全部通过。
```

### 提示词 3.3 —— 重复候选人合并

```
先阅读项目根目录的 AGENTS.md 了解项目规范。

背景：duplicate-checker.service.ts 只在创建时警告重复，重复候选人入库后无法合并，人才库数据越来越脏。

任务：
1. 后端：candidate.service 新增 mergeCandidates(primaryId, duplicateId) 方法——把 duplicate 的 CandidateJob、StageRecord、InterviewFeedback、Interview、CommunicationLog、WorkHistory、标签等全部转移到 primary，按字段"primary 为空则取 duplicate"补齐基础信息，完成后删除 duplicate（级联清理），整个操作包在 Prisma 事务里，写 OperationLog。
2. 前端：候选人详情页检测到疑似重复（同名/同手机/同邮箱）时展示提示条，点击打开合并对比弹窗（左右两列字段对比，可逐字段选择保留哪边），确认后调用合并接口。
3. 候选人列表加"疑似重复"筛选项。

约束：最小变更；中文注释；别名导入；不用 any；合并必须事务化，失败整体回滚。

验收标准：mergeCandidates 有完整单测（关联转移、字段补齐、事务回滚、日志）；集成测试覆盖合并接口及合并不存在候选人的 404；合并后被删候选人的旧 URL 访问返回 404 而非 500；现有测试全部通过。
```

### 提示词 3.4 —— 内推模块

```
先阅读项目根目录的 AGENTS.md 了解项目规范。

背景：Candidate.referrer 字段已存在但没有内推流程。内推通常是质量最高的招聘渠道，需要完整闭环。

任务：
1. 员工内推入口：成员登录后可访问"我的内推"页——展示开放职位（可生成带自己标识的内推链接 /careers?ref={userId}）、我推荐的候选人列表及其当前阶段进度。
2. 内推链接投递自动写入 referrer（推荐人姓名）+ source 标记为"内推"，服务端以 ref 参数解析用户为准，防伪造。
3. 内推奖励规则（轻量）：Dictionary 新增 category: referral_reward 配置各职级奖励金额；内推候选人入职（StageRecord 进入"入职"且 Offer.joined=true）时给推荐人发站内通知提示奖励达成，成员"我的内推"页展示奖励状态（待达成/已达成）。
4. 统计：stats 渠道效果中"内推"可下钻查看各推荐人的推荐量/入职量。

约束：最小变更；中文注释；别名导入；不用 any；复用投递门户，不要另起一套投递接口。

验收标准：内推链接归因准确（集成测试：伪造 ref 被拒）；奖励达成通知有单测；推荐人视角只能看到自己推荐的候选人进度；现有测试全部通过。
```

---

## 阶段四：体验与洞察

### 提示词 4.1 —— 候选人看板视图

```
先阅读项目根目录的 AGENTS.md 了解项目规范。

背景：候选人管理目前只有表格视图，推进阶段要逐个开弹窗。需要增加按阶段分列的看板（Kanban）视图，这是 ATS 最高频的交互。

任务：
1. 候选人列表页加"表格/看板"切换（记住用户选择，localStorage）。看板按当前职位的 pipeline 阶段分列（或全局默认七阶段），每列卡片展示：姓名、当前公司/职位、学历、标签、停留天数、负责人。
2. 拖拽卡片到目标列即推进阶段（复用现有批量推进接口；淘汰列拖拽时弹出淘汰原因必填弹窗）。拖拽用 vuedraggable 或原生 HTML5 DnD。
3. 看板支持按职位筛选（选中某职位后列按该职位 pipeline 渲染）、按负责人筛选；每列顶部显示人数。
4. 性能：看板模式一次加载上限 200 人，超出提示先筛选。

约束：最小变更；复用现有接口，不要为看板新造数据接口（确需新增聚合接口需说明理由）；中文注释；别名导入；不用 any。

验收标准：拖拽推进后阶段记录、通知、自动化邮件触发与表格操作行为一致（同一 service 方法）；列数随 pipeline 模板动态变化；移动端降级为横向滚动；现有测试全部通过。
```

### 提示词 4.2 —— 批量操作扩充 + 操作日志页面

```
先阅读项目根目录的 AGENTS.md 了解项目规范。

背景：候选人批量操作只有"批量推进阶段"和"批量打标签"两种；OperationLog 表在持续落库但前端没有查看入口。

任务：
1. 批量操作扩充：候选人列表勾选后新增——批量淘汰（必填淘汰原因，逐条走现有阶段推进逻辑保证通知/审计一致）、批量发邮件（选模板，复用 email 发送与日志）、批量分配负责人（更新当前 in_progress 阶段记录的 assigneeId）、批量导出 Excel（复用 stats 的导出封装，导出勾选候选人的基础信息，注意按当前用户的数据权限过滤）。
2. 操作日志页面：admin 菜单新增"操作日志"页——按操作人/对象类型/动作/时间范围筛选，分页列表，detail JSON 可展开查看；后端新增只读查询接口（仅 admin）。

约束：最小变更；批量操作后端逐个走既有 service 方法（不绕过通知/权限/审计）；中文注释；别名导入；不用 any。

验收标准：四个批量操作均有权限校验（member 只能操作自己可见范围的候选人）；批量发邮件落 EmailLog；日志查询接口有集成测试（member 访问 403）；现有测试全部通过。
```

### 提示词 4.3 —— 候选人全文检索

```
先阅读项目根目录的 AGENTS.md 了解项目规范。

背景：候选人搜索只匹配姓名/邮箱/手机号。简历已被 LLM 解析出结构化信息（技能、工作经历），需要支持"搜会某技能的候选人"这类检索。

任务：
1. Candidate 的 skills（Json）与 WorkHistory 的 company/position/description、intro 汇总生成一个 searchText 冗余字段（@db.Text），由 Prisma 触发器或应用层在相关数据变更时同步更新（选应用层，集中在 candidate.service 的一个私有方法）。
2. 列表关键词查询扩展为同时 ILIKE 匹配 searchText（数据量大后再考虑 tsvector，本期不做）。
3. 前端搜索框 placeholder 更新为"姓名/邮箱/手机号/技能/公司"，命中技能/工作经历时列表行内高亮提示命中来源。
4. 存量数据：提供一个 prisma 脚本（scripts/ 目录）回填所有存量候选人的 searchText。

约束：最小变更；中文注释；别名导入；不用 any。

验收标准：searchText 同步逻辑有单测（候选人更新、工作经历增删后字段正确刷新）；按技能关键词搜索有集成测试；回填脚本可重复执行（幂等）；现有测试全部通过。
```

### 提示词 4.4 —— 周报订阅 + 设置菜单入口

```
先阅读项目根目录的 AGENTS.md 了解项目规范。

背景：① 统计报表较全但没有自动推送，管理层要登录系统才能看数据；② 字典/邮件模板/自动化规则/标签管理四个 admin 页面在路由里是 hidden，只能靠直链访问。

任务：
1. 招聘周报：每周一 09:18（用已有 node-cron 调度机制）汇总上周数据——新增候选人、各阶段流转量、面试场次、Offer 发出/接受数、入职数、渠道 TOP3（复用 stats.service 方法），按 EmailTemplate（新增系统内置"招聘周报"模板）生成 HTML 邮件，发送给订阅列表。订阅管理：设置页新增"周报订阅"（admin），维护收件人邮箱列表（存 Dictionary 新 category 或新表 ReportSubscription，二选一并说明理由），可手动"立即发送一份"预览。
2. 设置中心：前端新增 /settings 汇总页（admin），以卡片入口形式收纳字典/邮件模板/自动化规则/标签/渠道/周报订阅；侧边栏加"系统设置"一级菜单指向该页，各子页面路由改为该页内跳转或保留独立路由但取消 hidden。

约束：最小变更；中文注释；别名导入；不用 any；周报数据口径与 stats 页面完全一致（必须复用 service，不要另写 SQL）。

验收标准：周报生成逻辑有单测（数据口径与 stats service 输出一致）；SMTP 未配置时任务静默跳过；订阅 CRUD 有集成测试；设置中心菜单可见且权限正确（member 不可见）；现有测试全部通过。
```

---

## 附：交回审核的方式

每完成一个阶段（或一条提示词），告诉我"阶段 X 完成"（或贴出 `git diff` / 变更文件清单），我会按以下维度审核：

1. 验收标准逐条核对（测试是否真的补了、是否真的通过）
2. 是否违反最小变更原则（改了多少无关代码）
3. 权限/安全逻辑是否有绕过路径
4. migration、env、注释、别名导入等规范项
