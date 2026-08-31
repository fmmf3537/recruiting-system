# 阶段 3 角色化工作台 - 完成总结

> **完成时间**：2026-08-31
> **范围**：4 角色权限矩阵 + 2 个工作台 + 2 个 cron + 数据迁移
> **状态**：✅ 全部 5 个 PROMPT 完成并 commit 到 origin/master

---

## 🎯 阶段目标

把现有 2 角色（admin / member）扩展为 4 角色，配套业务工作台：

```
admin          系统管理员（不变）
hr             HR 招聘专员（原 member 等价，P-5 重命名）
hiring_manager 业务经理（用人部门）
interviewer   面试官
```

每个角色有专门的：
- 权限矩阵（中央化在 `role-permission.service.ts`）
- 候选人可见性约束（admin/hr 全部 / hiring_manager 本部门 / interviewer 自己的面试）
- 工作台（hiring_manager → /hiring，interviewer → /interview）
- 测试账号（dev 库 seed-test-users 预置）

---

## 📊 完成情况

### 5 个 PROMPT 全部 commit

| # | PROMPT | Commit | 核心改动 |
|---|--------|--------|---------|
| P-1 | 角色化扩展 + 权限矩阵 | `01a3526` | enum 扩展 + requireRole 中间件 + 候选人可见性 async |
| P-2 | 业务人员工作台 | `731bc74` | /api/hiring/overview 等 5 端点 + 4 Tab 前端 |
| P-3 | 面试官工作台 | `2b7b839` | /api/interview/{today,pending-evaluations,history} + 3 Tab 前端 |
| P-4 | 通知 cron 扩展 | `2506066` | hiring_manager 日报 + interviewer 24h 提醒 |
| P-5 | 数据迁移 + seed + 文档 | `670d10d` | member → hr migration + 4 角色 seed + README |

加上 2 个文档 commit（`5de0152`, `858ab06`），阶段 3 共 **7 个 commit**。

### 累计指标

| 指标 | 数值 |
|------|------|
| 测试用例 | 380 → **420**（+40 新测试） |
| 代码增量 | ~2200 行（含测试） |
| 新增 service | 4 个（role-permission / hiring-manager-digest / interviewer-reminder + P-2 工作台） |
| 新增中间件 | 1 个（requireRole / requireRoleAndPermission / requireMatrixPermission） |
| 新增路由端点 | 10+ 个（5 个 hiring + 4 个 interview + 1 个 onboarding） |
| 新增前端页面 | 1 个（views/interview/index.vue，291 行） |
| 数据迁移 | 2 个 migration（幂等） |
| Seed 脚本 | 1 个（4 角色 upsert，可重复执行） |

---

## 🎯 4 角色权限矩阵

### admin
- 全部权限（`['*']` 通配符）

### hr（HR 招聘专员）
- 候选人：read / create / update / delete / restore
- 职位：read / create / update / delete
- Offer：read / create / update / approve / reject
- 面试：read / create / update / delete
- 评估：read / create / update
- HC 申请 / 标签 / 字典 / 自动化 / 用户管理：全部

### hiring_manager（业务经理）
- 候选人：只读
- 职位：只读
- Offer：read + **approve**（本部门）
- 面试：只读
- 评估：read / **create / update**（P-1 fix，常兼一面/二面面试官）
- HC 申请：read + **create**
- 字典：只读

### interviewer（面试官）
- 候选人：受限读（只看到自己被指派的面试的候选人）
- 面试：受限读（同上）
- 评估：read / create / update

---

## 🏗️ 实现架构

### 后端关键文件

```
server/src/services/role-permission.service.ts   权限矩阵中央化
server/src/middleware/role.ts                  requireRole / requireRoleAndPermission / requireMatrixPermission
server/src/services/candidate-visibility.service.ts   async，可见性按角色收敛（interviewer 用 JS 过滤 JSON）
server/src/routes/hiring.ts                    业务工作台 5 端点
server/src/routes/interview.ts                  面试官工作台 4 端点
server/src/services/hiring-manager-digest.service.ts   日报 service
server/src/services/interviewer-reminder.service.ts  24h 提醒 service
server/src/lib/cron.ts                          注册 5 个 cron（3 旧 + 2 新）
server/prisma/seed-test-users.ts               4 角色 seed
server/prisma/migrations/20260901000000_add_user_role_hr/   enum 扩展
server/prisma/migrations/20260901000001_rename_member_to_hr/  数据迁移
```

