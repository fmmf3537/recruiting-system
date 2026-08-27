# 招聘管理系统（ATS）综合审计报告

> **审计对象**：`recruiting-system`（Monorepo：`client` + `server` + `mobile` + `e2e`）
> **代码规模**：后端 ~30 个 service/controller/route 文件，~1500 行级单文件（`candidate.service.ts` 单独超过 1500 行），前端 ~50 个 Vue 页面/组件，移动端 ~25 个 Vue 页面
> **整体结论**：项目已进入 **功能可用、可上线** 的成熟期（已经有完整的 PC + 飞书 H5 移动端 + E2E + Swagger 文档 + 个保法合规、可见性隔离、Offer 审批流、定时任务、LLM 简历解析、Pipeline 模板、AI 人岗匹配、邮件模板与自动化规则、结构化面试评估、提醒中心等高阶能力），但在 **生产稳定性、可观测性、AI 深度集成、数据治理、协同编辑、招聘全景智能化** 五个方向仍存在显著差距。下面给出完整审计。

---

## 一、整体评价（按维度评分）

| 维度 | 评分 | 说明 |
|------|------|------|
| 业务完整度 | ⭐⭐⭐⭐⭐ | ATS 全流程覆盖到位 |
| 安全合规 | ⭐⭐⭐⭐ | JWT 吊销、可见性、XSS、个保法已做；仍有改进空间 |
| 代码质量 | ⭐⭐⭐⭐ | 三层架构 + Service 单测；个别 service 臃肿 |
| 测试覆盖 | ⭐⭐⭐ | 单测覆盖核心 service，E2E 较完整，但 integration 较少 |
| 可观测性 / 运维 | ⭐⭐ | 几乎没有结构化日志、trace、metric、健康检查 |
| AI 智能深度 | ⭐⭐ | 仅「简历解析 + 简单匹配」，距现代 AI Native ATS 差距明显 |
| 体验 / 前端设计 | ⭐⭐⭐⭐ | Element Plus 标准企业风；缺看板拖拽、空状态、高级筛选 |
| DevOps | ⭐⭐⭐⭐ | Docker Compose、Nginx、CI 脚本齐备；缺 CI/CD pipeline 配置 |

---

## 二、技术审计：发现的问题与漏洞

### 2.1 后端架构问题

#### 🔴 P0：缺失结构化日志 / Trace / 监控

**现状**：仅 `morgan('combined'/'dev')` 打印 HTTP 日志，业务代码几乎全是 `console.log/console.error`，且混用了开发/生产不一致的日志输出。

**问题**：
- 排障只能看 stdout，无法按 `userId/candidateId/businessId` 检索
- 没有 APM（响应时间、慢查询、错误率）
- 没有审计日志的统一查询/导出接口
- 定时任务失败只在控制台输出，无重试、无告警

**风险**：生产出问题时无法定位；定时任务静默失败；个保法合规审计难举证。

**建议**：
- 引入 `pino` 替换 `console.*`，统一日志格式（JSON）
- 引入 `OpenTelemetry` 接入 trace
- 接入 Prometheus 指标（`prom-client`），关键接口 QPS/P95/错误率
- `OperationLog` 现状不可被业务用户检索；增加 `GET /api/operation-logs` 管理后台接口（admin）

---

#### 🔴 P0：`upload.ts` 顶层 `await fs.mkdir(...)` 阻塞模块加载

**现状**（`server/src/routes/upload.ts:28`）：
```ts
const uploadDir = path.resolve(process.cwd(), env.UPLOAD_DIR);
await fs.mkdir(uploadDir, { recursive: true });  // 顶层 await
```

在 ES Module 中顶层 await 在 import 阶段执行，会拖慢整个模块树；并且 `await` 失败时进程启动失败。

**修复**：放到 `app.ts` 启动 hook 或 server 启动前执行。

---

#### 🔴 P0：部分 Service 文件严重臃肿（>1000 行）

- `candidate.service.ts`：**1522 行**，单个类承担了"CRUD + 推进阶段 + 批量操作 + 工作经历 + 面试反馈 + 近期动态 + 重复检查"等 6+ 个职责
- `stats.service.ts`：725 行，多个不同维度的统计混在一个类
- `offer.service.ts`：678 行（已审计前 100 行，含完整的审批流，结构复杂）

