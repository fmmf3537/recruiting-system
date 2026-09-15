# INTV-EDIT 面试安排修改/取消 执行提示词

## ⚠️ 强约束（最优先阅读）
1. **混合切片**：只允许改 `server/src/**`、`server/tests/**`、`client/src/**`；**禁改** `server/prisma/**`、`e2e/**`、根配置文件、`.github/**`、部署文件。
2. **文件预算 ≤ 10 个**（§6.1 逐一编号）；既有文件必须**最小 diff**，新增复杂逻辑补中文注释；禁整文件重写。
3. **禁新增依赖、禁 prisma migrate / schema 变更**。面试不做物理删除，只做状态取消。
4. 编码红线：新文件 UTF-8 无 BOM、LF、2 空格、单引号、行尾分号、中文注释；不要改动与本需求无关的格式。
5. **不跑验收命令**（test/build/lint/type-check 由审核方重跑）；**不要 git commit / push**。
6. headless 无人工确认：先输出实施计划，然后直接动手；最终按 §7.2 交付报告。

## 1. 任务 ID + 目标
### 1.1 任务 ID
INTV-EDIT

### 1.2 目标
补齐“候选人面试安排”的**修改**与**取消**闭环：HR/admin 可在面试仍待进行时修改轮次、方式、面试官、时间、时长、地点、备注、考察方向，并可取消面试；所有变更要有权限控制、冲突校验、审计日志、站内通知，前端列表/详情/候选人详情可操作。

### 1.3 端点清单（角色权限表）
| 端点 | 现状 | 目标 |
|---|---|---|
| `PATCH /api/interviews/:id` | 已存在但仅 `authenticate`，service 只做候选人可见性 | 加权限：admin / hr（member 归一化为 hr）；service 增加冲突检测、面试官变更联动、OperationLog |
| `POST /api/interviews/:id/cancel` | 已存在，`requireRole('admin','hr')` | 保持角色约束；补 OperationLog + 通知；确认 completed 不可取消 |
| `GET /api/interviews/:id` | 已存在 | 不变（前端详情要用） |
| `POST /api/interviews/:id/complete` | 已存在 | 不动逻辑，仅确认修改/取消入口在 scheduled 才显示 |

## 2. 上下文
### 2.1 项目位置
Monorepo：`server/` Express + Prisma + tsx；`client/` Vue3 + Element Plus；路径别名 `@/`、`@services/` 等必须沿用。

### 2.2 关键已核实事实（可直接采信）
- 后端路由 `server/src/routes/interviews.ts`：
  - `PATCH /:id` 当前仅 `authenticate` + `updateInterviewSchema`。
  - `POST /:id/cancel` 当前已 `requireRole('admin','hr')`。
- 后端服务 `server/src/services/interview-scheduler.service.ts`：
  - `updateInterview` 只允许 `InterviewStatus.scheduled` 修改，但**没有冲突检测**，改 `interviewers` 也**没有同步 InterviewEvaluation 待填记录**。
  - `cancelInterview` 仅更新 `status=cancelled` 并把取消原因追加到 `notes`，**无 OperationLog / 通知**。
  - `createInterview` 已有面试官冲突检测、按 interviewers 生成待填评估、发送面试安排通知，可复用其模式。
- 前端：
  - `client/src/api/interview.ts` 已有 `updateInterview` / `cancelInterview`。
  - `client/src/views/interviews/index.vue` 列表已有“完成/取消”，但**没有“编辑”**；`ScheduleInterviewDialog` 只支持新增。
  - `client/src/views/interviews/detail.vue` 只读详情，无编辑/取消按钮。
  - `client/src/views/candidates/CandidateDetail.vue` 面试安排卡片只读，无编辑/取消入口。

### 2.3 数据模型/契约
- `Interview.status`: `scheduled | completed | cancelled | no_show`。
- `Interview.interviewers`: Json 数组 `[{ id, name }]`。
- `InterviewEvaluation` 唯一约束 `@@unique([interviewId, interviewerId])`，`submittedAt=null` 表示待填。
- 通知类型沿用 `interview_scheduled`；如需新增类型，统一用 `interview_updated` / `interview_cancelled`（字符串即可，不做 schema 变更）。
- OperationLog：`targetType='Interview'`，action 用 `interview_updated` / `interview_cancelled`。

