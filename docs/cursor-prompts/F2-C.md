# F2-C 简历自动打分·前端 执行提示词

## ⚠️ 强约束（最优先阅读）

1. 本切片为**纯前端**切片：`server/**`、`e2e/**` 一行都不许动。
2. 文件预算 **6 个**（§6.1 逐一编号）。
3. 不跑验收命令（`pnpm test` / `type-check` / `lint` / `build` 都不跑，审核方重跑）；不启动 dev server。
4. 编码红线：禁整文件重写既有文件（CandidateDetail.vue / JobDetail.vue / DictionaryPage.vue 只准外科式插入）；新文件 UTF-8 无 BOM、LF 行尾、2 空格缩进、单引号；中文注释。
5. headless 无人工确认：先输出实施计划，然后直接动手。

## 1. 任务 ID + 目标

### 1.1 任务 ID
F2-C

### 1.2 任务目标
为 F2-S 已完成的「简历自动打分」服务端（已提交，3 个接口可用）实现前端：候选人详情页新增「AI 匹配分」卡片（维度条形图 + 理由展开 + 过期提示 + 手动补打），职位详情候选人表格加匹配分列与排序，设置页字典管理接入 `matching_dimension` 分类。需求见根目录 `PRD_阶段5_AI招聘增强与HR考核_20260901.md` §3.7 前端行。

### 1.3 端点清单（消费 3 个，全部已在 server 侧实现并测试通过）

| 方法 | 路径 | 返回 data | 说明 |
|---|---|---|---|
| POST | `/api/candidates/:id/match-score` | 单条打分对象 | body `{ jobId }`，同步执行，LLM 调用最长 60s，前端 loading 文案要提示「AI 打分中，可能需要 1 分钟」 |
| GET | `/api/candidates/:id/match-scores` | 打分对象数组（含关联 job 标题） | - |
| GET | `/api/jobs/:id/match-scores` | 打分对象数组（含候选人姓名，已按 overallScore 降序） | - |

打分对象字段（server `ScoreResult`，已实读）：
```ts
{
  id: string; candidateId: string; jobId: string;
  overallScore: number;           // 0-100，服务端已按权重重算
  grade: string;                  // 强烈推荐/推荐/待定/不推荐
  summary: string | null;
  dimensions: Array<{ name: string; weight: number; score: number; reason?: string }>;
  risks: string[] | null;
  highlights: string[] | null;
  stale: boolean;                 // true = JD 已更新，分数可能过期
  triggeredBy: string;            // auto / manual
  createdAt: string; updatedAt: string;
  // GET 列表额外带关联信息：jobId 对应职位标题、候选人姓名（动手前先读 server/src/services/match-score.service.ts 的 listCandidateMatchScores / listJobMatchScores 确认确切字段名，以源码为准）
}
```

## 2. 上下文

### 2.1 项目位置
仓库根即项目根；前端在 `client/`（Vue 3 `<script setup>` + TS + Element Plus + Pinia + vue-echarts）。

### 2.2 已核实事实（起草人已实读源码）

- **API 封装范式**：`client/src/api/*.ts`，`import request from '@/utils/request'`，返回 `Promise<{ success, data }>` 并做类型断言（参照 `client/src/api/ai-matcher.ts` 全文、仅 17 行）。
- **候选人详情页**：`client/src/views/candidates/CandidateDetail.vue`（1377 行），右侧/主区由若干 `el-card` 组成（info-card / timeline-card / action-card / offer-card / onboarding-card / interview-card / feedback-card / communication-card，见 13-376 行）。新卡片按同一范式插入 **info-card 之后**。
- **职位详情页**：`client/src/views/jobs/JobDetail.vue`（720 行），「关联候选人」el-table 在 182 行起，现有列：姓名/当前阶段/状态/学历/经验/投递时间/操作（199-244 行）。已有「AI 推荐候选人」卡片（145-181 行）可作交互风格参照。
- **字典页**：`client/src/views/settings/DictionaryPage.vue`（288 行）：分类用 `el-radio-group`（16-23 行，现有 7 个 radio-button），`CategoryKey` 联合类型定义在 110 行，`categoryText` computed 在 130 行。**新增分类只需**：radio-button 加一项 + CategoryKey 加 `'matching_dimension'` + categoryText 映射加「匹配维度」。权重存 description 字段（服务端约定，数字字符串）——该分类的表格说明列（如有 description 列）会自然显示权重，无需特判。
- **角色**：`client/src/stores/auth.ts` 的 userInfo.role 为 `'admin'|'member'|'hr'|'hiring_manager'|'interviewer'`。手动补打按钮可见性 = role ∈ {admin, member, hr, hiring_manager}（interviewer 隐藏；服务端仍会拦，前端只是体验层）。
- **图表**：不引入 echarts。维度分用 `el-progress` 条形（`:percentage="score"`，按分数段变色）即可，PRD 允许「雷达图或条形图」。

### 2.3 可复用模块（严禁重写）
`@/utils/request`、auth store、Element Plus 组件、既有卡片样式类（参照 CandidateDetail 内卡片）。

## 3. 必读约束

### 3.1 代码范式
`<script setup lang="ts">`；API 层与视图层分离；组合式函数可选。参照 `ai-matcher.ts`（API）与 CandidateDetail 现有卡片（视图）。

### 3.2 命名规范
组件 PascalCase；API 文件 kebab-case；props camelCase。

### 3.3 权限矩阵（与 server F2-S 一致）
| 角色 | 看分 | 手动补打按钮 |
|---|---|---|
| admin / hr / member / hiring_manager | ✅ | ✅ |
| interviewer | ✅ | ❌（隐藏按钮） |