**问题**：
- 单测难以拆分 mock，类内部依赖过重
- 任何修改都要触动整个文件，代码评审负担重
- 违背"单一职责"

**修复**：
- `candidate.service.ts` 拆分为：`CandidateCRUDService` + `CandidateStageService` + `CandidateBatchService` + `WorkHistoryService` + `InterviewFeedbackService` + `ActivityService`
- `stats.service.ts` 拆分为 `DashboardStatsService` / `FunnelStatsService` / `WorkloadStatsService` / `JobTimeStatsService` / `CycleStatsService`
- 同时引入 `Repository` 层封装 Prisma 查询，进一步解耦

---

#### 🟠 P1：JWT Payload 缺少 `iat` 与 `tokenVersion` 校验时机问题

**现状**：`auth.ts:39-67` 每次请求都做 `prisma.user.findUnique`，**没有任何内存缓存**，高并发下数据库压力巨大。

**影响**：登录态是热路径，N 个在线用户就 N 次/请求的 user 表查询。

**建议**：
- 用 `ioredis-mock` 或自实现的 LRU 缓存 user 信息（60s TTL），可减少 80%+ DB 查询
- 或在登录后把 `role/department/tokenVersion` 写入 Redis，`authenticate` 中间件先查 Redis 再 fallback DB

---

#### 🟠 P1：候选人可见性查询存在 N+1 风险

**现状**：`candidate.service.ts:300-345` 在批量推进/筛选时，单独走 `prisma.candidateJob.findMany`、`candidateTag.groupBy`，多次小查询拼接成 where。

**风险**：候选人数据量大时（万级以上）性能下降明显。

**建议**：
- 用 Prisma 嵌套 where 或 SQL CTE 合并
- 对 `stage_record` 增加复合索引 `(candidateId, stage)` / `(status, enteredAt)`，使最新阶段查询走索引而非 window function

---

#### 🟠 P1：`stats.service.ts` 的趋势/漏斗查询循环发请求

**现状**：`stats.service.ts:201-212` 用 `for` 循环 `prisma.candidate.count()` 7 次查询 7 天数据。

**修复**：用 `prisma.$queryRaw` 一次性按日期分组返回：

```sql
SELECT date_trunc('day', "createdAt") AS day, COUNT(*)::int AS count
FROM candidate WHERE "createdAt" >= $1 AND "createdAt" < $2 GROUP BY day ORDER BY day;
```

---

#### 🟡 P2：`validate.ts` 没有对所有路由的输入做长度限制

- 前端传入的 `description`、`requirements`、`feedbackContent` 等富文本字段理论上没有上限
- `req.body` 全局限制 10MB 已经做了，但如果攻击者构造 10MB 的超大 JSON 会严重消耗 CPU

**建议**：
- 每个 Zod schema 显式 `.max(N)`（如富文本最大 50KB）
- 关键字段加 `.regex()` / `.refine()`

---

#### 🟡 P2：定时任务无法分布式部署

**现状**：`lib/cron.ts` 用 `node-cron` 直接注册到当前进程。多实例部署时会**重复触发**（虽然有 `dedupeKey` 唯一索引兜底，但通知会发两次数据库写入竞争）。

**建议**：
- 上规模时改用 BullMQ + `QueueScheduler` 或 `pg_cron` / 外部 scheduler

---

#### 🟡 P2：Swagger 注释覆盖率几乎为 0

**现状**：`lib/swagger.ts` 在 `routes/*.ts` 和 `controllers/*.ts` 中查找 JSDoc 注释，但代码里几乎没有 `@openapi` 块。

**影响**：开发协作时只能靠口头传递 API 契约。

**建议**：分模块渐进补齐 JSDoc，至少先把候选人、职位、Offer、统计四类核心接口文档化。

---

### 2.2 安全相关问题

#### 🔴 P0：日志可能泄漏 PII（个人可识别信息）

**现状**：`auth.ts`、`candidate.controller.ts`、`stats.service.ts` 大量使用 `console.log('[getRecentActivities] stageRecords count:', ...)`，且错误处理时打印 `err.stack`。

