# UI-S5 职位发布表单：工具栏减负 + AI 入口收敛 + 发布前检查栏 执行提示词

> **前置**：先粘贴 `UI-GUARD.md` 并等 Cursor 确认后，再粘贴本文件。
> **依赖**：建议在 UI-S0 之后执行（可复用 token）；不依赖也能独立完成（见 §3.4）。

## ⚠️ 强约束（最优先阅读）

1. **纯前端**：`server/**`、`e2e/**`、`mobile/**` 一行不动。
2. **不新增、不删除、不重命名任何表单字段**：本表单当前只有 **10 个 `prop`**——`title`、`departments`、`level`、`location`、`type`、`skills`、`tagIds`、`description`、`requirements`、`status`。**这 10 个一个都不能少、不能改名**。
   > ⚠️ 特别提示：我此前在设计稿里提过「薪资结构化」「薪资未填检查项」——**该字段在本表单中并不存在**（已核实：全文件无 `salary` / `薪资` 字段）。**严禁新增薪资字段**（后端不一定有对应列，会直接导致提交失败）。本切片只基于**现有的 10 个字段**做检查。
3. **不改校验规则**：`formRules`（约第 360 行起）的内容**只许读、不许改**（检查栏是「读取现有规则的校验结果」来展示，不是另立一套规则）。
4. **不改提交逻辑**：`handleSubmit()`（第 505 行）内的 `formRef.value?.validate()` 与后续提交流程**保持原样**。
5. **禁止整文件重写**：`client/src/views/jobs/JobForm.vue`（**643 行**）全部用局部插入/替换方式修改。
6. 变更用**开关** `ui:new-layout:UI-S5` 控制；关闭时回到改造前渲染（含**完整保留原工具栏**）。
7. **不跑验收命令**（审核方重跑）。
8. 编码红线：UTF-8 无 BOM、LF、2 空格缩进、单引号、中文注释；**零新增依赖**。
9. headless 无人工确认：先输出实施计划，然后直接动手。

## 1. 任务 ID + 目标

### 1.1 任务 ID
UI-S5

### 1.2 任务目标
三件事，全部是**在不改数据、不改校验、不改提交流程**前提下的呈现层优化：

1. **富文本工具栏减负**（Quill）：当前工具栏 10 组（含字体、字号、颜色、背景色、上下标、缩进、文字方向等 10 余项），厚重且 90% 用不上 → 精简为常用 5 组。
2. **AI 入口收敛**：当前「AI 完善建议 / AI 辅助生成」是独立占一整行的 `el-form-item`，像临时外贴的补丁 → 收进「职位描述」编辑器的标题行右端。
3. **新增「发布前检查」侧栏**：实时列出当前未满足的必填项，点击可定位到对应字段，避免「点了提交才发现漏填」。

### 1.3 为什么（现状证据，已实读源码）

- `client/src/views/jobs/JobForm.vue`（**643 行**）：
  - 布局：第 25 行 `<el-row :gutter="30">` → 第 26 行 `<el-col :span="16">` 左栏（主字段），第 186 行 `<el-col :span="8">` 右栏（状态 + 提交）。
  - 左栏字段行号：`title`(31)、`departments`(42)、`level`(59)、`location`(70)、`type`(86)、`skills`(100)、`tagIds`(119)。
  - **AI 按钮**：第 **143–155 行** `<el-form-item v-if="canAi" label-width="0" class="jd-ai-actions">`，内含两个按钮（`@click` 分别打开 `JdPolishDialog` 与 `JdDraftDialog`，第 150 / 152–154 行）。第 142 行有注释说明 `interviewer` 角色隐藏、服务端兜底拦截 —— **这个 `v-if="canAi"` 判断必须原样保留**。
  - 富文本：`description` 的 `<QuillEditor>` 在**第 157 行**，`requirements` 在**第 173 行**（组件来自 `@vueup/vue-quill`，样式 `vue-quill.snow.css`）。
  - 右栏：`status` 的 `el-form-item` 在**第 191 行**（`el-radio` 值 `open` / `paused`，**没有草稿状态**），其后是提交/取消按钮（约 207 / 216 行）。
  - `editorOptions` 定义在**第 339–359 行**，`toolbar` 数组为 **10 组**：
    `['bold','italic','underline','strike']`、`['blockquote','code-block']`、`[{header:1},{header:2}]`、`[{list:'ordered'},{list:'bullet'}]`、`[{script:'sub'},{script:'super'}]`、`[{indent:'-1'},{indent:'+1'}]`、`[{direction:'rtl'}]`、`[{size:[...]}]`、`[{header:[1..6,false]}]`、`[{color:[]},{background:[]}]`、`[{font:[]}]`、`[{align:[]}]`、`['clean']`。
  - `formRules` 从**第 360 行**起（已见必填：`title`、`departments`、`level`、`location`、`type` 等，其余请自行读全文确认）。
  - `formRef` 第 **306 行**；`handleSubmit` 第 **505 行**（第 506 行 `validate()`）。

