# F3-C 面试大纲·前端 执行提示词

## ⚠️ 强约束（最优先阅读）

1. 本切片为**纯前端**切片：`server/**`、`e2e/**` 一行都不许动。
2. 文件预算 **5 个**（§6.1 逐一编号）；其中 4 个为既有文件的**条件修改**——必须最小化改动 + 中文注释说明，交付报告逐条列出。
3. 不跑验收命令（`pnpm type-check` / `lint` / `test` / `build` 都不跑，审核方重跑）。
4. 编码红线：禁整文件重写既有文件；新文件 UTF-8 无 BOM、LF 行尾、2 空格缩进、单引号（Prettier 惯例）；中文注释。
5. headless 无人工确认：先输出实施计划，然后直接动手。

## 1. 任务 ID + 目标

### 1.1 任务 ID
F3-C

### 1.2 任务目标
实现 PRD 阶段 5 F3「面试问题一键生成」前端：面试详情页挂载「AI 面试大纲」卡片（生成/再生成 + 版本历史 + 参考答案默认折叠 + 手动微调定稿），安排/编辑面试弹窗加「考察方向」下拉，面试官工作台评估弹窗加大纲对照面板。服务端接口已在 F3-S 就绪（见 §2.2）。需求见仓库根 `PRD_阶段5_AI招聘增强与HR考核_20260901.md` 第 5 章（重点 5.4 功能流程）。

### 1.3 服务端接口（F3-S 已交付，直接对接）

| 方法 | 路径 | body / 返回 |
|---|---|---|
| POST | `/api/interviews/:id/question-outline` | body `{ focusType, adjustNote? }`，同步返回新版本记录 |
| GET | `/api/interviews/:id/question-outlines` | 版本列表，version 降序 |
| PATCH | `/api/interviews/:id/question-outline/:version` | body `{ outline }`，手动定稿 |

记录结构：`{ id, interviewId, version, focusType, outline, adjustNote, editedById, createdById, createdAt }`；`outline` = `{ sections: [{ theme, questions: [{ question, intent, referenceAnswer, followUp? }] }], durationAdvice? }`。
错误约定：focusType 非字典项/版本上限 10 → 400（message 直出）；非该场面试官（interviewer/hiring_manager 角色）→ 403。

## 2. 上下文

### 2.1 项目位置
前端在 `client/`（Vue 3 `<script setup>` + TS + Element Plus 2.5 + Pinia）。路径别名 `@/*` → `src/*`。Element Plus 组件自动引入，但 `ElMessage` 等 API 与图标需显式 import（参照既有文件）。

### 2.2 关键已核实事实（起草人已实读源码，可直接采信）

- **面试详情页** `client/src/views/interviews/detail.vue`（264 行）：结构为 info-card（el-descriptions 展示面试信息，18-35 行）+ evaluation-card（评估表格）+ radar-card（雷达图）。`fetchDetail()`（171 行）用 `Promise.all` 拉详情与评估。`InterviewItem` 类型来自 `@/api/interview`。样式 `scoped lang="scss"`。本切片在 info-card 之后插入新的 QuestionOutlineCard 组件，并在 el-descriptions 中「面试方式」后加一行「考察方向」（`interview.focusType` 直接由详情接口返回，F3-S 已确认 findUnique 全字段返回；字典 code 需转中文名展示，参照 §4.4）。
- **安排/编辑面试弹窗** `client/src/views/interviews/index.vue`（243-327 行）：`el-dialog` 内 `scheduleForm`（reactive）+ `scheduleRules`，字段含 candidateId/jobId/round/type/interviewerIds/scheduledAt/duration/location/notes；提交在 `handleScheduleSubmit`（约 565 行：`updateInterview(scheduleEditId, data)` 或 `createInterview(data)`）；打开弹窗在约 538 行（编辑时回填 scheduleForm）。本切片在「面试方式」表单项后插入「考察方向」el-select（可选、clearable，选项来自字典），提交 data 带 `focusType`（空则不传/传 undefined），编辑回填时带上。
- **面试官工作台评估弹窗** `client/src/views/interview/index.vue`（80-112 行）：`el-dialog title="面试评估"`，`openEvaluationDialog(interview, isReadonly)`（218 行）打开；`currentInterview` 含 `id`。本切片在弹窗内「候选人」表单项后加「大纲对照」折叠面板（打开弹窗时按需拉最新版大纲，拉取失败/403 静默隐藏面板，**不弹错误**）。样式 `scoped`（无 lang）。
- **API 封装** `client/src/api/interview.ts`（100 行）：`request` 来自 `@/utils/request`（响应拦截器直接返回 response.data，故 `as Promise<{success, data}>` 断言惯例，参照 detail.vue 177 行注释）。`InterviewParams`（8 行）/ `InterviewItem`（20 行）各加 `focusType?: string | null`。
- **字典 API** `client/src/api/dictionary.ts`：`getDictionaries({ category: 'interview_focus_type' })` 返回 `{ success, data: DictionaryItem[] }`（含 code/name/enabled），取 `enabled` 项。字典默认 5 项：hr HR面 / tech 技术面 / comprehensive 综合面 / manager 主管面 / cross 交叉面。
- **既有组件参照**：`client/src/components/jobs/JdPolishDialog.vue` 与 `client/src/components/candidates/MatchScoreCard.vue`（F1-C/F2-C 产物，ElMessage 用法、loading 锁、弹窗结构、错误处理惯例都参照它们，动手前先读）。
- **权限**：4 个角色（admin/hr/hiring_manager/interviewer）都有 `ai:interview-outline` 权限点，前端**不按角色隐藏**生成按钮；越权由后端 403 兜底，catch 后 ElMessage.error 直出后端 message。
- **字典管理页**：`interview_focus_type` 分类会随 F3-S 自动出现在设置页字典管理（`client/src/views/settings/` 字典页按分类动态渲染，F2-C 已验证 matching_dimension 无需改前端），本切片**不动**设置页。