**个保法风险**：开发/生产环境若将日志推送至 ELK / Loki 等第三方，员工姓名、手机号、邮箱可能外泄。

**修复**：
- 引入 `pino` + redact：`redact: ['*.phone', '*.email', '*.name', 'req.headers.authorization']`
- 不在错误堆栈中暴露业务字段

---

#### 🟠 P1：JWT 在 localStorage + query string 双通道

**现状**：`auth.ts:81-91` `extractTokenFromQuery` 允许 `?token=xxx` 传递 JWT，供飞书预览等场景。

**风险**：
- JWT 进入 URL，可能被 CDN/反向代理/Referer 头/浏览器历史泄漏
- 当前用 `X-Accel-Redirect` 控制下载，但移动端 `Request URL` 仍带 token

**建议**：
- 文件下载改为 `POST /api/files/:filename/preview`（header 鉴权），返回短期预签名 URL（10 分钟过期）
- Web 端用 Cookie + `httpOnly` + `secure`，避免 localStorage

---

#### 🟠 P1：跨域请求 Cookie / CSRF 防护不完整

**现状**：`app.ts:21-25` CORS 用了 `credentials: true`，但 JWT 仍然是 localStorage，不依赖 Cookie，所以现状尚可接受。

**未来风险**：若改成 Cookie 鉴权，需要同时引入 CSRF Token（`csurf` 或 SameSite=Strict）。

---

#### 🟠 P1：登录限流是按 IP，但生产在 Nginx 反代后 IP 不准确

**现状**：`auth.ts:17-27` `loginLimiter` 用 `express-rate-limit`，依赖 `req.ip`。`app.ts:45` 已经 `trust proxy = 1`，但需要 Nginx 真正传 `X-Forwarded-For`。

**建议**：
- 在 `trust proxy` 配置中明确指定可信代理数量或 IP 段，避免用户伪造 `X-Forwarded-For` 绕过限流
- 增加登录失败计数（按 `email` 而非 IP），防爆破单个账号

---

#### 🟠 P1：候选人列表查询的 `keyword` 字段无大小限制

**现状**：`candidate.service.ts:307-313`：

```ts
{ name: { contains: keyword, mode: 'insensitive' } },
{ phone: { contains: keyword, mode: 'insensitive' } },
{ email: { contains: keyword, mode: 'insensitive' } },
```

- `mode: 'insensitive'` 走全表扫描，无法命中 B-tree 索引
- 没有最小/最大长度限制，攻击者可发 1MB keyword

**修复**：
- 关键词最大 100 字符，Zod 校验
- 用 `pg_trgm` 索引 + ILIKE，或引入全文搜索（Postgres `tsvector`）

---

#### 🟡 P2：`pdf-parse` 旧版本（1.1.4）有已知内存泄漏问题

**现状**：`package.json:46` `pdf-parse: 1.1.4` 是 2020 年的版本，最新稳定版 1.1.7 修复了若干内存问题。

**建议**：升级到 `1.1.7+`，并考虑用 `pdfjs-dist` 替换（更活跃维护）。

---

#### 🟡 P2：飞书免登 `/api/auth/feishu/login` 不限 user 的活跃状态

**现状**：只要 `feishuEmployeeId` 命中就发 token，没有校验账号是否被禁用。

**建议**：增加 `User.deleted` / `User.status` 字段，离职员工被禁用后无法登录。

---

### 2.3 数据模型（`schema.prisma`）问题

#### 🟠 P1：候选人缺少"软删除"机制

**现状**：删除候选人走 `prisma.candidate.delete`，级联删除所有阶段记录、面试反馈、Offer 等，**不可恢复**。

**个保法风险**：删除后无法举证已删除；个保法要求留存操作日志。

**建议**：
- 增加 `Candidate.deletedAt: DateTime?`，列表默认过滤 `deletedAt: null`，admin 可在回收站恢复
- 增加 `audit_archive` 表存已删除数据快照

---

#### 🟠 P1：`Job.departments: Json` 是反范式设计

**现状**：部门用 JSON 数组存，存在：
1. 无法用 FK 约束保证部门值有效
2. 数组查询（`array_contains`）性能低于 join
3. 部门字典变更时无法级联更新

