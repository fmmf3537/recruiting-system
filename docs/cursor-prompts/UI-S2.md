# UI-S2 候选人列表信息密度与操作收纳 执行提示词

> **前置**：先粘贴 `UI-GUARD.md` 并等 Cursor 确认后，再粘贴本文件。
> **依赖**：建议 UI-S0 完成后再做（复用 `EmptyState` 与 token；若 S0 未做，空态先内联简单实现，不阻塞）。

## ⚠️ 强约束（最优先阅读）

1. 本切片为**纯前端**切片：`server/**`、`e2e/**`、`mobile/**` 一行不动。
2. **不删任何数据绑定**：现有 `el-table-column` 的 `prop` 一律**保留**，只允许：调整顺序 / 宽度 / 显隐默认值 / 单元格渲染方式。**唯一例外**：`:164` 的 `type="index"` 序号列**无 `prop` 绑定，允许移除**（数据不受影响）。
3. **不改数据获取逻辑**：不碰分页参数、筛选参数、排序参数、任何 API 调用与响应解析。
4. **不改任何路由/菜单**；不改 `client/src/api/candidate.ts`（只读）。
5. 文件预算 **3 个**（既有文件增量 diff），**禁止整文件重写**（`candidates/index.vue` 有 829 行）。
6. 新布局用**开关** `ui:new-layout:UI-S2`（`localStorage` 或 `stores/app.ts`），关闭时回到改造前渲染。
7. **不跑验收命令**；UTF-8 无 BOM、LF、2 空格缩进、单引号、中文注释；**不新增依赖**。
8. headless 无人工确认：先输出实施计划，然后直接动手。

## 1. 任务 ID + 目标

### 1.1 任务 ID
UI-S2

### 1.2 任务目标
改造 `候选人管理` 列表页（`client/src/views/candidates/index.vue`）的信息密度与操作收纳，解决四类问题：

| 现状问题 | 改造目标 |
|---|---|
| 姓名列窄导致姓名**竖排断行**，与电话挤在一起 | 候选人单元格：圆形头像 + 姓名（加粗单行）+ 手机号（次要色 11px），不再断行 |
| 「当前阶段」与「状态」两列**视觉雷同**，用户分不清 | 语义正交呈现：阶段 = 彩色 tag（进程维度）；状态 = 弱化小标（结果维度：人才库/已淘汰）；已淘汰行整体弱化（opacity） |
| 「应聘职位」「标签」列大量显示 `-` | 空值显示「未填写」（占位色）；标签改为 chip + `+N` 折叠 |
| 操作列 220px 平铺 4 个文字链接，含**两个红色危险操作** | 收为「详情」+ `⋯` 下拉（推进 / 加入人才库 / 导出 / **淘汰** / **删除**），危险操作在下拉内且**二次确认** |
| 有复选框但**无批量操作条** | 选中后顶部出现批量操作条（批量推进 / 加入人才库 / 导出 / 淘汰），取消即隐藏 |
| 列表无排序、无空态 | 「入库时间」列加 `sortable`（前端已支持则用现有能力）；空数据用 `EmptyState` |
| 序号列占 70px 且价值低 | 移除 `:164` 的 `type="index"` 列（无 prop 绑定） |

### 1.3 非目标
- 不做列设置面板 / 密度切换（留待后续切片，**若本次预算允许可作为可选项**，见 §4.5）
- 不改筛选栏布局（筛选栏改造归 UI-S2b）
- 不做虚拟滚动、不做导出功能开发（导出仅当**已有**能力才接入）

## 2. 上下文

### 2.1 关键已核实事实（起草人已实读源码，可直接采信）

`client/src/views/candidates/index.vue`（**829 行**）表格列定义精确位置：