## 3. 必读约束
### 3.1 反直觉点（显式标注）
1. **不是物理删除**：用户说“不能删除”，业务语义是“取消面试”；禁止 `prisma.interview.delete`。
2. **改面试官要联动评估**：新增面试官要补 `submittedAt=null` 的待填评估；移除面试官时，若其已提交评估（`submittedAt != null`）则**禁止移除并 400**，未提交的可删除待填记录。注意 `@@unique([interviewId, interviewerId])` 幂等。
3. **改时间/时长/面试官要冲突检测**：复用 create 的重叠判断，但必须**排除当前面试 id**。
4. **可见性不等于可编辑**：候选人可见性只用于 scope 校验；编辑/取消必须 admin/hr（member 归一化为 hr）。hiring_manager 即使可见也不可改。
5. **前端按钮权限**：仅 `authStore.userInfo.role` 归一化后为 `admin/hr` 且 `row.status === 'scheduled'` 时显示编辑/取消。

### 3.2 权限矩阵
- admin：允许编辑/取消所有 scheduled 面试。
- hr/member：允许编辑/取消**可见候选人范围内**的 scheduled 面试（沿用 `assertCandidateVisible`）。
- hiring_manager / interviewer：禁止编辑/取消（403）。

### 3.3 审计/日志约定
- 更新：写 `OperationLog`，detail 至少包含 `changedFields`、`from`/`to` 摘要（时间、面试官 id 列表、地点、轮次；敏感长文本 notes 只记录是否变更）。
- 取消：写 `OperationLog`，detail 包含 `reason`。
- 日志失败仅 `console.error`，不阻断主流程（与 users/offers 现有风格一致）。

## 4. 实施任务（逐文件）
1. `server/src/routes/interviews.ts`（条件修改）
   - `PATCH /:id` 增加 `requireMatrixPermission('interview:update')` 或 `requireRole('admin','hr')`；优先用矩阵权限（hr 已有 `interview:update`，admin 通配）。
   - `POST /:id/cancel` 保持 `requireRole('admin','hr')`；如团队偏好矩阵，可改为 `requireMatrixPermission('interview:update')`，但二选一且全片一致。

2. `server/src/services/interview-scheduler.service.ts`（条件修改）
   - `updateInterview`：
     - 维持仅 scheduled 可改。
     - 若 `scheduledAt/duration/interviewers` 任一变化，执行冲突检测（复用 create 逻辑，排除当前 id）。
     - 若 `interviewers` 变化：调用/新增私有方法同步 `InterviewEvaluation`：新增待填、删除未提交的旧面试官待填、已提交者禁止移除；清 `interviews:list:*` 缓存。
     - 写更新 OperationLog；给候选人负责人、新增面试官发 `interview_updated` 通知（失败不阻断）。
   - `cancelInterview`：
     - 维持 cancelled/completed 不可取消；写取消 OperationLog；给候选人负责人与所有面试官发 `interview_cancelled` 通知（失败不阻断）。

3. `client/src/components/interviews/ScheduleInterviewDialog.vue`（条件修改，最大改动点）
   - 支持编辑模式：新增可选 props（如 `interview?: InterviewItem | null` / `mode?: 'create' | 'edit'`）；编辑时锁定候选人，回填 jobId/round/type/focusType/interviewerIds/scheduledAt/duration/location/notes。
   - 提交时 create 走 `createInterview`，edit 走 `updateInterview`；成功后 emit 统一事件（建议仍用 `scheduled`，或新增 `updated` 并由父组件同时监听）。
   - 不回填/提交 `status`；candidateId 不在编辑时修改。

4. `client/src/views/interviews/index.vue`（条件修改）
   - scheduled 行新增“编辑”按钮，点击打开同一个弹窗并传入该行；成功后刷新列表。
   - 编辑/取消按钮按 §3.2 权限显示。

5. `client/src/views/interviews/detail.vue`（条件修改）
   - 顶部/信息卡增加“编辑/取消面试”按钮（仅 scheduled + admin/hr），编辑成功后 `fetchDetail()`；取消成功后回列表或刷新详情。