**建议**：
- 改为 `Department` 表 + `JobDepartment` 关联表
- 同时统一部门在 `User.department` 中的取值

---

#### 🟡 P2：`StageRecord.stage` 是字符串，没有 FK 约束

**现状**：阶段名（"初筛"、"复试"等）是 free string。Pipeline 模板虽然可以约束，但存量数据校验很弱。

**风险**：用户推送一个 typo 阶段（如"复试"vs"复式"），旧数据无法清洗。

**建议**：增加 `Stage` 表，stage 字段改为 FK；保留 PipelineTemplate.stages 排序能力。

---

#### 🟡 P2：`placement`/`source`/`education` 等枚举字段也是字符串

**现状**：渠道、学历、状态等都用 `String` 存。代码中用魔法字符串比较（如 `'passed'`、`'rejected'`、`'accepted'`）。

**建议**：
- 抽公共枚举常量
- 在 Prisma 层用 `enum`（Postgres 原生 enum 性能更好）

---

#### 🟡 P2：`UploadRecord` 没有 `deletedAt`，匿名化时未联动删除文件记录

**现状**：`anonymize.service.ts` 只删 `candidate.resumeUrl`，未删 `UploadRecord`，导致幽灵数据。

**修复**：匿名化时同时软删 UploadRecord，或建立 FK 反向引用。

---

### 2.4 前端架构问题

#### 🔴 P0：路由懒加载 + `unplugin-auto-import` 与 ESLint 兼容性隐患

**现状**：使用了 `unplugin-auto-import` 自动引入 Element Plus API，但没有与之配套的 `auto-imports.d.ts` ESLint 兼容检查。

**可能问题**：CI 上 `lint:check` 报错但本地不报错。

---

#### 🟠 P1：`request.ts` 错误处理吞掉了 response body

**现状**：

```ts
ElMessage.error(errorData.error || `请求失败 (${status})`);
return Promise.reject(error);
```

前端拿到 `error` 但具体业务码（`code: 'USER_NOT_BOUND'` 等）丢失。

**建议**：抛出包含 `code`、`message` 的业务错误类，前端按 `code` 分支处理。

---

#### 🟠 P1：`/interviews/my` 与 `/interviews/:id` 的路由顺序问题

**现状**（`router/index.ts:124-138`）：注释已经提示"必须放在动态路由之前"，但 Vue Router 4 在 history 模式下不能保证动态参数化的行为。

**建议**：路由用 `:id(\\d+)` 等正则限制；或者全部改成 query 传参。

---

#### 🟠 P1：所有页面缺少"空状态"与"加载骨架屏"

**现状**：候选人列表、面试列表等只在数据为空时显示 `el-empty`，没有 skeleton 骨架。

**建议**：增加 `el-skeleton` 组件，提升感知性能。

---

#### 🟠 P1：没有"暗色模式"

**现状**：Element Plus 2.5+ 原生支持暗色，但本项目没有切换机制。

**建议**：增加 `theme switcher`，跟随系统设置。

---

#### 🟡 P2：移动端没有错误边界

**现状**：`mobile/src/App.vue` 只有 `<router-view />`，没有 `<ErrorBoundary>`。

**修复**：增加全局错误捕获，防止单个页面崩溃导致白屏。

---

#### 🟡 P2：`request.ts` 没有请求去重 / 取消机制

**现状**：快速切换列表筛选时，连续发多个 `/api/candidates` 请求，可能后发先至导致 UI 错乱。

**建议**：用 `AbortController` 取消上一个请求，或引入 `axios-cancel` 中间件。

---

### 2.5 移动端 / 飞书集成

#### 🟡 P2：飞书 SDK 通过 CDN 注入，没有降级方案

**现状**：`lib/feishu.ts` 大量代码做 `window.tt?.xxx` 检测，但非飞书环境下许多功能（`scanQRCode`、`shareAppMessage`）直接 `reject`。

**建议**：
- 增加环境检测，非飞书环境降级为 Web 端 PWA
- 或为移动端增加独立的 Web 入口（不依赖飞书）

---

#### 🟡 P2：移动端首页 `home/index.vue` 与 candidates 列表数据冗余

