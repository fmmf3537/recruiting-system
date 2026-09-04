# INTV-C 面试流程·前端（入口恢复 + 候选人内嵌弹窗 + 多角色视角） 执行提示词

## ⚠️ 强约束（最优先阅读）

1. 本切片为**纯前端**切片：`server/**`、`e2e/**` 一行都不许动。
2. 文件预算 **7 个**（§6.1 逐一编号）；其中 5 个为既有文件的**条件修改**——最小化改动 + 中文注释，交付报告逐条列出。
3. **不跑验收命令**（`pnpm type-check` / `lint` / `test` / `build` 都不跑，审核方重跑）。
4. 编码红线：禁整文件重写既有文件；新文件 UTF-8 无 BOM、LF 行尾、2 空格缩进、单引号（Prettier 惯例）；中文注释。
5. **禁止新增依赖**（复用现有 el-* / xlsx / echarts）。
6. headless 无人工确认：先输出实施计划，然后直接动手。

## 1. 任务 ID + 目标

### 1.1 任务 ID
INTV-C

### 1.2 任务目标
修复面试流程的前端问题（服务端权限/接口在 INTV-S 已就绪）：

1. **面试管理入口恢复**：`/interviews` 路由去 `hidden` + 侧边菜单加「面试管理」（admin / hr / hiring_manager 可见）。
2. **候选人详情直接安排**：详情页「+ 安排面试」改为**打开本页内嵌弹窗**，预填当前候选人，不再跳列表页。
3. **面试官下拉数据源**：`loadUsers` 从 `getUserList`（/users admin-only，HR 403）切到 `getInterviewerOptions`（/users/interviewer-options，登录可读）——修复 HR 面试官下拉为空。
4. **面试官工作台开放 hiring_manager**：菜单「面试官工作台」从 `admin|interviewer` 增加 `hiring_manager`（用人经理作为面试官参场）。
5. **大纲生成入口可达**：面试官工作台评估弹窗加「生成/再生成大纲」操作（复用 QuestionOutlineCard 的生成逻辑，或提供跳转/生成按钮）+ 一键二连（面试未完成点「填评估」→ 先 complete 再开弹窗）。
6. **HR 面试管理列表看评估**：列表加「评估结论」列（已提交评估的 conclusion 摘要）。
7. **用人经理「即将面试」tab 增强**：加面试官 / 面试方式 / 考察方向列 + 操作列「详情」（跳 `/interviews/:id`）。

## 2. 上下文

### 2.1 项目位置
前端在 `client/`（Vue 3 `<script setup>` + TS + Element Plus 2.5 + Pinia）。路径别名 `@/*` → `src/*`。ElMessage / ElMessageBox 需显式 import。

### 2.2 关键已核实事实（起草人已实读源码，可直接采信）

- **路由** `client/src/router/index.ts`：
  - `/interviews`（147-154 行）`meta: { title: '面试管理', hidden: true }` → **去掉 hidden**，加 `role: ['admin', 'hr', 'hiring_manager']`（面试管理页让管理角色都能进）。
  - `/interviews/:id` 详情页（166-170 行）`hidden: true` 保持（不进菜单，但从列表/通知可点入）。
  - `/interview` 面试官工作台（64-71 行）`role: ['admin', 'interviewer']` → **加 'hiring_manager'**。
- **菜单** `client/src/layouts/DefaultLayout.vue`：
  - 202-204 行：面试官工作台 `role === 'admin' || role === 'interviewer'` → 加 `|| role === 'hiring_manager'`。
  - **新增**「面试管理」菜单项：`if (role === 'admin' || role === 'hr' || role === 'hiring_manager') items.push({ path: '/interviews', title: '面试管理', icon: Calendar })`——放「面试官工作台」后、Offer 前。注意图标已 import Calendar 吗？检查顶部 icons import，缺则加。