### 3.4 错误处理约定
request 层已有统一错误提示（先读 `client/src/utils/request.ts` 确认，不要重复 ElMessage 报错导致双重提示）；LLM 失败（500「AI 打分失败，请稍后重试」）时卡片显示可重试的空态。

## 4. 实施任务

### 4.1 `client/src/api/match-score.ts`（新增）
类型 + 3 个函数：`triggerMatchScore(candidateId, jobId)`、`getCandidateMatchScores(candidateId)`、`getJobMatchScores(jobId)`。类型字段以 server `match-score.service.ts` 实际返回为准（先读再写）。

### 4.2 `client/src/components/candidates/MatchScoreCard.vue`（新增，核心）
- props：`candidateId: string`、`candidateJobs?: Array<{ jobId: string; title?: string }>`（用于手动补打的职位下拉；若详情页已有现成的关联职位数据就直接传入，先读 CandidateDetail 确认）。
- 加载时 `getCandidateMatchScores`；每条打分：职位名 + overallScore 大号数字 + grade 标签（强烈推荐 success / 推荐 primary / 待定 warning / 不推荐 danger）+ stale 时 `el-tag type="info"` 提示「JD 已更新，分数可能过期」+ summary + 维度 el-progress 条形列表（每条 name + weight% + score + 可展开 reason）+ risks/highlights 折叠展示（默认折叠，参考答案式交互不需要）。
- 「重新打分」按钮（每条打分上，对应 jobId 重触发）；「手动补打」按钮（卡片头部，el-select 选职位后 POST）。两者都按 §3.3 角色门禁。触发期间 el-loading + 文案提示 60s 可能耗时。
- 空态：无打分时显示说明 + 手动补打入口。

### 4.3 `client/src/views/candidates/CandidateDetail.vue`（条件修改）
info-card 之后插入 `<MatchScoreCard ... />`（import + 注册 + 模板一处插入；传 candidateId 与页面已有的关联职位数据）。改动控制在 10 行以内。

### 4.4 `client/src/views/jobs/JobDetail.vue`（条件修改）
- 关联候选人表格新增「匹配分」列（位于「经验」之后）：显示 overallScore + grade 小标签；无分显示 `-`；stale 显示小标记。
- 数据：`getJobMatchScores(jobId)` 一次拉取，按 candidateId 建 Map，在表格行渲染时查表合并（不改原候选人列表接口）。
- 列加 `sortable :sort-method` 按分数排序（无分排最后）。
- 改动控制在 40 行以内。

### 4.5 `client/src/views/settings/DictionaryPage.vue`（条件修改）
按 §2.2 三处加 `matching_dimension`（radio 标签「匹配维度」）。

### 4.6 `client/tests/` 不加测试
本仓库 client 测试基线仅 4 文件 22 用例（stores/utils 级），视图组件无测试惯例。本切片不加前端测试，验收走 type-check + lint + 既有测试全过。

## 5. 关键决策点

### 5.1 响应结构确认（最优先）
动手前先读 `server/src/services/match-score.service.ts` 的 `listCandidateMatchScores` / `listJobMatchScores` / `toScoreResult`，确认列表项里职位标题/候选人姓名的确切字段名（如 `job?.title` 还是 `jobTitle`），以源码为准写类型。

### 5.2 手动补打的职位选项来源
优先复用 CandidateDetail 页面已有的候选人关联职位数据（candidateJobs）；若页面没有现成数据，允许在卡片内调既有候选人详情字段，**不得**新增候选人相关 API 调用。

### 5.3 执行器环境特注
headless；不启动 vite dev server 做冒烟（审核方负责验证）；写完即交付。

### 5.4 不做清单
- 不做雷达图（el-progress 条形即可）
- 不做打分历史版本展示
- 不做打分完成的站内通知前端
- 不改 `ai-matcher.ts` 既有推荐功能
- 不动 server / e2e / package.json
- 不 git commit、不跑验收命令

## 6. 修改文件清单

### 6.1 必改文件（5 个；✱=新增，其余为条件修改）
1. ✱ `client/src/api/match-score.ts`
2. ✱ `client/src/components/candidates/MatchScoreCard.vue`
3. `client/src/views/candidates/CandidateDetail.vue`
4. `client/src/views/jobs/JobDetail.vue`
5. `client/src/views/settings/DictionaryPage.vue`

### 6.2 禁止修改文件
清单以外一切；特别地：`server/**`、`e2e/**`、任何 package.json、`client/src/utils/request.ts`、auth store、router。

### 6.3 越界检测（交付前自检）
- `git status --short` 只允许出现 6.1 的文件。
- `git diff --stat -- server e2e` 必须 0 行。

## 7. 验收标准

### 7.1 硬性验收（审核方执行，你不跑；仅供了解通过线）
- `client pnpm type-check`：不新增错误（存量基线 78 个）。
- `client pnpm lint:check`：不新增 error（存量基线 137e/231w）。
- `client pnpm test`：4 文件 / 22 用例全过（与基线持平）。
- `server pnpm test`：46 文件 / 445 用例全过（不受前端改动影响，复核用）。
- git status 仅预算文件；无 BOM。

### 7.2 交付报告模板（最终回复必须完整包含）
1. 完成范围概述
2. 文件逐个说明（新增写职责；条件修改**逐处**列 before→after 摘要与行数）
3. §5.1 字段确认结果（实际读到的返回结构）
4. 越界自检（git status 全文）
5. 已知问题与遗留风险
6. 红线自检确认

按本提示词直接执行（headless 环境无人工确认环节）：先输出实施计划，然后动手，最终回复给出完整交付报告。