**现状**：移动端的 candidates 列表基本是 PC 端的精简版，没有为手机屏幕专门设计。

**建议**：移动端专注于"审批/查看/快速备注"等高频场景，避免与 PC 功能完全重复。

---

### 2.6 测试覆盖

#### 🟠 P1：移动端测试仅覆盖 utils + store，没有页面级测试

**现状**：mobile 只有 `format.test.ts`、`listpage.test.ts`、`user.store.test.ts` 三个测试文件。

**建议**：增加关键路径（上传简历、面试签到）的 Playwright 测试。

---

#### 🟡 P2：E2E 测试无失败用例 / 性能基线

**现状**：`e2e/tests/*` 11 个 spec，但没有可视化回归、压力测试。

**建议**：增加 `playwright-perf` 或 Lighthouse CI，监控关键页面 LCP/FCP。

---

#### 🟡 P2：`vitest.config.ts` 没有集成 `istanbul` 阈值门槛

**现状**：单测覆盖率文档声明 `lines >= 80%`, `branches >= 75%`，但实际没有 CI 卡控。

**修复**：在 `vitest.config.ts` 配 `coverage.thresholds`，CI 失败即拒绝合并。

---

## 三、功能审计：业务合理性

### 3.1 与 AI 时代主流 ATS 系统的差距

| 现代能力 | 本项目现状 | 差距 | 推荐产品参照 |
|----------|-----------|------|-------------|
| 简历智能解析（结构化） | ✅ LLM 抽取基础字段 | ❌ 不抽取项目经历细节、成果量化、获奖 | Greenhouse、八方锦程、八方达 |
| 简历去重 / 跨平台合并 | ✅ 手机号/邮箱查重 | ❌ 跨平台（LinkedIn/Boss/拉勾）数据汇聚 | Lever、八方锦程 |
| 人才画像 / 知识图谱 | ❌ 无 | ❌ | Moka、八方达 |
| AI 自动面试（语音/视频面试） | ❌ 无 | ❌ **重大缺失** | HireVue、八方锦程 |
| AI 评估报告（综合打分） | ⚠️ 维度打分靠面试官手动 | ❌ | HireVue、Pymetrics |
| 智能推荐（向候选人推荐职位） | ❌ 无 | ❌ | LinkedIn、Boss 直聘 |
| 招聘漏斗预测（forecast hiring） | ❌ 无 | ❌ | Greenhouse Forecast |
| 候选人体验（自助门户） | ❌ 无 | ❌ **重大缺失** | Workday、八方达 |
| 视频面试集成 | ❌ 仅有 location 字段 | ❌ | Zoom、Teams 集成 |
| 内推门户 / 奖励追踪 | ⚠️ 仅 referrer 字段 | ⚠️ | 八方锦程、ReferralCandy |
| 多语言 / 国际化 | ❌ 全部中文硬编码 | ❌ | Greenhouse |
| HRIS 集成（Workday/SAP） | ❌ 无 | ⚠️ | 大型企业必需 |
| 雇主品牌 / 招聘官网 | ❌ 无 | ⚠️ | Phenom、八方达 |
| 招聘营销（Campaigns） | ❌ 无 | ⚠️ | Phenom |
| 数据看板 / 实时仪表盘 | ⚠️ 基础漏斗 + 工作量 | ⚠️ | Tableau 嵌入、Looker |
| 移动端（原生体验） | ⚠️ 飞书 H5 够用，但缺独立 App | ⚠️ | iCIMS、八方达 |
| SSO / OAuth 企业登录 | ⚠️ 飞书 | ⚠️ | Okta、Azure AD |
| 候选人 NPS / 体验调查 | ❌ 无 | ❌ | SurveryMonkey |
| 多租户 SaaS | ❌ 单租户 | ⚠️ | 多为 toB 必需 |
| 角色管理（RBAC 细分） | ❌ 仅 admin/member 二级 | ❌ **重大缺失** | 自定义角色权限 |

### 3.2 功能缺失清单（按优先级）

#### 🔴 缺失 #1：候选人自助门户（Candidate Portal）