- **面试管理列表** `client/src/views/interviews/index.vue`（847 行）：
  - `loadUsers()`（497-507 行）：`getUserList({ pageSize: 100 }) as any` → **改为 `getInterviewerOptions()`**（新 API）。
  - 列表表格（69-240 行）：找面试列表 el-table 位置，加「评估」列（显示 `evaluations?.[0]?.conclusion` 摘要，最多 6 字 + tooltip；有结论绿 tag「已评估」，无结论灰「未评估」）。需确认列表接口返回含 evaluations——若不返回，§4.5 说明处理。
  - 详情入口已有：645 行 `router.push(\`/interviews/${row.id}\`)`（点行）。
- **候选人详情** `client/src/views/candidates/CandidateDetail.vue`（1377 行）：
  - `handleScheduleInterview()`（1035-1037 行）`router.push('/interviews')` → **改为打开本页内嵌弹窗**。
  - 页面已有多个 el-dialog 范式（388 行 email、425 行 advance、456 行 feedback、492 行 comm）→ **新增 scheduleDialog**，表单复用 interviews/index.vue 的安排表单（candidate 预填当前候选人，不可改；interviewer 下拉用 getInterviewerOptions；含 round/type/interviewers/scheduledAt/duration/location/notes/focusType）。
  - **建议**：把「安排面试表单」抽成**可复用组件** `client/src/components/interviews/ScheduleInterviewDialog.vue`（props: modelValue, initialCandidateId；emits: imported），CandidateDetail 与 interviews/index.vue 都挂它——**一次实现两处复用**（interviews/index.vue 现有内嵌表单也换成组件）。这是本切片 max 价值点，但**若你判断重构风险大，可保持 interviews/index.vue 内嵌不动，只在 CandidateDetail 新建弹窗**——二选一，交付报告说明。
- **面试官工作台** `client/src/views/interview/index.vue`（427 行）：
  - `openEvaluationDialog(interview)`（274 行）直接开弹窗 → **加一键二连**：若 `interview.status !== 'completed'`，先 `completeInterview(id)` 再开弹窗（或弹确认「面试未开始，标记完成并填写评估？」）。
  - 评估弹窗内「大纲对照」已有（85-113 行，只读）→ 加「生成/再生成大纲」按钮（调 `generateQuestionOutline(interviewId, { focusType, adjustNote })`，复用 `client/src/components/interviews/QuestionOutlineCard.vue` 的生成逻辑或直接嵌入 generate 调用 + loading；生成后刷新 latestOutline）。**注意**：生成需要 focusType 必填——若无考察方向，弹窗内先选 focusType 再生成。
  - 今日/待评/历史 表格操作列：加「详情」按钮（跳 `/interviews/:id`）——目前只有「填评估」。
- **伪 API** `client/src/api/interview.ts`：新增 `getInterviewerOptions()`（或放 `api/user.ts`——面试官选项属用户域，**建议放 user.ts**，与 approver-options 同级）。`completeInterview(id)` 已有（119-123 行）。`generateQuestionOutline` 已有（143-152 行）。
- **招聘工作台** `client/src/views/hiring/index.vue`（253 行）：
  - 即将面试 tab（75-91 行）只有 4 列 → **加**：面试官（`row.interviewers?.map(i=>i.name).join('、')`）、面试方式（row.type）、状态（row.status）、操作（「详情」→ `/interviews/:id`）。
  - 该 tab 数据来自 `GET /hiring/interviews`（225-244 行后端路由 include candidate/job，**未 include interviewers**）→ **面试官列需要后端补**。但本切片纯前端不能改 server！→ 处理：**前端用可选链 `row.interviewers` 显示，后端没返回就显示 '—'**，并在交付报告注明「需 INTV-S 后续或下一切片补后端 include」。或者——**在 INTV-S 提示词里我加了 interview.ts 的 interviewing 内容吗？没有**。此处只能前端尽力（'—' fallback）+ 交付报告说明。
  - 实际上：`GET /hiring/interviews` 后端没 include interviewers，前端拿不到。**本切片在交付报告明确此缺口**，建议列为 INTV-S2 或在下一次服务端切片补 include。

### 2.3 权限语义（用户已确认，前端据此控制）

| 页面/菜单 | 可见角色 |
|-----------|---------|
| 面试管理 `/interviews` 菜单 | admin / hr / hiring_manager |
| 面试官工作台 `/interview` 菜单 | admin / interviewer / **hiring_manager** |
| 候选人详情「安排面试」按钮 | admin / hr（安排面试是 HR 职责；hiring_manager 一般不当面试安排者，但若其候选人可见则按钮可在——**按现有权限矩阵 candidate:update 决定**，别加新判断）|