| 行号 | 内容 |
|---|---|
| `:163` | `<el-table-column type="selection" width="50" align="center" />` |
| `:164` | `<el-table-column type="index" label="序号" width="70" align="center" />` |
| `:166` | `<el-table-column prop="name" label="候选人" min-width="150">`（插槽至 `:184`） |
| `:186` | `<el-table-column prop="currentStage" label="当前阶段" width="120" align="center">`（插槽至 `:192`） |
| `:194` | `<el-table-column prop="stageStatus" label="状态" width="100" align="center">`（插槽至 `:200`） |
| `:202` | `<el-table-column prop="candidateJobs" label="应聘职位" min-width="150">`（插槽至 `:217`） |
| `:219` | `<el-table-column prop="tags" label="标签" min-width="120">`（插槽至 `:235`） |
| `:237` | `<el-table-column prop="source" label="来源" width="120" align="center" />` |
| `:239` | `<el-table-column prop="education" label="学历" width="100" align="center">`（插槽至 `:243`） |
| `:245` | `<el-table-column prop="createdAt" label="入库时间" width="160">`（插槽至 `:249`） |
| `:251` | `<el-table-column label="操作" width="220" fixed="right">`（插槽至 `:266`） |

- **现有操作**（`:251-266` 内）：详情 / 推进 / 淘汰 / 删除（后两者为红色文字链接）。
- 页面顶部已有「新增候选人」「上传简历」等按钮（本切片**不动顶部按钮区**）。
- 阶段取值与颜色映射：以 `currentStage` 的实际取值为准（**先读插槽内现有 tag 逻辑**，沿用其取值，**不要自造新的阶段枚举**）。
- **验收基线**：`client pnpm type-check` **88**（0 新增）、`client pnpm lint:check` **137e/224w**（0 新增）、`client pnpm test` 4 文件 / 22 用例全过。

## 3. 必读约束

### 3.1 反直觉点（显式标注）
1. **「阶段」与「状态」不可合并成一列**：`currentStage`（进程：入库/初筛/面试/Offer/入职）与 `stageStatus`（结果：正常/人才库/已淘汰）是**正交维度**，合并会丢信息。正确做法是**视觉分层**：阶段用彩色 tag（主视觉），状态用弱化小标（仅非"正常"时显示，避免满屏 tag）。
2. **危险操作收纳不等于移除**：「淘汰」「删除」必须**仍然可达**（放进 `⋯` 下拉），且保留二次确认（`ElMessageBox.confirm`）。**禁止因为"收纳"而删掉功能。**
3. **已淘汰行弱化要克制**：用 `opacity: 0.72` + 次要文字色即可，**不要用删除线、不要改背景色**（会影响可读性）。
4. **头像用文字首字母**，不请求任何图片接口、不新增字段（数据结构零改动）。
5. **排序用 Element Plus 原生 `sortable`**（`sortable` 或 `sortable="custom"`）；若现有代码已有排序处理逻辑，**沿用现有处理**，不要另起一套。
6. **空态只在"已加载完成且 0 条"时显示**，加载中仍用现有 `v-loading`（避免闪烁）。

### 3.2 阶段 tag 配色（沿用既有取值，只改样式）
```
入库/初筛  → 浅灰底 + 深灰字
面试中     → 浅蓝底 + 深蓝字
拟录用/Offer → 浅绿底 + 深绿字
已入职     → 深绿底 + 白字
```
**若现有代码已有 tag type 映射（el-tag type="success" 等），保留其语义，只把颜色换成上述 token**，并在报告里说明映射前后对照。

## 4. 实施任务

### 4.1 `client/src/views/candidates/index.vue`（**条件修改，主体**）

1. **移除** `:164` 序号列（**唯一允许的列移除**，无 prop 绑定；加中文注释说明原因）。
2. `:166` 候选人列插槽（`:166-184`）改为：
```vue
<!-- UI-S2：头像 + 姓名 + 手机号，解决姓名竖排断行 -->
<div class="ui-cand-cell">
  <span class="ui-cand-avatar">{{ row.name?.charAt(0) ?? '?' }}</span>
  <span class="ui-cand-meta">
    <span class="ui-cand-name">{{ row.name || '未填写' }}</span>
    <span class="ui-cand-phone">{{ row.phone || '未填写' }}</span>
  </span>
</div>
```
   - `.ui-cand-name` 必须 `white-space: nowrap`，宽度不足用省略号（**不再换行**）。