**场景**：候选人收到面试邮件 → 点击链接 → 进入门户 → 上传简历 / 查进度 / 接受 Offer / 签电子合同。

**现状**：候选人完全被动，所有操作由 HR 代劳。

**建议**：
- 新增 `CandidatePortal` 表（候选人登录 token）
- 新增 `/portal/*` 公开路由（仅校验 magic link）
- 自助上传简历、查看状态、签署 Offer

---

#### 🔴 缺失 #2：RBAC 细分权限

**现状**：仅 `admin` / `member` 两级，无法表达：
- "只能查看本部门职位"
- "不能修改薪资"
- "只读不能写"

**建议**：
- 增加 `Role` 表 + `Permission` 表 + `RolePermission` 关联
- 路由级 + 字段级权限
- `authorize('permission:offer:approve')` 中间件

---

#### 🟠 缺失 #3：AI 视频面试

**场景**：初筛阶段让候选人完成 AI 视频面试，自动生成评估报告。

**现状**：完全没有。

**建议**：
- 与 HireVue / 自研 ASR/TTS 集成
- 模型：L1 行为分析（眼神、表情）+ L2 语义理解（岗位技能点）+ L3 综合评估
- 落地难度大，建议先做 **集成第三方** 而非自研

---

#### 🟠 缺失 #4：面试官日程与日历集成

**场景**：HR 安排面试时，应该看到面试官的 Google Calendar / 飞书日历 空闲时间。

**现状**：仅做应用内的"面试冲突"检测（`interview-scheduler.service.ts`）。

**建议**：
- 集成飞书日历 API（已有飞书 SDK 基础）
- 集成 Google Calendar / Outlook
- 自动读取空闲时段，单击排面试

---

#### 🟠 缺失 #5：项目级 / 技术评估（Take-home Assignment）

**场景**：技术岗面试前需要候选人完成 1-2 小时编程测试 / Case study。

**现状**：只有 `tag`、`skill` 字段，没有 assignment 流程。

**建议**：
- 新增 `Assignment` 表（关联 candidate + job，含题面、提交物、评分）
- 集成 CodeRunner（如 Sphere Engine）或自建简易评测

---

#### 🟡 缺失 #6：候选人 NPS / 体验调研

**场景**：候选人被淘汰后，自动发 NPS 调研，反馈体验。

**建议**：
- 新增 `Survey` 表 + 定时任务发送
- 结果写入统计报表

---

#### 🟡 缺失 #7：内部门户的"职位推荐"（向候选人推送）

**建议**：
- 增加"订阅职位"功能，候选人订阅感兴趣的方向
- 定时推送新职位

---

#### 🟡 缺失 #8：智能问答 Chatbot

**建议**：
- 嵌入 LLM 客服，回答 HR 常见问题（如"我这个月招了几个？""部门 HC 完成率多少？"）
- 自然语言 → SQL/统计 API

---

#### 🟡 缺失 #9：操作历史回放（Stage Timeline 增强）

**现状**：`stageRecord` + `interviewFeedback` + `operationLog` 数据齐，但前端只在候选人详情页展示。

**建议**：
- 全局"动态流"页面（按部门/时间线浏览）
- 方便审计和回顾

---

#### 🟡 缺失 #10：候选人画像（Knowledge Graph）

**建议**：
- 候选人实体 → 公司 → 学校 → 行业 多跳关联
- 用图数据库（Neo4j）或 Postgres ltree 扩展

---

## 四、改进方案与实施计划

### 阶段 0：紧急修复（1-2 周）

| 任务 | 工作量 | 优先级 |
|------|--------|--------|
| 修复 `upload.ts` 顶层 await | 0.5d | P0 |
| 引入 pino 日志，redact PII 字段 | 2d | P0 |
| JWT user 缓存（Redis）减少 DB 查询 | 1d | P0 |
| `candidate.service.ts` 拆分（至少拆出 WorkHistory） | 3d | P0 |
| Prisma `enum` 改造 + 部门表 | 5d | P1 |
| 给所有查询字段加 Zod `.max()` 长度限制 | 2d | P1 |

### 阶段 1：可观测性与稳定性（3-4 周）