## 3. 必读约束

### 3.1 反直觉点（显式标注）
1. **面试官下拉不要用 getUserList**：`/users` 是 admin-only，hr 调 403（INTV-S 已新增 `/users/interviewer-options`）。**必须切到新接口**，否则 HR 安排面试还是空下拉。
2. **面试官工作台菜单给 hiring_manager 是"参场视角"**：他不该在这里拼管理功能——工作台本来就按「我参与的」过滤（后端 loadVisibleInterviewIds），角色开放只是让他能进。
3. **一键二连的完整 vs 半自动**：面试状态不是 completed 时，弹确认「面试还未标记完成，是否先标记完成再填写评估？」→ 确认后 `completeInterview` → 成功后开弹窗。取消则不开。**不要静默直接 complete**（有确认稳妥）。
4. **生成大纲必须有 focusType**：问卷里 focusType 下拉选个值才能 generate（后端 zod 必填）。评估弹窗内若面试有 focusType 直接带；没有则在生成弹窗内让面试官先选。
5. **hiring 即将面试的 interviewers 列**：后端未返回（本切片不能改 server）→ 显示 '—' 并在交付报告注明「待 INTV-S2 补 include interviewers」。
6. **面试管理列表评估列**：若后端列表接口不返回 evaluations 明细 → 前端只能显示「有/无评估」或空；**同样在交付报告注明缺口**，建议服务端下一切片在 getInterviews 的 include 补 `evaluations: { select: { conclusion: true }, where: { submittedAt: { not: null } } }`。

### 3.2 组件化决策（重要）
安排面试弹窗：**推荐抽成 `ScheduleInterviewDialog.vue` 复用**（CandidateDetail + interviews/index.vue 都用）。理由：
- 两份表单逻辑重复（candidate 远程搜索/interviewer 下拉/提交/校验）
- 一次实现，两处入口统一（列表页「安排面试」+ 候选人详情「+ 安排面试」）
- 风险可控（表单是纯 UI + API 调用，无状态耦合）

若抽组件时发现 interviews/index.vue 的表单与列表状态耦合过深（如编辑回填 scheduleEditId），可只抽「新增」部分（编辑保持内嵌）。**交付报告说明取舍。**

### 3.3 权限不重复发明
菜单/路由的 `meta.role` 是唯一过滤层；页面内**不**按角色再隐藏安排按钮/详情按钮（后端 INTV-S 已锁 complete/cancel）。只有「面试管理」菜单这种纯入口级才加 role 判断。

## 4. 实施任务

### 4.1 `client/src/api/user.ts`（若 interviewer-options 放 user 域）

新增：
```ts
// 面试官选项（安排面试时可选面试官；登录可读，返回 interviewer/hr/hiring_manager/admin）
export function getInterviewerOptions(): Promise<{
  success: boolean;
  data: Array<{ id: string; name: string; department?: string | null }>;
}> {
  return request.get('/users/interviewer-options') as Promise<...>;
}
```

### 4.2 `client/src/router/index.ts`（条件修改）
- `/interviews`（147-154 行）：`hidden: true` 删掉 OR 改 `hidden: false`，meta 加 `role: ['admin', 'hr', 'hiring_manager']`。
- `/interview`（64-71 行）：`role: ['admin', 'interviewer', 'hiring_manager']`。

### 4.3 `client/src/layouts/DefaultLayout.vue`（条件修改）
- 202-204 行：面试官工作台条件加 `|| role === 'hiring_manager'`。
- 新增「面试管理」菜单：放「面试官工作台」之后：
  ```ts
  if (role === 'admin' || role === 'hr' || role === 'hiring_manager') {
    items.push({ path: '/interviews', title: '面试管理', icon: Calendar });
  }
  ```
  确认 Calendar icon 已 import（检查顶部；缺则加）。

### 4.4 ✱ `client/src/components/interviews/ScheduleInterviewDialog.vue`（新增，安排面试弹窗）