3. `:186` 阶段列：沿用现有取值判断，改为**圆角 pill 彩色 tag**（§3.2 配色），`min-width` 调整以避免挤压。
4. `:194` 状态列：**仅在值 ≠ 正常时显示**弱化小标（如「人才库」「已淘汰」），值为正常时留空（不加 tag）；`#default` 插槽内判断。
5. `:202` 应聘职位、`:237` 来源、`:239` 学历：空值显示「未填写」（占位色），**保留原 prop 与插槽结构**。
6. `:219` 标签列：最多显示 1 个 chip，其余 `+N`（`el-tooltip` 显示完整标签名）；空则「未填写」。
7. `:245` 入库时间：加 `sortable`（若页面已有 `@sort-change` 处理则沿用）；**不改 prop、不改时间格式化逻辑**。
8. `:251` 操作列：`width` 由 220 调整为 **72**；内容改为：
```vue
<!-- UI-S2：操作收纳，危险操作进下拉并二次确认（功能一个不少） -->
<el-button link type="primary" @click="goDetail(row)">详情</el-button>
<el-dropdown @command="(cmd) => handleCommand(cmd, row)">
  <el-button link>⋯</el-button>
  <template #dropdown>
    <el-dropdown-menu>
      <el-dropdown-item command="advance">推进</el-dropdown-item>
      <el-dropdown-item command="talent">加入人才库</el-dropdown-item>
      <el-dropdown-item command="reject" divided>淘汰</el-dropdown-item>
      <el-dropdown-item command="delete">删除</el-dropdown-item>
    </el-dropdown-menu>
  </template>
</el-dropdown>
```
   - `handleCommand` **内部复用现有"推进/淘汰/删除"的处理函数**（**不要重写业务逻辑**，只做分发调用）。
   - 「淘汰」「删除」保留原有 `ElMessageBox.confirm` 二次确认。
   - **删除现有 4 个平铺链接的模板代码**（逻辑函数保留）。
9. **批量操作条**：`el-table` 上方新增（受 UI 开关控制），`v-if="selectedRows.length > 0"`：
```
已选 N 位候选人   [批量推进] [加入人才库] [导出] [淘汰]  取消
```
   - 批量操作**复用现有单行操作的函数**（循环调用），不新增业务接口。
   - 若某项批量能力当前**不存在**（如批量推进后端不支持）→ **不显示该按钮**，并在报告列出「因缺少批量接口而未提供的能力」。
10. **空态**：`<el-table>` 内加 `<template #empty>`，渲染 `EmptyState`（UI-S0 组件）；若 S0 未落地，内联最小实现（图标 + 「暂无候选人」+ 「上传简历」按钮，按钮复用现有跳转）。
11. `<style scoped>` 内新增样式，**统一用 UI-S0 的 token**（`$ui-*`）；若 S0 未落地则直接写值并加 `TODO(UI-S0)` 注释。

### 4.2 开关与回退（**强制**）
- 在 `client/src/stores/app.ts`（或就近的 UI 状态处）新增：`uiNewListLayout`（默认 **true** = 新布局）。
- 模板上用 `v-if="uiNewListLayout"` / `v-else` 切换新旧列渲染；**旧分支保留完整原代码**（不删），确保开关关闭时 100% 回到改造前。
- 开关**默认开启**（`!== 'false'`，键缺失即启用新布局）；保留开关只为保留一键回退能力：

  ```ts
  const uiNewListLayout = ref(localStorage.getItem('ui:new-layout:UI-S2') !== 'false');
  ```

  回退：`localStorage.setItem('ui:new-layout:UI-S2', 'false')` 后刷新。

  > 策略说明（2026-09-09 更新）：切片经审计确认无回归后，即由人工改为默认开启，不再长期灰度。
  > **但 UI-S1（导航分组）属于例外**——它改变所有人找菜单的路径，影响面最大，仍应默认关闭灰度，确认稳定后再开启。
- 报告写明回退方式（开关置 false 或 localStorage 键 `ui:new-layout:UI-S2=false`）。

### 4.3 不改的部分（明确列出，防止误伤）
- 顶部按钮区（新增候选人 / 上传简历 / 筛选栏）
- 分页组件与分页逻辑
- 所有 `fetchXxx` 数据获取函数与 API 调用
- `client/src/api/candidate.ts`

