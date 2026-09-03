# 阶段 5 AI 招聘增强 + HR 考核积分 - 完成总结

> **完成时间**：2026-09-03
> **范围**：5 个功能模块 / 12 个切片 / 1 个收尾
> **状态**：✅ 全部 12 个切片 + M6 收尾 commit 到 origin/master

---

## 阶段目标

按 PRD_阶段5 文档，将 AI 能力嵌入招聘全流程，同时把 HR 工作量化考核：

| 功能 | 价值 | AI 接入点 |
|------|------|---------|
| F1 JD 完善与辅助生成 | 提升 JD 质量、降低撰写成本 | polish（诊断+优化稿）/ draft（参考同类 JD 起草）|
| F2 简历自动打分 | 快速筛选、量化匹配度 | JD ↔ 简历结构化字段打分（多维度权重可配）|
| F3 面试问题大纲 | 标准化面试、提高信效度 | 按考察方向 + 候选人背景生成题目 |
| F4 HR 考核积分 | 量化 HR 工作、激励优秀 | 事件埋点 + 业务分/过程分 + 周期聚合 |
| F5 猎头推荐通道 | 拓展渠道、简化猎头协作 | 公开链接 + 公开落地页 + 简历解析 |

---

## 完成情况

### 12 个切片 + M6 收尾

| # | 切片 | Commit | 范围 |
|---|------|--------|------|
| S0 | 工具链修复 | `7e46bb7` | vue-tsc 升级 / import resolver / lint 堆内存 |
| F2-S | 简历打分服务端 | `861d850` | AiMatchScore 表 + 队列 worker + 3 接口 + 创建候选人自动触发 |
| F2-C | 简历打分前端 | `06f8cbd` | match-score api + MatchScoreCard 组件 + 字典页挂载 |
| F1-S | JD 辅助服务端 | `1da4608` | jd-assist service（polish/draft）+ 2 接口 + 限流 |
| F1-C | JD 辅助前端 | `6f6ff4a` | jd-assist api + JdPolishDialog + JdDraftDialog + JobForm 挂载 |
| F3-S | 面试大纲服务端 | `438957f` | InterviewQuestionOutline 表 + focusType + 3 接口 + 精细权限 |
| F3-C | 面试大纲前端 | `bcc1d9a` | interview api 补类型 + QuestionOutlineCard + 详情页挂载 |
| F5-S | 猎头通道服务端 | `cccc76c` | Agency/AgencyLink 两表 + 6 管理接口 + 公开 GET/POST 接口 |
| F5-C | 猎头通道前端 | `744960e` | agency api + Agencies 管理页 + 公开落地页 + 路由 |
| F4-S1 | 考核事件埋点 | `634c3c3` | HrScoreEvent/Snapshot 两表 + emitScoreEvent 发射器 + 8 条规则植入 |
| F4-S2 | 考核周期聚合+接口 | `4515406` | 周期聚合 service + 团队/个人/报表接口 |
| F4-C | 考核前端 | `c3bcf50` | 我的积分 + 团队考核 + 报表 + 规则配置 + Dashboard 卡 |
| M6 | 合规+prompt+文档 | （本次）| consentNote AI 处理 + 4 prompt 敏感信息 + PHASE5 文档 + DEPLOY 补充 |

合计 13 个 commit（含 M6 收尾）。

### 累计指标

| 指标 | 数值 |
|------|------|
| 服务端测试 | 44 文件 / 427 用例 → **54 文件 / 561 用例**（+10 文件 / +134 用例）|
| 代码增量 | ~3500 行（含测试） |
| 新增 service | 9 个（match-score / jd-assist / interview-outline / hr-score / referral / agency / hr-score-aggregator 等）|
| 新增表 | 6 张（AiMatchScore / InterviewQuestionOutline / Agency / AgencyLink / HrScoreEvent / HrScoreSnapshot）|
| 新增 Prisma migration | 5 个（待人工 apply）|
| 新增字典分类 | 3 个（matching_dimension / interview_focus_type / hr_score_rule）|
| 新增权限点 | 4 个（ai:match-score / ai:jd-assist / ai:interview-outline / agency:manage）|
| 新增前端页面 | 1 个 views/hr-score（多 Tab）|
| 新增 env 变量 | 4 个（HR_SCORE_CRON / HR_SCORE_BUSINESS_WEIGHT / HR_SCORE_PROCESS_WEIGHT / HR_SCORE_TALENT_OPS_WEEKLY）|