props: `modelValue: boolean`、`initialCandidateId?: string`（候选人详情预填用）
emits: `update:modelValue`、`scheduled`（成功后通知父组件刷新）

结构（从 interviews/index.vue 现有表单移植）：
- el-dialog「安排面试」（宽度 560px，destroy-on-close）
- 表单字段：候选人（initialCandidateId 有则锁定 disabled；否则远程搜索 candidateOptions）、关联职位、面试轮次（初试/复试/终面）、面试方式（电话/视频/现场）、考察方向（focusType 下拉，字典 interview_focus_type，可选）、面试官（**getInterviewerOptions** 多选）、面试时间（datetime）、时长（分钟）、地点、备注
- 提交：`createInterview(data)` → 成功后 ElMessage.success + emit('scheduled') + 关闭
- 校验：candidateId / round / type / interviewers(至少1) / scheduledAt 必填（对齐后端 zod）

### 4.5 `client/src/views/candidates/CandidateDetail.vue`（条件修改）
- `handleScheduleInterview()`（1035 行）：改为打开本页 scheduleDialog：
  ```ts
  const scheduleDialogVisible = ref(false);
  function handleScheduleInterview() {
    scheduleDialogVisible.value = true;
  }
  ```
- 模板挂 `<ScheduleInterviewDialog v-model="scheduleDialogVisible" :initial-candidate-id="candidateId" @scheduled="handleInterviewScheduled" />`
- `handleInterviewScheduled`：重新拉 `candidateInterviews`（现有方法）

### 4.6 `client/src/views/interviews/index.vue`（条件修改）
- `loadUsers()`（497 行）→ 改用 `getInterviewerOptions()`：
  ```ts
  async function loadInterviewers() {
    try {
      const res = await getInterviewerOptions();
      if (res.success) {
        userOptions.value = (res.data || []).map((u) => ({ id: u.id, name: u.name }));
      }
    } catch { /* ignore */ }
  }
  ```
  替换原 loadUsers 调用点（572 行 onMounted）。
- 若选择抽组件：现有内嵌安排弹窗（243-341 行）替换为 `<ScheduleInterviewDialog>`（保留编辑模式 scheduleEditId 逻辑在组件 props 或留在列表页——**推荐编辑也进组件**，交付报告说明）。
- 列表表格加「评估」列：showOverflowTooltip 的 conclusion 摘要（§3.1-6 的 fallback 处理）。

### 4.7 `client/src/views/interview/index.vue`（条件修改）
- `openEvaluationDialog`（274 行）：加一键二连：
  ```ts
  async function openEvaluationDialog(interview: InterviewerInterview, isReadonly = false) {
    if (!isReadonly && interview.status !== 'completed') {
      try {
        await ElMessageBox.confirm('面试还未标记完成，是否先标记完成再填写评估？', '提示', { type: 'warning' });
        await completeInterview(interview.id);
        ElMessage.success('面试已标记完成');
        // 刷新今日列表（该场从今日移到待评）
      } catch (e) {
        if (e !== 'cancel') { /* complete 失败提示 */ }
        return; // 取消不开弹窗
      }
    }
    // 原有逻辑 openEvaluationDialog 主体
  }
  ```
- 评估弹窗内：在「大纲对照」上方加「AI 面试大纲」操作区：
  - 若 `latestOutline` 存在：显示「再生成」
  - 若无：显示「生成大纲」按钮 → `generateQuestionOutline(interview.id, { focusType })`（focusType 从面试记录带，无则弹 select）→ 成功后刷新 latestOutline + ElMessage.success
  - loading 锁：generating ref，防连点
  - 失败：ElMessage.error 直出后端 message（400/403 都直出）
- 三个表格（今日/待评/历史）操作列：加「详情」按钮 → `router.push(\`/interviews/${row.id}\`)`（历史也加，便于看评估明细）。

### 4.8 `client/src/views/hiring/index.vue`（条件修改）
- 即将面试 tab（75-91 行）：列改为 `候选人 | 职位 | 面试官 | 方式 | 时间 | 时长 | 状态 | 操作`：
  - 面试官：`interviewers?.map(i => i.name).join('、') || '—'`（后端未返回时 '—'）
  - 方式：`row.type || '—'`
  - 状态：`row.status`（scheduled/completed 中文映射）
  - 操作：「详情」→ `/interviews/${row.id}`
