# F1-C JD 完善与辅助生成·前端 执行提示词

## ⚠️ 强约束（最优先阅读）

1. 本切片为**纯前端**切片：`server/**`、`e2e/**` 一行都不许动。
2. 文件预算 **4 个**（§6.1 逐一编号）。
3. 不跑验收命令（`pnpm test` / `type-check` / `lint` / `build` 都不跑，审核方重跑）；不启动 dev server。
4. 编码红线：禁整文件重写既有文件（JobForm.vue 只准外科式插入）；新文件 UTF-8 无 BOM、LF 行尾、2 空格缩进、单引号；中文注释。
5. headless 无人工确认：先输出实施计划，然后直接动手。

## 1. 任务 ID + 目标

### 1.1 任务 ID
F1-C

### 1.2 任务目标
为 F1-S 已完成的「JD 完善与辅助生成」服务端（已提交，2 个接口可用）实现前端两个场景（PRD §4.3，必读根目录 `PRD_阶段5_AI招聘增强与HR考核_20260901.md` 第 4 章）：
- **场景一（完善）**：职位编辑页「AI 完善建议」→ 弹窗左侧原 JD、右侧问题清单 + 优化稿对照，「采用优化稿」覆盖到编辑框（**不自动保存**）。
- **场景二（生成）**：新建/编辑页「AI 辅助生成」→ 弹窗表单（名称/部门/职级必填 + 大白话自由描述选填）→ 草稿预览 →「填入编辑器」（**不自动保存**）。

### 1.3 端点清单（消费 2 个，server 已实现并测试通过）

| 方法 | 路径 | body | 返回 data |
|---|---|---|---|
| POST | `/api/jobs/ai-polish` | `{ jdText, meta?: { title?, level?, departments?, type? } }` | `{ issues: [{ title, detail, severity: '高'|'中'|'低' }], improvedJd: string }` |
| POST | `/api/jobs/ai-draft` | `{ title, departments: string[], level, type, freeText? }` | `{ draftJd: string }` |

两接口均同步执行（LLM 最长 60s）+ 限流 15 分钟 20 次（429 时给出中文提示）； interviewer 角色 403（前端按 §3.3 隐藏入口即可）。

## 2. 上下文

### 2.1 项目位置
仓库根即项目根；前端在 `client/`（Vue 3 `<script setup>` + TS + Element Plus + Pinia）。

### 2.2 已核实事实（起草人已实读源码）

- **职位表单**：`client/src/views/jobs/JobForm.vue`（534 行）。`isEdit` computed（13 行）区分编辑/发布；`formData` 含 `title / departments / level / location / type / skills / tagIds / description / requirements / status`；JD 编辑器是 `QuillEditor`（`@vueup/vue-quill`，142-168 行，`v-model:content`，`contentType` 先读文件确认是 html 还是 delta/text）。提交按钮 200 行（「保存修改/立即发布」）。部门选项数据源先读文件确认（疑似 dictionary store 的 department 分类）。
- **API 封装范式**：`client/src/api/*.ts`，`import request from '@/utils/request'`，类型断言返回（参照 `client/src/api/match-score.ts`）。
- **角色门禁**：`client/src/stores/auth.ts` userInfo.role ∈ {admin, member, hr, hiring_manager, interviewer}；AI 入口可见性 = 除 interviewer 外都可见（参照 F2-C `MatchScoreCard.vue` 的门禁写法）。
- **限流/错误提示**：`client/src/utils/request.ts` 已有统一错误处理（先读确认，避免双重 ElMessage）。

### 2.3 可复用模块（严禁重写）
`@/utils/request`、auth store、Element Plus、JobForm 既有 formData 与 QuillEditor。

## 3. 必读约束

### 3.1 代码范式
`<script setup lang="ts">`；弹窗组件化（不堆进 JobForm）；emit 由父级落地。

### 3.2 命名规范
组件 PascalCase：`JdPolishDialog.vue` / `JdDraftDialog.vue`；API 文件 `jd-assist.ts`。

### 3.3 权限矩阵（与 server F1-S 一致）
| 角色 | AI 入口按钮 |
|---|---|
| admin / hr / member / hiring_manager | ✅ |
| interviewer | ❌（隐藏） |

### 3.4 关键交互红线
AI 产出**绝不直接落库**：两个弹窗的「采用/填入」只写 formData，保存仍走职位表单原有按钮（PRD §4.1「生成草稿 → 人工确认后才保存」）。

## 4. 实施任务

### 4.1 `client/src/api/jd-assist.ts`（新增）
类型（JdIssue / PolishResult / DraftResult / PolishParams / DraftParams）+ `polishJd(params)` / `draftJd(params)` 两函数（范式参照 match-score.ts）。