---

## 5 大功能实现要点

### F1 JD 完善与辅助生成
- **polish**：诊断现有 JD 的问题（severity 三档），并给出完整优化稿
- **draft**：参考同 type 最近 3 份非关闭职位 JD 风格起草
- **限流**：2 接口共享 15min/20 次
- **fail-safe**：parse 失败与结构不合格各重试 1 次，仍失败抛 500
- **审计**：无论成功失败均留 OperationLog（detail 不含 JD 全文）

### F2 简历自动打分
- **多维度权重**：默认 5 维度（专业技能/经验/学历/稳定性/加分项），权重可由字典覆盖
- **服务端重算**：不信任 LLM 自报的 overallScore/grade，由 mergeScores 按权重重算 → 杜绝分数幻觉
- **Hash 去重**：resumeHash + jdHash 双 hash 命中复用旧记录，省 LLM 调用费
- **stale 标记**：JD 变更后自动置 stale，前端可见「已过期」
- **自动触发**：创建候选人关联职位时异步入队（F2-S 钩子）

### F3 面试问题大纲
- **版本化**：每次生成独立 version（上限 10 版），便于对比与回滚
- **考察方向**：字典可配（HR面/技术面/综合面/管理面/交叉面），侧重指引内置 prompt 常量
- **上下文组装**：候选人结构化字段 + JD + 前几轮评估/反馈 + AiMatchScore + 上一版（再生成时）
- **精细权限**：admin 直通 / hr 走候选人可见性 / hiring_manager + interviewer 须是该场面试官

### F4 HR 考核积分
- **业务分 vs 过程分**：70/30 默认权重（可调），按事件即时积分
- **8 条埋点规则**（hr_score_rule 字典）：简历上传+2 / 首次推进+3 / 猎头渠道+5 / 面试完成+10 / Offer发送+30 / 入职+50 / Offer拒-10 / 试用期淘汰-20
- **周期聚合**：日快照表 + 周/月聚合 service
- **fail-safe 双层**：emit 失败不阻塞主流程；唯一约束 P2002 幂等去重
- **负分归属**：candidate.createdById（非触发人），避免刷分

### F5 猎头推荐通道
- **公开无鉴权**：首个免登录接口 GET/POST `/api/referral/:token`，四态失效统一 410 固定文案
- **安全设计**：token = crypto.randomBytes(16) 32 位 hex / 限流 15min10 次(IP) / z.literal(true) 授权必填 / magic bytes 校验文件类型 / UUID 重命名
- **疑似重复脱敏**：仅 sourceNote 标记，不向公开端回显已存在候选人信息
- **绕开 AI 钩子**：referral 创建候选人时不传 jobIds，避免猎头推荐触发打分（决策 A1）

---

## 关键技术决策

### 1. AI 打分服务端重算（防 LLM 幻觉）
不信任 LLM 自报的 overallScore/grade；mergeScores 按字典权重重算 → 同一份简历输入永远得到同一分数（受 hash 去重保护）。

### 2. Hash 去重省 LLM 调用费
resumeHash + jdHash 双 hash；任一未变 → 直接复用旧记录 + OperationLog 留痕（action: `ai_match_score`, deduped: true）。

### 3. 公开路由安全设计（F5 核心）
- token 长度 32 位 hex（无枚举空间）
- 四态失效统一 410 固定文案（不泄露细分原因）
- 限流 15min/IP 严格收紧
- 文件 magic bytes 校验 + UUID 重命名
- zod 严格校验 + 邮箱空串跳过查重维度
- 成功响应固定文案（含/不含 candidateId 决策 B1）