| 任务 | 工作量 |
|------|--------|
| 接入 OpenTelemetry（trace） | 5d |
| 接入 Prometheus + Grafana 看板 | 5d |
| Sentry / 阿里云 ARMS 错误聚合 | 2d |
| `/api/health` 增强（DB + Redis + BullMQ 状态） | 1d |
| 关键 SQL 索引梳理 + EXPLAIN ANALYZE | 3d |
| 单元测试覆盖率门槛纳入 CI | 2d |
| 移动端 E2E 测试覆盖 | 3d |

### 阶段 2：业务功能增强（4-6 周）

| 任务 | 工作量 |
|------|--------|
| RBAC 权限系统 | 10d |
| 候选人自助门户（Candidate Portal） | 10d |
| AI 面试集成（先接 HireVue/自研 MVP） | 15d |
| 飞书日历 / Google Calendar 集成 | 5d |
| 候选人软删除 + 回收站 | 3d |
| 智能问答 Chatbot（接入 LLM） | 7d |

### 阶段 3：智能化深度（6-8 周）

| 任务 | 工作量 |
|------|--------|
| 简历项目经历深度解析（LLM Prompt 工程） | 7d |
| AI 自动评估报告（综合 candidate + job） | 10d |
| 招聘漏斗预测（时间序列预测） | 10d |
| 知识图谱 / 候选人画像 | 15d |
| 多租户 SaaS 化（可选） | 30d |

### 阶段 4：体验打磨（持续）

| 任务 | 工作量 |
|------|--------|
| 前端骨架屏 / Loading 状态 | 3d |
| 暗色模式 | 3d |
| 移动端 PWA / 独立 App | 10d |
| i18n 国际化 | 5d |
| 可访问性（a11y） | 5d |

---

## 五、技术债务清单（按优先级）

```
[DEBT-001] candidate.service.ts 单文件 1522 行（需拆分）
[DEBT-002] stats.service.ts 7 天趋势循环查询（SQL 优化）
[DEBT-003] 大量 console.log 应改为 pino
[DEBT-004] UploadRecord 软删缺失（匿名化幽灵数据）
[DEBT-005] Job.departments 应改为关联表
[DEBT-006] StageRecord.stage 应改为 enum/FK
[DEBT-007] JWT user 查询无缓存
[DEBT-008] Swagger 注释几乎为 0
[DEBT-009] 前端缺少骨架屏
[DEBT-010] 错误处理吞掉业务 code
[DEBT-011] keyword 字段无限长
[DEBT-012] 定时任务无法分布式
[DEBT-013] pdf-parse 升级
[DEBT-014] 候选人硬删除（应软删）
[DEBT-015] 移动端错误边界
```

---

## 六、总结：关键洞察

**项目最大优点**：在有限时间内（看 git 历史像是 1-2 年内持续开发）做出了一个 **业务完整、合规到位、安全考虑周全** 的企业级 ATS，三端协同（PC Web + 飞书 H5 + 移动 H5）、Service 单测 + E2E + Swagger 文档体系齐全，在国内自研 ATS 中已属上乘。

**最需要补的短板**：
1. **可观测性** — 生产环境若无监控，事故响应会非常被动
2. **AI 深度** — 当前 AI 仅用于简历解析和基础匹配，距"AI Native"差 5 倍工作量
3. **候选人自助** — 候选人全靠 HR 代操作，规模化招聘时是瓶颈
4. **RBAC 细分** — admin/member 两级对中型企业已经不够

**最值得长期投入的方向**：
- AI 视频面试（招聘效能 3-5 倍提升）
- 知识图谱（跨平台人才库）
- 多租户 SaaS（toB 商业化）

**下一步建议**：先做 **阶段 0 紧急修复** + **阶段 1 可观测性**，这两块共约 25 个工作日，能把项目从"可用"提升到"可运营"。然后再决策是优先 RBAC（如果企业内部多部门使用）还是优先 AI 视频面试（如果对外商业化）。

---

> **审计时间**：基于代码快照（约 2026 年 4 月版本）
> **审计方法**：静态代码审查 + 架构评估 + 功能对比（参照 Greenhouse / Lever / Moka / HireVue 等业界产品）
> **未覆盖**：动态运行时测试、性能压测、安全渗透测试（如需可另行安排）
