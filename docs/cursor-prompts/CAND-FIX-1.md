# CAND-FIX-1 候选人详情页面试入口与淘汰原因条件必填 执行提示词

## ⚠️ 强约束（最优先阅读）
1. **纯前端修复**：只允许改 `client/src/views/candidates/CandidateDetail.vue`、`client/src/components/candidates/detail/**`、`client/src/api/candidate.ts`（仅在类型必须时）；**禁改** `server/**`、`e2e/**`、路由、菜单、配置文件。
2. **文件预算 ≤ 4 个**；最小 diff；不重构页面骨架，不改 NextActionBanner / PipelineStepper 的既有结构。
3. **禁新增依赖**；不跑验收命令；不要 git commit / push。
4. 必须先读 `docs/面试流程优化_开发计划_20260928.md` 的 v0.2 增补，按 §9.2 修复，不扩大范围。
5. headless 无人工确认：先输出实施计划，然后直接动手，最终按 §7.2 交付报告。

## 1. 任务 ID + 目标
### 1.1 任务 ID
CAND-FIX-1

### 1.2 目标
修复候选人详情页两个阻断问题：
1. 恢复常驻「安排面试」入口，不再只依赖 NextActionBanner CTA。
2. 所有「淘汰原因」改为条件必填：只有淘汰/拒绝时才必填。

## 2. 上下文
### 2.1 已核实事实
- `CandidateDetail.vue` 已重构为头部带 + NextActionBanner + PipelineStepper + 三轨布局。
- `CandidateInterviewsPanel.vue` 当前模板里只有每场面试的操作按钮和底部「+ 补录历史面试反馈」，**没有常驻安排面试按钮**；父组件已经传了 `@schedule="handleScheduleInterview"`，但面板模板未使用 `schedule` emit。
- `CandidateDetail.vue` 里：
  - `advanceRules.rejectReason` 当前必填；
  - `feedbackRules.rejectReason` 当前必填；
  这会导致通过/非淘汰也被要求填淘汰原因。
- 详情页已有 `handleScheduleInterview()`，会打开 `ScheduleInterviewDialog` 并预填当前候选人。

### 2.2 口径
- 常驻安排面试按钮是**次按钮**，不得取代 `NextActionBanner` 的唯一主动作。
- 历史补录反馈保留，但校验规则必须正确；不改变它“历史补录”的定位。

## 3. 必读约束
### 3.1 反直觉点
1. 不要把「安排面试」做成第二个大型 primary CTA；它是面板内的普通次按钮。
2. `rejectReason` 不是删掉，而是**按结论条件必填**：
   - 推进流程：`advanceForm.status === 'rejected'` 时必填，否则非必填。
   - 历史反馈：`feedbackForm.conclusion === 'reject'` 时必填，否则非必填。
3. 如果 Element Plus 表单 rules 需要动态化，用 computed rules 或在提交前手动校验，二选一，保持简单。
4. 不改变后端接口字段，只修前端校验与入口。

## 4. 实施任务（逐文件）
1. `client/src/components/candidates/detail/CandidateInterviewsPanel.vue`
   - 在面板顶部或 `iv-head` 区域增加常驻「安排面试」按钮，点击触发 `$emit('schedule')`。
   - 按钮样式：次按钮/文字按钮，不与每场面试的“面试与评估”主入口抢视觉。
   - 保留现有「补录历史面试反馈」入口，不改成结构化评估。

2. `client/src/views/candidates/CandidateDetail.vue`
   - 推进流程：让 `rejectReason` 仅在 `advanceForm.status === 'rejected'` 时必填；提交前兜底校验，避免绕过 rules。
   - 历史反馈：让 `rejectReason` 仅在 `feedbackForm.conclusion === 'reject'` 时必填；提交前兜底校验。
   - 当用户从 rejected/reject 切回通过时，清空或保留 rejectReason 均可，但提交非淘汰时不得把必填错误挡下。

3. `client/src/components/candidates/detail/CandidateInterviewsPanel.vue`（如需要）
   - 若按钮放在组件顶部导致 props 不足，只通过既有 emits 通信，不新增全局状态。

4. `client/src/api/candidate.ts`（仅在类型必须时）
   - 原则上不改；若动态 rules 需要类型辅助，最小修改并在报告说明。

## 5. 关键决策点（默认方案 + 理由）
- **常驻按钮放面试 Panel 顶部右侧**：符合“面试评估”面板语义，且不会和页头 NextActionBanner 冲突。
- **动态校验优先用提交前手动校验**：比把 FormRules 改 computed 更稳，改动小，避免 Element Plus rules 响应式边界问题。
- **不删补录历史反馈**：当前实现已明确为历史补录，本切片只修校验，不改产品口径。

## 6. 修改文件清单
### 6.1 必改文件
1. `client/src/components/candidates/detail/CandidateInterviewsPanel.vue`
2. `client/src/views/candidates/CandidateDetail.vue`
3. `client/src/api/candidate.ts`（可选，默认不改）
4. `client/src/components/candidates/detail/<其他>`（默认不改）

### 6.2 禁止修改文件
- `server/**`
- `e2e/**`
- `client/src/router/**`
- `client/src/layouts/**`
- `client/src/views/candidates/index.vue`（lint 修复在另一切片）

### 6.3 越界检测（交付报告贴结果）
```bash
git status --short -- client server e2e
git diff --stat -- server e2e client/src/router client/src/layouts client/src/views/candidates/index.vue
```
要求：`server`、`e2e`、router/layouts/index.vue 为 0 行。

## 7. 验收标准
### 7.1 硬性验收（审核方执行，你不跑）
- `cd client && npx vue-tsc --noEmit`：保持 0 错。
- `cd client && pnpm lint:check`：不新增错误；本切片不要求解决存量 lint。
- 手工验证：
  - 候选人详情页面试评估面板始终有「安排面试」按钮；点击打开安排弹窗并预填当前候选人。
  - 推进流程选择「通过」时不要求淘汰原因；选择「淘汰」时必填。
  - 补录历史反馈选择「通过/待定」时不要求淘汰原因；选择「淘汰」时必填。

### 7.2 交付报告模板（最终回复必须包含）
1. 实施计划摘要（≤8 行）
2. 实际修改文件列表
3. 每个文件 before→after
4. 常驻安排入口与条件必填如何落地
5. 未实现项与原因（若有）
6. 风险点
7. 越界自检命令输出
8. 给审核方的手工验证步骤

按本提示词直接执行（headless 无人工确认）：先输出实施计划，然后动手，最终回复给出完整交付报告。