### 4.2 `client/src/components/jobs/JdPolishDialog.vue`（新增）
- props：`modelValue: boolean`（显隐）、`jdText: string`（当前 JD）、`meta: { title?, level?, departments?, type? }`；emit：`update:modelValue`、`apply(improvedJd: string)`。
- 打开时不自动调用；点「开始诊断」才 POST（防误触烧 token）；调用期间 el-loading + 文案「AI 诊断中，可能需要 1 分钟」。
- 结果区左右对照：左侧原 JD 只读展示，右侧上方 issues 列表（severity 用 el-tag：高 danger / 中 warning / 低 info，每条 title + detail），右侧下方优化稿预览（白底 pre-wrap 文本即可，不渲染 HTML）。
- 底部「采用优化稿」主按钮 → emit('apply') + 关闭；「重新生成」次按钮。

### 4.3 `client/src/components/jobs/JdDraftDialog.vue`（新增）
- props：`modelValue`、`initial: { title?, departments?, level?, type? }`（从 JobForm 已填字段预填）；emit：`update:modelValue`、`apply(draftJd: string)`。
- 表单：职位名称/所属部门（多选，选项来源与 JobForm 一致）/职级/招聘类型 必填 + 自由描述 textarea（选填，占位符「用大白话描述用人需求，如：要一个能独立带无人机项目的结构工程师…」）。
- 「生成草稿」→ POST（loading 同上）→ 草稿预览区 →「填入编辑器」emit('apply') + 关闭；「重新生成」可改表单后再点。
- 表单校验：必填未填不允许提交。

### 4.4 `client/src/views/jobs/JobForm.vue`（条件修改，≤50 行）
- 在 JD 编辑器区域上方（142 行 el-form-item 之前）加两个按钮：「AI 完善建议」（jdText 为空时禁用并提示）与「AI 辅助生成」，按 §3.3 角色门禁。
- 挂载两个 Dialog；`apply` 处理：把返回文本做**最小 HTML 转换**（按空行分段包 `<p>`、行内换行转 `<br>`）后写入 `formData.description`（polish 场景：若当前 description 非空，先 ElMessageBox 确认「将覆盖当前 JD 内容」）；**不触发任何保存请求**。

## 5. 关键决策点

### 5.1 QuillEditor contentType 确认（最优先）
先读 JobForm.vue 的 QuillEditor 用法确认 content 格式（html / delta / text），apply 写入格式必须与之匹配，否则编辑器显示异常。

### 5.2 部门选项来源
读 JobForm.vue 确认 departments 下拉的数据源（dictionary store 或常量），JdDraftDialog 复用同一来源，不另起炉灶。

### 5.3 执行器环境特注
headless；不启动 vite dev server 冒烟；写完即交付。

### 5.4 不做清单
- 不做流式输出、不做历史记录、不做 Markdown 渲染（pre-wrap 纯文本预览即可）
- 不改 requirements 编辑器（AI 产出只进 description）
- 不动 server / e2e / package.json / router / store
- 不 git commit、不跑验收命令

## 6. 修改文件清单

### 6.1 必改文件（4 个；✱=新增，其余为条件修改）
1. ✱ `client/src/api/jd-assist.ts`
2. ✱ `client/src/components/jobs/JdPolishDialog.vue`
3. ✱ `client/src/components/jobs/JdDraftDialog.vue`
4. `client/src/views/jobs/JobForm.vue`

### 6.2 禁止修改文件
清单以外一切；特别地：`server/**`、`e2e/**`、任何 package.json、`client/src/utils/request.ts`、stores、router。

### 6.3 越界检测（交付前自检）
- `git status --short` 只允许出现 6.1 的 4 个文件。
- `git diff --stat -- server e2e` 必须 0 行。

## 7. 验收标准

### 7.1 硬性验收（审核方执行，你不跑；仅供了解通过线）
- `client pnpm type-check`：不新增错误（存量基线 78 个）。
- `client pnpm lint:check`：不新增 error（存量基线 137e/231w）。
- `client pnpm test`：4 文件 / 22 用例全过。
- `server pnpm test`：48 文件 / 465 用例全过（复核用）。
- git status 仅 4 个预算文件；无 BOM。

### 7.2 交付报告模板（最终回复必须完整包含）
1. 完成范围概述
2. 4 个文件逐个说明（条件修改逐处 before→after）
3. §5.1 contentType 确认结果与 apply 转换策略
4. 越界自检（git status 全文）
5. 已知问题与遗留风险
6. 红线自检确认

按本提示词直接执行（headless 环境无人工确认环节）：先输出实施计划，然后动手，最终回复给出完整交付报告。