## 2. 上下文

### 2.1 项目位置
前端在 `client/`（Vue 3 `<script setup>` + TS + Element Plus 2.5 + Quill via `@vueup/vue-quill`）。路径别名 `@/*` → `src/*`。

### 2.2 关键已核实事实（可直接采信）
- **`status` 只有 `open` / `paused` 两个值** → 因此**不要设计「存为草稿」按钮**（那是新状态，属后端能力变更）。
- `canAi` 是权限判断（第 142 行注释：interviewer 隐藏，服务端仍兜底拦截）→ 移动位置时**必须保留 `v-if="canAi"`**。
- 两个 AI 弹窗组件已存在：`@/components/jobs/JdPolishDialog.vue`、`@/components/jobs/JdDraftDialog.vue`（第 280–281 行 import）。**只搬按钮位置，不改弹窗调用方式**。
- **验收基线**（审核方重跑）：`client pnpm type-check` **88**、lint **137 errors / 224 warnings**、`client pnpm test` 4 文件 / 22 用例全过。

## 3. 必读约束

### 3.1 反直觉点（显式标注）

1. **检查栏不是新规则**：它只**展示现有 `formRules` 的校验结果**。实现方式建议：读取 `formRules` 中 `required: true` 的字段清单 + 当前 `formData` 的值，前端判空得出「未满足项」。**不要手写一份必填清单**（会与规则漂移）。
2. **不要禁用提交按钮**：我早期设计稿里写过「必填未满足时禁用发布按钮」——**撤回**。禁用按钮会让用户不知道为什么点不了，且与现有 `validate()` 行为冲突。**正确做法**：按钮始终可点，点击后由**现有** `validate()` 处理（Element Plus 默认会滚动定位到第一个错误字段）；检查栏只做「提前告知 + 主动定位」。
3. **工具栏精简是可回退的**：原数组必须以**注释形式**保留在代码中，开关关闭时恢复原数组。
4. **`label-width="0"` 的 form-item 不要乱改**：AI 按钮那一项（143 行）与两个 QuillEditor 项（156、172 行）都是 `label-width="0"`，这是刻意的（编辑器自带占位），改动会错位。
5. **右栏只有一个 `status` 字段 + 按钮**，空间充足，检查栏插在 `status` **之前**。

### 3.2 工具栏精简方案（照此实现）

**保留 5 组**：`['bold','italic']`、`[{ header: [1, 2, 3, false] }]`、`[{ list: 'ordered' }, { list: 'bullet' }]`、`['clean']`。
**移除**：`underline`、`strike`、`blockquote`、`code-block`、上下标、缩进、`direction`、字号、颜色、背景色、字体、对齐。

> 说明：招聘 JD 的实际编辑需求就是加粗、小标题、列表。移除颜色/字体类可避免"花哨 JD"，也减少粘贴外部格式带来的样式污染。

### 3.3 AI 入口新位置（照此实现）

在 `description` 的 QuillEditor（第 157 行）**上方**插入一行「标题 + 右侧 AI 按钮」：
```vue
<!-- UI-S5：AI 入口收敛到「职位描述」标题行右端（原独立整行 form-item 已移除） -->
<div class="jd-section-header">
  <span class="jd-section-title">职位描述</span>
  <el-form-item v-if="canAi" label-width="0" class="jd-ai-actions">
    <el-button size="small" :icon="MagicStick" @click="openPolishDialog">AI 完善建议</el-button>
    <el-button size="small" type="success" plain :icon="MagicStick" @click="openDraftDialog">
      AI 辅助生成
    </el-button>
  </el-form-item>
</div>
```
- **必须保持 `v-if="canAi"`**。
- **`@click` 的方法名以文件内实际定义为准**（我未逐一确认方法名，请先 `grep` 确认 `openPolishDialog` / `openDraftDialog` 的真实名称，**照抄原名，不要臆造**）。
- 原第 143–155 行的整个 `el-form-item`（及其第 142 行注释）**删除**（这是搬迁，不是删功能）。