### 2.3 验收基线（审核方重跑，只能持平或改善）

- `client pnpm type-check`：基线 **78** 个存量错误，增量必须为 0。
- `client pnpm lint:check`：基线 **137e/231w**，增量必须为 0。
- `client pnpm test`：基线 4 文件 / 22 用例全过（本切片不新增测试文件，既有测试不得破坏）。

## 3. 必读约束

### 3.1 代码范式
Vue 3 Composition API `<script setup lang="ts">`；el 组件自动引入不 import，`ElMessage`/图标显式 import；每个被改文件**沿用该文件自身**的样式风格（detail.vue 是 `scoped lang="scss"`，interview/index.vue 是无 lang 的 `scoped`）。

### 3.2 交互要点（PRD 5.4/5.6）
- 生成按钮 loading 锁防重复点击（生成是同步接口，LLM 耗时可能 10-30s，loading 文案「AI 生成中，请稍候…」）。
- 参考答案 `referenceAnswer` **默认折叠**（每题一个折叠/展开交互）。
- 版本历史可查看；查看旧版时可「基于此版定稿编辑」或生成新版；版本快照展示当时 focusType（转中文名）。
- 手动微调**不调 LLM**：编辑模式把当前展示版本的 sections/questions 变成可编辑表单（question/intent/referenceAnswer/followUp 均可改文本，不允许增删题——增删靠再生成），保存走 PATCH。
- 再生成：adjustNote 输入框（placeholder 示例「如：多考察质量体系经验」）+ 可改考察方向；生成后刷新版本列表并展示新版本。
- 版本上限 10：后端 400 message 直出即可。

## 4. 实施任务

### 4.1 `client/src/api/interview.ts`（条件修改）
- `InterviewParams` 加 `focusType?: string`；`InterviewItem` 加 `focusType?: string | null`。
- 新增类型与 3 个函数：
  ```ts
  export interface OutlineQuestion { question: string; intent: string; referenceAnswer: string; followUp?: string; }
  export interface OutlineSection { theme: string; questions: OutlineQuestion[]; }
  export interface QuestionOutline { sections: OutlineSection[]; durationAdvice?: string; }
  export interface QuestionOutlineVersion {
    id: string; interviewId: string; version: number; focusType: string;
    outline: QuestionOutline; adjustNote: string | null; editedById: string | null;
    createdById: string; createdAt: string;
  }
  // 生成/再生成面试大纲（同步，LLM 耗时较长）
  export function generateQuestionOutline(interviewId: string, data: { focusType: string; adjustNote?: string })
  // 获取大纲版本列表（version 降序）
  export function getQuestionOutlines(interviewId: string)
  // 手动微调定稿（不调 LLM）
  export function finalizeQuestionOutline(interviewId: string, version: number, outline: QuestionOutline)
  ```

### 4.2 `client/src/components/interviews/QuestionOutlineCard.vue`（新增，核心）
面试大纲卡片组件，props：`{ interviewId: string; interviewFocusType?: string | null }`。结构：
- 卡片头：标题「AI 面试大纲」+ 右侧「生成大纲」/「再生成」按钮（loading 锁）。
- 生成弹窗（el-dialog）：考察方向 el-select（字典 `interview_focus_type` enabled 项，label 用 name、value 用 code；默认值取 `interviewFocusType`，空则不选，必填校验）+ adjustNote el-input textarea（已有版本时显示，label「调整要求（可选）」）+ 生成按钮（loading 文案「AI 生成中，请稍候…」）。
- 版本切换：el-select 或 el-radio-group 选版本（`v3（最新）/ v2 / v1`，附 focusType 中文名与创建时间）；默认展示最新版。
- 大纲渲染：`durationAdvice` 有值时顶部 el-alert 展示；sections 分块（theme 作小标题），每题一个卡片/列表项：question 加粗、intent 灰色小字「考察意图」、followUp「追问」、`referenceAnswer` 用 el-collapse 或「展开参考答案」按钮**默认折叠**。
- 操作区：「手动微调」进入编辑模式（当前版本各题 question/intent/referenceAnswer/followUp 变 el-input，section theme 也可改；「保存定稿」走 PATCH，「取消」还原）；保存成功刷新列表。
- 空态：无版本时 el-empty「暂无大纲，点击右上角生成」。
- 错误处理：403/400 的 message 用 ElMessage.error 直出；版本列表拉取失败 ElMessage.error。
- mounted 时拉版本列表。