### 4. 过程分 fail-safe 双层
- 第一层：emitScoreEvent 内 try/catch，失败不阻塞主流程
- 第二层：HrScoreEvent 唯一约束 P2002 → catch 后视为已存在
- 负分归属 candidate.createdById：避免"故意刷负分"刷对手

### 5. LLM prompt 统一加敏感信息指令（M6）
所有 4 个 AI 功能的 systemPrompt 末尾追加「不要回显候选人手机号、邮箱等个人敏感联系方式」指令，满足合规要求。

### 6. consentNote 溯源 + AI 处理双覆盖（M6）
- 旧文案只声明"已获授权"，不覆盖"发送给第三方 AI"
- 新文案加"并知悉简历可能经第三方 AI 服务处理（用于简历解析、人岗匹配等招聘用途）"
- 历史数据保留（不回溯），仅影响新增候选人

---

## 验收基线

| 命令 | 阶段 5 收尾目标 |
|------|----------------|
| `server pnpm test` | 54 文件 / 561 用例全过 |
| `server pnpm build`（tsc）| 0 错误 |
| `server pnpm lint:check` | 不新增 error / warning（存量 15567e / 240w 不得新增）|
| `client pnpm type-check` | 不新增 78 个存量 TS 错误 |
| `client pnpm lint:check` | 不新增 137 errors / 231 warnings |
| `git diff --stat -- client e2e server/prisma` | 0 行（M6 红线）|

M6 收尾改动影响范围：
- `server/src/services/referral.service.ts`：1 行 consentNote 文案
- `server/src/lib/llm.ts`：1 段 systemPrompt（追加敏感信息指令）
- `server/src/services/match-score.service.ts`：1 行 systemPrompt
- `server/src/services/jd-assist.service.ts`：2 段 systemPrompt（polish + draft）
- `server/src/services/interview-outline.service.ts`：1 段 systemPrompt
- `.env.example`：末尾追加"阶段 5：HR 考核积分"分组（仅追加，不改已有行）
- `DEPLOY.md`：追加"阶段 5 部署补充"段
- `PHASE5_SUMMARY.md`：本文档（新增）

---

## 遗留与已知问题

### F1 JD 辅助
1. **同 type 参考 JD 数量写死 3**：调高可能超 token，未做配置化
2. **草稿 Markdown 风格**：未做可视化预览，前端仅显示原文

### F2 简历打分
1. **维度权重字典修改后，旧打分不自动重算**：前端 stale 标记可见，但不会自动触发刷新（需手动"重新打分"）
2. **AI 评分与人工评分不一致**：UI 已有差异化展示，但不阻断人工决策

### F3 面试大纲
1. **版本上限 10 写死**：超过后必须手动删除旧版本，未做软删除 + 归档
2. **调整指令模式再生成**：依赖上一版 outline 全文，重生成大版本可能 token 爆

### F4 HR 考核
1. **试用期淘汰事件来源**：依赖 onboarding 的状态变化，未与 HR 系统对接
2. **业务分/过程分权重改后不回溯**：历史快照按当时权重计算，新权重仅影响后续

### F5 猎头通道
1. **无单链接停用 UI**：disableAgencyLink service 已导出，前端缺列表接口
2. **公开接口限流按 IP**：反代 / 共享 IP 场景下可能被误伤，未做用户级限流

### M6 合规
1. **历史候选人 consentNote 不回溯**：存量猎头推荐候选人无 AI 处理声明
2. **未做强制拦截**：存量候选人再次触发 AI 打分/解析时，service 层**不强制要求**补充授权（避免误伤存量流程），需人工跟进

---

## 团队上手指南

### Dev 环境试用阶段 5 全功能

```bash
# 1. 启动 dev（Docker 或本机 Node）
docker-compose up -d postgres redis
cd server && pnpm dev

# 2. 应用所有阶段 5 migration（首次）
cd server && npx prisma migrate deploy

# 3. 启动前端
cd client && pnpm dev  # 端口 5174

# 4. 登录 hr 账号（admin@test.local / admin123）进入
```

### 5 大功能试用步骤