### 前端关键文件

```
client/src/router/index.ts                       加 /hiring 和 /interview 路由（meta.role）
client/src/layouts/DefaultLayout.vue             侧栏按角色过滤
client/src/views/hiring/index.vue               业务工作台（4 Tab：总览 / 待审批 / 候选人 / 面试）
client/src/views/interview/index.vue             面试官工作台（3 Tab：今日 / 待填 / 历史）
client/src/stores/auth.ts                        member → hr 显示
```

---

## 🧪 4 角色测试账号

跑 `pnpm db:seed:test-users` 自动创建（upsert 幂等）：

| 账号 | 密码 | 角色 | 测试场景 |
|------|------|------|---------|
| `admin@test.local` | `admin123` | admin | 全部功能 |
| `hr@test.local` | `hr123456` | hr（原 member） | HR 工作台（管理员视角）|
| `hiring@test.local` | `hiring123` | hiring_manager（研发部）| 业务工作台（本部门数据）|
| `interviewer@test.local` | `interview123` | interviewer（研发部）| 面试官工作台（自己的面试）|

**重要**：第一次跑 hr@test.local 登录可能 500，因为 Prisma Client enum 缓存。**重启 server 后正常**。

---

## 🔧 工程亮点

### 1. Migration Guard 流程实战验证

阶段 3 是第 4-8 次实战 Guard（之前是 PROMPT-05 / 11 / 13 / 14）。每次都安全通过：

- **P-1**：enum 扩展 `ADD VALUE × 2`，5 项自检全 ✅
- **P-5**：纯 SQL 数据迁移 `UPDATE ... WHERE role = 'member'`，幂等
- **关键决策**：把 ADD VALUE 和 UPDATE 拆成 2 个 migration（PG 限制：同事务不能 ADD + 用）

### 2. Cursor 主动修正 prompt 错误

5 个 PROMPT 实战中，Cursor **主动修正了我 prompt 里的多个错误**：

| Prompt | 我 prompt 的错误 | Cursor 的修正 |
|--------|----------------|--------------|
| P-1 | 未指定 hiring_manager 是否能填评估 | 按 fix 加 `evaluation:create/update` |
| P-2 | `Offer.job` 当外键用（实际 Offer 没 job 外键）| 经 `Candidate.candidateJobs` 间接过滤 |
| P-2 | `array_contains: department`（标量） | `array_contains: [department]`（数组） |
| P-2 | 未处理 department=null 边界 | 空集 `{ id: { in: [] } }` 强制匹配空 |
| P-3 | `evaluations.length === 0`（错的）| `submittedAt IS NULL`（预生成模型） |
| P-3 | `if (!overallScore)`（0 分会被误判）| `if (overallScore === undefined)` |
| P-4 | `enabled: true`（User 无此字段）| 去掉假字段 |
| P-4 | 假设 `createNotificationSafe` 存在 | 自实现幂等（不修改 notification.service.ts） |
| P-5 | `hr123` 密码（5 位 < 6 位最小要求）| 改 `hr123456` |

这些修正**全部安全**，体现了 Cursor 的工程判断能力。

### 3. 数据模型兼容性

- **PG enum 不能 DROP 值**：`member` 保留（虽然不再使用），P-1 的 `normalizeUserRole(member) → 'hr'` 兼容旧代码
- **Prisma Client enum 缓存**：migration 后**必须重启 server**，否则新 enum 值会被当作未知
- **面试时预生成 Evaluation**：每个面试官一行，用 `submittedAt IS NULL` 判断"未填"

---

## 📋 验收清单

### P-1 角色化扩展
- ✅ `pnpm test` 380 passed（含 fix 后 8 用例）
- ✅ `npx tsc --noEmit` 通过
- ✅ 4 角色权限矩阵中央化
- ✅ 候选人可见性按角色收敛
- ✅ POST / DELETE 候选人加矩阵检查（fix）

### P-2 业务工作台
- ✅ `pnpm test` 389 passed
- ✅ admin 访问 overview：scope=company, openJobs=6
- ✅ member（hr 角色）访问 overview：403
- ✅ 4 Tab 前端 + 审批流程

### P-3 面试官工作台
- ✅ `pnpm test` 400 passed
- ✅ admin 访问 /today：200
- ✅ hr 访问 /today：403
- ✅ 3 Tab 前端 + 评估弹窗