### 4.3 `client/src/views/interviews/detail.vue`（条件修改）
- import 并挂载 `<QuestionOutlineCard :interview-id="id" :interview-focus-type="interview?.focusType" />`，插在 info-card 与 evaluation-card 之间。
- el-descriptions「面试方式」项后加「考察方向」项：显示 focusType 中文名（拉一次字典映射 code→name；无 focusType 显示「—」）。生成新版后卡片内自行刷新即可，详情行不要求联动。
- 该文件 `scoped lang="scss` 风格不变；新样式加到既有 scss 块尾。

### 4.4 `client/src/views/interviews/index.vue`（条件修改）
- scheduleForm 加 `focusType: ''`；弹窗「面试方式」表单项后插「考察方向」el-select（可选、clearable、占位「选择考察方向（可选）」、选项字典 enabled 项 name 作 label、code 作 value）。
- 打开弹窗（新建/编辑两处路径）拉字典选项（可缓存到组件级 ref，避免每次请求）；编辑回填 `scheduleForm.focusType = row.focusType || ''`。
- `handleScheduleSubmit` 组装 data 时 `focusType: scheduleForm.focusType || undefined`。
- 列表表格**不加**考察方向列（保持列表简洁，详情页可看）。

### 4.5 `client/src/views/interview/index.vue`（条件修改）
- 评估弹窗「候选人」表单项后加「大纲对照」表单项：`openEvaluationDialog` 时用 `currentInterview.id` 调 `getQuestionOutlines`，取第一版（最新）渲染只读大纲（sections→题列表，question + referenceAnswer 默认折叠）；无版本显示「暂无大纲」；**请求失败/403 静默隐藏**（catch 后把 outline 置 null，不 ElMessage）。
- 只读展示，不提供生成/编辑入口（生成在详情页）。

## 5. 关键决策点

### 5.1 生成按钮不按角色隐藏
四角色均有权限点，精细权限（须为该场面试官）在后端；403 message 直出。不要前端再发明一套角色判断。

### 5.2 字典 code 与 name
select 的 value 存 code（与后端 focusType 存储一致——F3-S 字典校验按 code 匹配），展示一律转 name。后端返回的 focusType 快照也是 code，前端需 code→name 映射（字典接口拉一次）。

### 5.3 不做清单
- 不动设置页字典管理（自动出现新分类）
- 不做大纲导出/打印
- 不在面试列表加考察方向列
- 不做版本 diff 视图
- 不改 `client/src/api/evaluation.ts`
- 不新增测试文件；不 git commit、不跑验收命令

## 6. 修改文件清单

### 6.1 必改文件（5 个；✱=新增，其余为条件修改）
1. `client/src/api/interview.ts`
2. ✱ `client/src/components/interviews/QuestionOutlineCard.vue`
3. `client/src/views/interviews/detail.vue`
4. `client/src/views/interviews/index.vue`
5. `client/src/views/interview/index.vue`

### 6.2 禁止修改文件
清单以外一切；特别地：`server/**`、`e2e/**`、任何 package.json、`client/src/api/evaluation.ts`、`client/src/views/settings/**`、vite/tsconfig/eslint 配置。

### 6.3 越界检测（交付前自检）
- `git status --short` 只允许出现 6.1 的 5 个路径。
- `git diff --stat -- server e2e` 必须 0 行。

## 7. 验收标准

### 7.1 硬性验收（审核方执行，你不跑；仅供了解通过线）
- `client pnpm type-check`：仍 78（增量 0）。
- `client pnpm lint:check`：仍 137e/231w（增量 0）。
- `client pnpm test`：4 文件 / 22 用例全过。
- git status 仅 5 个预算文件；无 BOM。

### 7.2 交付报告模板（最终回复必须完整包含）
1. 完成范围概述
2. 5 个文件逐个说明（新增文件写职责；条件修改文件**逐处**列 before→after 摘要）
3. 交互要点落实确认（loading 锁、参考答案默认折叠、版本快照、手动定稿不调 LLM、403 直出）
4. 字典 code/name 处理说明
5. 越界自检（git status 全文）
6. 已知问题与遗留风险
7. 红线自检确认

按本提示词直接执行（headless 环境无人工确认环节）：先输出实施计划，然后动手，最终回复给出完整交付报告。