#### F1 JD 完善与辅助生成
1. 进入「职位管理」→「新建职位」或编辑现有职位
2. 在「职位描述」/「职位要求」输入文本
3. 点击「AI 诊断优化」→ 查看问题清单 + 优化稿（确认后写入表单）
4. 或点击「AI 辅助起草」→ 填写标题/部门/职级/类型 → 可选「自由描述」→ 生成草稿

#### F2 简历自动打分
1. 进入候选人详情页 → 「AI 匹配打分」卡片
2. 关联职位后自动触发打分（异步队列，刷新可见）
3. 多维度权重可视化条形图；grade 标签（强烈推荐/推荐/待定/不推荐）
4. JD 变更后 stale 标记可见，可手动「重新打分」

#### F3 面试问题大纲
1. 进入面试详情页（已安排面试）→ 「面试问题大纲」卡片
2. 选择考察方向（HR面/技术面/综合面/管理面/交叉面）
3. 点击「生成大纲」→ LLM 返回 sections + questions
4. 可调整指令后再生成（不超 10 版）；手动微调定稿（不调 LLM）

#### F4 HR 考核积分
1. 进入「HR 考核」→ 我的积分 / 团队考核 / 报表
2. 个人页看业务分/过程分；团队页看全员排名；报表看周期趋势
3. admin 在「规则配置」可调整权重 / 字典项
4. HR_SCORE_CRON 启用后，每日 2:00 自动算过程分 + 日快照

#### F5 猎头推荐通道
1. 进入「猎头机构」→ 新建机构 → 生成推荐链接（默认 90 天有效期）
2. 复制公开链接 `/referral/:token` 发给猎头
3. 猎头在落地页填写候选人信息 + 上传简历 → 提交
4. 创建候选人后异步触发简历解析（与常规流程一致）
5. 「转化漏斗」查看推荐→入职转化数据

---

## 设计参考文档

| 文档 | 用途 |
|------|------|
| `PRD_阶段5`（根目录）| 阶段 5 PRD v1.0 / v1.1 / v1.2（JD 完善 / 简历打分 / 面试大纲 / HR 考核 / 猎头通道）|
| `docs/cursor-prompts/M6.md` | M6 收尾提示词（合规文案 + prompt 调优 + 文档 + 部署）|
| `docs/cursor-prompts/F2-S.md` `F2-C.md` | 简历打分切片提示词（服务端 / 前端）|
| `docs/cursor-prompts/F1-S.md` `F1-C.md` | JD 辅助切片提示词 |
| `docs/cursor-prompts/F3-S.md` `F3-C.md` | 面试大纲切片提示词 |
| `docs/cursor-prompts/F5-S.md` `F5-C.md` | 猎头通道切片提示词 |
| `docs/cursor-prompts/F4-S1.md` `F4-S2.md` `F4-C.md` | HR 考核切片提示词 |
| `docs/cursor-prompts/S0.md` | 工具链修复切片提示词 |
| `docs/切片自动化接力使用手册.md` | runner 启停 / 边界 / 故障速查 |
| `AUDIT_REPORT.md` | 原始审计（阶段 5 是 v3.x 范围）|
| `AGENTS.md` | 项目 AI 编码助手规范 + 验收基线表 |
| `PHASE3_SUMMARY.md` `PHASE4_SUMMARY.md` | 前序阶段总结（格式参考）|

---

## 阶段 5 总结

阶段 5 把项目从「4 角色协作平台」升级为「AI 增强 + 数据驱动的招聘系统」：

```
前（阶段 3）：
  admin / hr / hiring_manager / interviewer 各司其职

后（阶段 5）：
  + AI 能力：JD 自动诊断起草 / 简历打分 / 面试大纲生成
  + HR 考核：业务分 + 过程分 + 周期聚合 + 报表
  + 猎头通道：公开链接 + 落地页 + 转化漏斗
  + 合规兜底：consentNote 覆盖 AI 处理 + 4 prompt 敏感信息指令
```

**13 个生产 commit（M6 收尾在内）+ 561 个后端测试用例全过**。

阶段 5 完整收官。