- 交付报告注明「面试官列待后端 include interviewers（INTV-S2）」。

## 5. 关键决策点

### 5.1 抽组件 vs 内嵌复制
**推荐抽 `ScheduleInterviewDialog.vue`**（一处实现，列表页 + 候选人详情复用）。若编辑回填耦合深，抽「新增」部分即可，编辑留列表页内嵌。交付报告说明取舍与测试覆盖。

### 5.2 一键二连带确认
complete 前 ElMessageBox.confirm，避免误标。取消则不开弹窗（符合「面试官可完成」但要有确认）。

### 5.3 大纲生成放评估弹窗
不放独立页面——面试官在填评估时最需要大纲参考，就近生成最高效。复用 QuestionOutlineCard 的生成 API（generateQuestionOutline），不引组件（弹窗内嵌逻辑更轻）。

### 5.4 不做清单
- 不做日历拖拽、批量安排
- 不做候选人详情页的大纲卡片（那是详情页自己的事，本片段的 F3-C 已有 QuestionOutlineCard；此处只补面试官工作台生成入口）
- 不改 server / e2e / package.json
- 不新增依赖

## 6. 修改文件清单

### 6.1 必改文件（7 个；✱=新增）
1. `client/src/api/user.ts`（getInterviewerOptions，若走 user 域）
2. `client/src/router/index.ts`（/interviews 去 hidden + role；/interview 加 hiring_manager）
3. `client/src/layouts/DefaultLayout.vue`（面试官工作台 + 面试管理菜单）
4. ✱ `client/src/components/interviews/ScheduleInterviewDialog.vue`（新增）
5. `client/src/views/candidates/CandidateDetail.vue`（内嵌弹窗挂载）
6. `client/src/views/interviews/index.vue`（面试官下拉数据源 + 评估列 + 组件化）
7. `client/src/views/interview/index.vue`（一键二连 + 大纲生成 + 详情按钮）
8. `client/src/views/hiring/index.vue`（即将面试表增强）

> 实际 8 个（api + router + layout + 新组件 + 4 页面）。若抽组件失败（5.1），加回 1 个 CandidateDetail 内嵌弹窗（文件不变，改手势）。

### 6.2 禁止修改文件
- `server/**`、`e2e/**`、任何 package.json / tsconfig / vite / eslint
- `client/src/components/interviews/QuestionOutlineCard.vue`（F3-C 产物，仅复用其 API）

### 6.3 越界检测（交付前自检）
- `git status --short` 仅出现 §6.1 的 8 个路径。
- `git diff --stat -- server e2e` 必须 0 行。
- 无 package.json / lockfile 改动。

## 7. 验收标准

### 7.1 硬性验收（审核方执行，你不跑；仅供了解通过线）
- `client pnpm type-check`：仍 90（0 新增）。
- `client pnpm lint:check`：仍 137e/231w（0 新增；新增代码遵循 vue 属性顺序等）。
- `client pnpm test`：4 文件 / 22 用例全过。
- git status 仅 §6.1 路径；无 BOM；`server/**` `e2e/**` 0 行。

### 7.2 交付报告模板（最终回复必须完整包含）
1. 完成范围概述（实际改了哪些文件、是否抽组件、hiring 面试官列是否 fallback）。
2. 文件逐个说明（新增写职责；条件修改**逐处**列 before→after 摘要 + 中文注释）。
3. 交互流程：候选人详情安排弹窗 / 列表页面试官下拉 / 一键二连 / 大纲生成 / 面试管理菜单。
4. 权限边界：菜单 role 矩阵、页面内是否按角色隐藏、后端锁的说明。
5. 已知缺口（hiring 面试官列 / 列表评估列依赖后端 include——建议注入下一切片的清单）。
6. 越界自检（git status 全文 + 0 行检查）。
7. 红线自检确认。

按本提示词直接执行（headless 环境无人工确认环节）：先输出实施计划，然后动手，最终回复给出完整交付报告。