### 3.4 开关关闭时的行为
- 工具栏：恢复 §1.3 列出的**原 10 组**数组。
- AI 入口：如需严格回退，可用 `v-if/v-else` 保留原独立整行写法；**建议**采用「搬迁后位置固定、仅工具栏与检查栏受开关控制」，并在报告中明确说明这一点。

## 4. 实施任务

### 4.1 工具栏精简（第 339–359 行附近）

```ts
// UI-S5：新布局使用精简工具栏（UI 开关 ui:new-layout:UI-S5）
// 原完整工具栏（回退用，勿删）：
// ['bold','italic','underline','strike'],['blockquote','code-block'],
// [{header:1},{header:2}],[{list:'ordered'},{list:'bullet'}],
// [{script:'sub'},{script:'super'}],[{indent:'-1'},{indent:'+1'}],
// [{direction:'rtl'}],[{size:['small',false,'large','huge']}],
// [{header:[1,2,3,4,5,6,false]}],[{color:[]},{background:[]}],
// [{font:[]}],[{align:[]}],['clean']
const editorOptions = computed(() => ({
  modules: {
    toolbar: newLayout.value
      ? [
          ['bold', 'italic'],
          [{ header: [1, 2, 3, false] }],
          [{ list: 'ordered' }, { list: 'bullet' }],
          ['clean'],
        ]
      : [ /* 原 10 组原样粘贴 */ ],
  },
  placeholder: '请输入内容...',
}));
```
> 若 `editorOptions` 当前是普通对象而非 `computed`，改为 `computed` 即可（Quill 的 `:options` 接受响应式对象；若实测不生效，改为在开关变化时**重新 key 编辑器**——但**禁止**因此重写整个编辑器用法，优先保持最小改动）。

### 4.2 AI 入口搬迁（第 142–157 行）

按 §3.3 执行。每处加中文注释。

### 4.3 ✱ 发布前检查栏（右栏，插在 `status` 之前）

新增组件 `client/src/components/jobs/JobPublishChecklist.vue`：

```ts
type Props = {
  // 传入「字段名 → 展示名 → 是否已填」的清单，由父组件基于现有 formRules + formData 计算
  items: { prop: string; label: string; done: boolean }[];
};
emits: ['locate'];   // 点击某一项 → 父组件滚动定位到该字段
```

- 展示：标题「发布前检查」+ 完成度（如 `3/5`）+ 逐项清单（✅ 已填 / ○ 未填，用**内联 SVG 或 Element Plus 已有图标**，不用 emoji）。
- 全部完成时显示「可以发布了」提示条。
- **纯展示组件**，不发请求、不改数据。
- `<style scoped>`，放在 `el-card` 内。

父组件侧计算（**只读现有规则，不另立规则**）：
```ts
// UI-S5：基于现有 formRules 推导必填项，不新增/修改任何校验规则
const checklist = computed(() =>
  Object.entries(formRules.value)
    .filter(([, rules]) => (rules as any[]).some((r: any) => r?.required))
    .map(([prop, rules]) => {
      const r = (rules as any[]).find((x: any) => x?.required);
      return { prop, label: r?.message ?? prop, done: !isEmpty(formData[prop]) };
    }),
);
```
- `isEmpty` 自行实现（空串 / `undefined` / `null` / 空数组视为空；**数字 0 视为已填**）。
- `label` 直接用规则里的 `message`（如「请输入职位名称」），**不要自己翻译字段名**。若 `message` 语义不适合做清单项（如「长度在 2 到 100 个字符」），取该字段**第一条** required 规则的 message，并在报告中说明。
- 定位实现：`formRef.value?.scrollToField(prop)`（Element Plus 原生方法，**不新增依赖**）。

### 4.4 样式

- `.jd-section-header`：`display:flex; align-items:center; justify-content:space-between;`。
- `.jd-ai-actions`：去掉 `margin-bottom`（原来作为独立 form-item 有下边距，现在同行需要收紧）。
- 检查栏：右侧卡片 `shadow="never"`，与右栏其他元素间距统一。
- 全部写在 `<style scoped>` 内，**不全局覆写** `.el-form-item`。

### 4.5 开关接入