6. `client/src/views/candidates/CandidateDetail.vue`（条件修改）
   - 面试安排列表每项对 scheduled 增加“编辑/取消”小按钮；编辑打开 `ScheduleInterviewDialog`（编辑模式），取消走现有 confirm + `cancelInterview`；成功后刷新 `fetchCandidateInterviews()`。

7. `server/tests/unit/interview-scheduler.service.test.ts`（如不存在则新增 ✱；存在则条件补充）
   - 覆盖：scheduled 可改；非 scheduled 不可改；改面试官同步评估；已提交评估面试官不可移除；冲突检测排除当前 id；取消写日志不阻断。

8. `server/tests/integration/interviews.test.ts`（如不存在则新增 ✱；存在则条件补充）
   - 覆盖：`PATCH /api/interviews/:id` admin/hr 可改，hiring_manager/interviewer 403；cancel 同理；scheduled→cancelled 后列表状态正确。

## 5. 关键决策点（默认方案 + 理由）
- **取消而非删除**：保留审计与统计，符合现有 `cancelled` 状态；物理删除会破坏评估/通知追溯。
- **编辑入口复用 ScheduleInterviewDialog**：避免重复表单实现；编辑锁候选人，防止误迁移面试归属。
- **已提交评估的面试官不可移除**：保护已产生评估数据；若业务确需强行替换，应另开“评估作废/转移”切片。
- **权限用矩阵 `interview:update`**：与现有 RBAC 方向一致；cancel 与 update 同权，避免 HR 能改不能取消的割裂。

## 6. 修改文件清单
### 6.1 必改文件（✱=新增）
1. `server/src/routes/interviews.ts`
2. `server/src/services/interview-scheduler.service.ts`
3. `client/src/components/interviews/ScheduleInterviewDialog.vue`
4. `client/src/views/interviews/index.vue`
5. `client/src/views/interviews/detail.vue`
6. `client/src/views/candidates/CandidateDetail.vue`
7. `server/tests/unit/interview-scheduler.service.test.ts`（✱或条件补充）
8. `server/tests/integration/interviews.test.ts`（✱或条件补充）

### 6.2 禁止修改文件
- `server/prisma/schema.prisma`、`server/prisma/migrations/**`
- `e2e/**`
- `client/src/router/**`（本需求不加路由）
- 任何 `.env*`、部署/CI 文件

### 6.3 越界检测（自检命令，交付报告里贴结果，不执行测试）
```bash
git status --short
git diff --stat -- server/prisma e2e client/src/router
```
要求：`server/prisma`、`e2e`、`client/src/router` 必须为 0 行。

## 7. 验收标准
### 7.1 硬性验收（审核方执行，你不跑）
- `cd server && npx tsc --noEmit`：0 错。
- `cd server && npx vitest run`：不低于基线 63 文件 / 611 用例，新增用例全过。
- `cd server && pnpm lint:check`：不新增 errors/warnings（存量基线 17354 errors / 267 warnings，CRLF 存量不算新增）。
- `cd client && npx vue-tsc --noEmit`：不超过存量 88 个 TS 错误。
- `cd client && pnpm lint:check`：不超过存量 137 errors / 224 warnings。
- 手工关键路径：HR 登录 → 面试管理编辑 scheduled 面试改时间/面试官 → 冲突提示正确 → 取消后状态 cancelled 且列表/详情刷新；interviewer 无编辑/取消按钮且直接调接口 403。

### 7.2 交付报告模板（最终回复必须包含）
1. 实施计划摘要（≤8 行）
2. 实际修改文件列表（逐一对应 §6.1）
3. 每个文件的关键 before→after 说明
4. 权限/状态机/评估联动决策落实情况
5. 未实现项与原因（若有）
6. 风险点（缓存、通知失败、已提交评估保护）
7. 越界自检命令输出
8. 给审核方的手工验证步骤（按 7.1 手工关键路径）

按本提示词直接执行（headless 无人工确认）：先输出实施计划，然后动手，最终回复给出完整交付报告。