### 4.4 可选（预算允许再做，**需报告说明是否做了**）
- 列设置：勾选控制各列显隐（**默认全显示**，不减少任何列）
- 密度切换：紧凑 / 标准

### 4.5 若文件改动过大（>150 行 diff）
把新列渲染抽成 `client/src/components/candidates/CandidateTable.vue`（✱ 新增），`index.vue` 只做挂载与 props/events 转发（**数据获取仍在 index.vue**）。

## 5. 关键决策点

### 5.1 为什么保留「阶段」「状态」两列而不合并
二者是正交维度：阶段回答"走到哪一步"，状态回答"是否还在流程内/已归档"。合并会让人无法区分"已淘汰但停在面试阶段"与"面试中"。

### 5.2 为什么操作收进下拉而不是全部平铺
4 个文字链接（含 2 个红色）会产生误触风险且挤压内容区。收纳后主操作（详情）仍一键可达，危险操作需两步（下拉 + 确认），**功能不减少**。

### 5.3 为什么用开关而不是直接改
系统**已在生产使用**，老用户习惯需要过渡；开关可一键回退，降低发布风险。

## 6. 修改文件清单

### 6.1 必改文件（2 个，或 3 个走 §4.5 方案）
1. `client/src/views/candidates/index.vue`（列渲染 / 操作收纳 / 批量条 / 空态 / 开关）
2. `client/src/stores/app.ts`（或就近 UI 状态处，加 `uiNewListLayout`）
3. （可选）✱ `client/src/components/candidates/CandidateTable.vue`（仅当 diff > 150 行）

### 6.2 禁止修改文件
- `server/**`、`e2e/**`、`mobile/**`、任何 `package.json`
- `client/src/api/candidate.ts`、`client/src/router/index.ts`
- `client/src/views/candidates/CandidateDetail.vue`（详情页本切片不动）
- 其他任何列表页（本切片**只改候选人列表**，作为模板页）

### 6.3 越界检测
- `git status --short` 只允许 §6.1 路径。
- `git diff --stat -- server e2e mobile` 必须 **0 行**。
- `git diff -- client/src/views/candidates/index.vue` 中，数据获取相关函数（`fetch*`、`onMounted` 内的列表请求、分页处理）**不得有删除行**。

## 7. 验收标准

### 7.1 硬性验收（审核方执行，你不跑）
- `client pnpm type-check`：仍 **88**（0 新增）。
- `client pnpm lint:check`：仍 **137e/224w**（0 新增）。
- `client pnpm test`：4 文件 / 22 用例全过。
- `git diff --stat -- server e2e mobile` = 0 行。
- **手工验证**（审核方做，你确保代码支持）：
  1. 列表正常渲染，姓名不再断行，手机号次要显示
  2. 阶段 tag 有颜色区分；状态仅在非"正常"时显示小标
  3. 空值显示「未填写」而非 `-`
  4. 勾选后顶部出现批量条；取消后隐藏
  5. `⋯` 下拉内「淘汰」「删除」仍可触发且**保留二次确认**
  6. 开关关闭后，列表回到改造前的渲染（含 4 个平铺操作链接）
  7. 无数据时显示空态（非空白）

### 7.2 交付报告模板
1. 完成范围概述。
2. 文件逐个说明（既有文件**逐处** before→after 摘要 + 中文注释位置）。
3. **列变更对照表**：每一列改造前后（prop 是否保留 / 宽度 / 渲染方式 / 是否可隐藏）。
4. **操作收纳对照表**：改造前 4 个操作 → 改造后位置（证明功能一个不少）。
5. 批量能力说明（哪些做了、哪些因缺少批量接口未做）。
6. **功能零回归自检表**（按 `UI-GUARD.md` 第四节第 3 项逐项打勾 + 证据）。
7. 越界自检（`git status --short` 全文 + `git diff --stat -- server e2e mobile`）。
8. 已知问题与遗留风险（如未做的列设置/密度、批量接口缺失项）。
9. 红线自检确认（GUARD 第一节 8 条）。
10. **回退方式**（开关名 + 具体步骤）。

按本提示词直接执行：先输出实施计划，然后动手，最终回复给出完整交付报告。