### P-4 通知 cron
- ✅ `pnpm test` 413 passed
- ✅ 2 个新 cron + 2 个新 service
- ✅ env 变量开关与现有 ANONYMIZE_CRON 风格一致
- ✅ 不修改现有 cron 和 notification.service.ts

### P-5 数据迁移 + seed + 文档
- ✅ `pnpm test` 420 passed
- ✅ `migrate deploy` 成功
- ✅ 角色分布：admin 2 / hr 2 / hiring_manager 1 / interviewer 1 / **member 0**
- ✅ `pnpm db:seed:test-users` 4 用户创建，重复执行幂等
- ✅ README 加"角色与权限"章节

---

## 🔍 遗留与已知问题

### 已知问题（不影响生产）

1. **Prisma Client enum 缓存**：migration 后必须重启 server，否则新 enum 值会被当作未知
2. **PG enum member 保留**：PG 不支持 DROP enum 值，member 永远保留（不再使用）
3. **`@types/pino` 等 stub types 包**：某些旧类型包未清理，不影响运行

### 设计权衡（不修复）

1. **hiring_manager 列表中"可见性约束"**：默认能看本部门，但本部门的所有候选人（包括自己创建的、其他人负责的）—— 这是产品决策，不是 bug
2. **interviewer JSON 过滤**：用 JS 而非 Prisma JSON contains，性能差但稳定（数据量小）
3. **跨部门审批校验**：P-2 已加，hiring_manager 不能审批其他部门的 Offer

### 待办（如果未来需要）

1. **AI 视频面试**：审计报告 P1 缺失项，建议外采（HireVue 等）
2. **候选人门户（PROMPT-15abc）**：你之前决定不做，未来如果做要补全
3. **Chatbot（PROMPT-16ab）**：你之前决定不做
4. **真实环境 Sentry / OTel 接入**：profiling 已就位，需配真实 DSN/endpoint

---

## 🎓 团队上手指南

### Dev 环境 4 角色试用步骤

```bash
# 1. 启动 dev（Docker 或本机 Node）
docker-compose up -d postgres redis
cd server && pnpm dev

# 2. 应用 migration（首次或更新 schema 后）
cd server && npx prisma migrate deploy

# 3. 创建 4 角色测试账号
cd server && pnpm db:seed:test-users

# 4. 启动前端
cd client && pnpm dev  # 默认 5174 端口
```

### 登录验证

```
打开 http://localhost:5174
依次登录 4 个账号，观察菜单和功能差异：
- admin：看到所有功能菜单
- hr：与原 member 体验一致（完整 HR 权限）
- hiring_manager：业务工作台（本部门数据）
- interviewer：面试官工作台（仅自己的面试）
```

### 角色权限矩阵查询

```bash
# 所有 hr 角色的权限
cd server && grep -A 30 "HR_PERMISSIONS" src/services/role-permission.service.ts

# 在代码里检查用户权限
import { hasPermission } from './services/rbac.service';
const canCreate = await hasPermission(userId, isAdmin, 'candidate:create');
```

---

## 📝 设计参考文档

| 文档 | 用途 |
|------|------|
| `VIBE_CODING_PROMPTS_PHASE3_v1.2.md` | 5 个 PROMPT 设计稿（自包含可直接粘贴）|
| `docs/cursor-prompts/PHASE3_PROMPTS_v1.0.md` | v1.0 已废弃，保留作设计参考 |
| `AUDIT_REPORT.md` | 原始审计（阶段 3 是 v3.x 范围） |
| `README.md` | 项目使用说明（含 4 角色说明）|

---

## 🎉 阶段 3 总结

阶段 3 把项目从"2 角色 HR 工具"升级为"4 角色协作平台"：

```
前：单一 hr 视角（admin / member）
后：明确分工
  - admin = 系统维护
  - hr = 招聘流程负责人
  - hiring_manager = 用人部门审批 + 发起 HC
  - interviewer = 专业面试官
```

每个角色有：
- ✅ 明确权限矩阵（不可越权）
- ✅ 工作台入口（侧栏按角色过滤）
- ✅ cron 通知（日报 / 24h 提醒）
- ✅ 测试账号（dev 库 seed 4 角色）
- ✅ 数据迁移（member → hr，幂等）

420 个测试用例，~2200 行代码（含测试），全部 commit 并 push 到 origin/master。

**阶段 3 完整收官。**