```ts
const newLayout = ref(localStorage.getItem('ui:new-layout:UI-S5') === 'true');
```
控制：工具栏精简、AI 入口位置、检查栏显隐。**默认建议 `false`**（灰度），报告中写明。

## 5. 关键决策点

### 5.1 为什么不做「薪资结构化」
已核实本表单**没有薪资字段**（`grep salary|薪资` 无结果）。新增字段会导致提交到后端时出现未知列，违反「不影响原有功能数据」的红线。若产品确实需要，应作为**含后端的独立需求**立项。

### 5.2 为什么不做「存为草稿」
`status` 枚举只有 `open` / `paused`，草稿是新的业务状态，属后端能力变更。

### 5.3 为什么不禁用提交按钮
禁用会让用户困惑；现有 `validate()` + `scrollToField` 已能处理。检查栏做的是「提交前就知道」，不是「拦住不让点」。

### 5.4 不做的
- 不新增/删除/重命名任何字段
- 不改 `formRules`、不改 `handleSubmit`、不改任何 `@click` 的业务方法体
- 不改动 `QuillEditor` 的 `v-model` 绑定与其他 props
- 不碰 `server/**`、`e2e/**`、`mobile/**`

## 6. 修改文件清单

### 6.1 必改文件（2 个；✱=新增）
1. `client/src/views/jobs/JobForm.vue`（工具栏 + AI 搬迁 + 检查栏接入 + 局部样式）
2. ✱ `client/src/components/jobs/JobPublishChecklist.vue`

### 6.2 禁止修改文件
- `server/**`、`e2e/**`、`mobile/**`、任何 `package.json` / `tsconfig` / `vite.config.ts` / `eslint*`
- `client/src/api/**`（不改接口封装与调用）
- `client/src/router/index.ts`
- `client/src/components/jobs/JdPolishDialog.vue`、`JdDraftDialog.vue`（**只搬迁触发按钮，不改弹窗本身**）

### 6.3 越界检测（交付前自检）
- `git status --short` 只允许出现 §6.1 的路径。
- `git diff --stat -- server e2e mobile client/src/api` 必须 **0 行**。
- 对 `JobForm.vue` 的 diff 做**字段守恒检查**：改造前后 `prop="..."` 的集合必须**完全一致**（10 个，一个不多一个不少）。请在报告中直接列出两个集合做对比。

## 7. 验收标准

### 7.1 硬性验收（审核方执行，你不跑；仅供了解通过线）
- `client pnpm type-check`：仍 **88**（0 新增）。
- `client pnpm lint:check`：仍 **137 errors / 224 warnings**（0 新增）。
- `client pnpm test`：4 文件 / 22 用例全过。
- `git diff --stat -- server e2e mobile client/src/api` = 0 行。
- **字段守恒**：改造前后 `prop` 集合完全一致（10 个）。
- **功能零回归**：走一遍完整发布流程（填全部字段 → 提交）与「漏填提交」（应仍被现有 `validate()` 拦住并定位到错误字段），两者行为与改造前一致。
- **权限不变**：以 `interviewer` 身份（或无 AI 权限角色）打开表单，AI 按钮**仍不显示**（`v-if="canAi"` 已保留）。

### 7.2 交付报告模板（最终回复必须完整包含）
1. 完成范围概述。
2. 文件逐个说明（**逐处** before→after 摘要 + 行号）。
3. **工具栏对照表**（原 10 组 → 精简后保留/移除逐项列出）。
4. **AI 入口搬迁说明**（原行号 → 新行号，`@click` 方法真实名称，`v-if="canAi"` 保留证明）。
5. **字段守恒自检**（改造前后 `prop` 集合对比）。
6. **检查栏必填项来源**（从 `formRules` 推导出的必填字段清单 + 各自 message；说明未手写清单）。
7. **功能零回归自检表**（按 `UI-GUARD.md` 第四节第 3 项，逐项打勾 + 证据）。
8. 越界自检（`git status --short` 全文 + `git diff --stat -- server e2e mobile client/src/api`）。
9. 已知问题与遗留风险（如 `editorOptions` 改 `computed` 是否生效、薪资字段缺失需独立立项、草稿状态需后端支持）。
10. 回退方式：开关 `ui:new-layout:UI-S5` 置 `false` 的步骤。
11. 红线自检确认（GUARD 第一节 8 条逐条）。

按本提示词直接执行：先输出实施计划，然后动手，最终回复给出完整交付报告。
