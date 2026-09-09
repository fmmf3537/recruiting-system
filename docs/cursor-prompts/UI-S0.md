# UI-S0 设计 Token 层 + 界面状态体系 执行提示词

> **前置**：先粘贴 `UI-GUARD.md` 并等 Cursor 确认后，再粘贴本文件。

## ⚠️ 强约束（最优先阅读）

1. 本切片为**纯前端样式/组件**切片：`server/**`、`e2e/**`、`mobile/**` 一行不动；不改 `package.json` / `vite.config.ts` / `tsconfig`。
2. **不修改任何现有 SCSS 变量的值**（`$primary-color: #409eff` 等全部原样保留）——只做**追加**，避免全站样式突变。本切片**不改任何现有页面的视觉**，只提供"可被后续切片使用"的地基。
3. 文件预算 **4 个**（§6.1 逐一编号）；其中 2 个为既有文件的**追加式**修改。
4. **不跑验收命令**（审核方重跑）。
5. 编码红线：禁整文件重写；UTF-8 无 BOM、LF、2 空格缩进、中文注释。
6. **禁止新增依赖**（不装任何 UI 库 / 图标库）。
7. headless 无人工确认：先输出实施计划，然后直接动手。

## 1. 任务 ID + 目标

### 1.1 任务 ID
UI-S0

### 1.2 任务目标
为后续 UI 改造（UI-S1~S5）打地基，建立两层东西：

- **Token 层**：把散落的样式值收敛为语义化变量（色彩 / 间距 / 字号 / 圆角 / 层级），一次定义、全站引用，后续改版只改 token。
- **状态体系**：统一「空态 / 加载态 / 错误态 / 无权限态 / 缺省值」五种界面状态，替换当前全站用 `-` 表示空值的做法。

**本切片不产出可见的页面改版**（除缺省值文案外），产出的是"规范 + 可复用组件"，供 UI-S2/S3/S4 调用。

### 1.3 为什么先做这个（背景）
当前 `client/src/assets/css/variables.scss` 仅 **39 行**，只定义了基础色和少量尺寸；各页面自行发明间距与灰色，导致同一系统里出现多种灰、多种间距。同时全站空值统一显示 `-`，没有空态/加载态/错误态设计，这是"页面丑"的主要来源之一。若不做地基就改页面，每个页面都会各自发明一套，后续无法统一。

## 2. 上下文

### 2.1 项目位置
前端在 `client/`（Vue 3 `<script setup>` + TS + Element Plus 2.5 + Pinia + SCSS）。路径别名 `@/*` → `src/*`。Element Plus 组件自动引入，但 `ElMessage` / `ElMessageBox` 等 API 与图标需显式 import。

### 2.2 关键已核实事实（起草人已实读源码，可直接采信）

- `client/src/assets/css/variables.scss`（**39 行**）：现有变量 `$primary-color: #409eff`、`$success-color`、`$warning-color`、`$danger-color`、`$info-color`；文本色 `$text-primary/regular/secondary/placeholder`；边框色 `$border-base/light/lighter/extra-light`；背景 `$bg-base: #f5f7fa`、`$bg-white`；侧边栏 `$sidebar-width: 210px`、`$sidebar-bg: #304156`、`$sidebar-text: #bfcbd9`、`$sidebar-active-text: #409eff`；`$navbar-height: 50px`；间距 `$spacing-xs: 4px` ~ `$spacing-xl: 32px`。**全部保留，只追加。**
- `client/src/assets/css/main.scss`（**88 行**）：全局基础样式，追加状态类样式放这里。
- `client/src/components/Skeleton/` **目录已存在**（内含骨架屏相关组件）——**先读它**，能复用就复用，不要重复造。
- `client/src/stores/app.ts`：全局 UI store（侧边栏折叠状态等），UI 开关放这里。
- 现有空值显示：全站用 `-` 表示空（`{{ x || '-' }}` 或 Element Plus 默认空态），具体位置由你全局搜索 `'-'` / `"-"` 后**列出清单**（只改列表页与详情页的显示层，**不改任何数据**）。
- **验收基线**（审核方重跑）：`client pnpm type-check` **88**（0 新增）、`client pnpm lint:check` **137 errors / 224 warnings**（0 新增）、`client pnpm test` 4 文件 / 22 用例全过。

## 3. 必读约束

### 3.1 反直觉点（显式标注）
1. **只追加不修改**：`variables.scss` 里现有变量一个都不许改值，新 token 用新名字（如 `$ui-space-md`、`$ui-radius-card`），避免与 Element Plus 默认变量冲突。命名统一加 `ui-` 前缀便于识别是本轮新增。
2. **不要一次性替换全站样式**：本切片**不把现有页面改成用新 token**，那属于后续切片。本切片只让 token "可用"。
3. **缺省值文案替换有范围**：只替换**列表页与详情页**里用户可读字段的空值展示（`-` → `未填写`，用 `$ui-text-placeholder` 色、12px）。**不替换**：表单 placeholder、下拉选项、图表数据点、状态字段。枚举不清的位置**保持原样并在报告里列出**。
4. **骨架屏优先复用** `components/Skeleton/`，若其结构不满足（缺表格骨架/卡片骨架），在原目录**追加**新组件，不改既有文件。
5. **不改 Element Plus 全局组件默认样式**（如 `.el-table`、`.el-button` 全局覆写）——那会影响所有未改造页面，风险不可控。需要定制时用**新增 class 局部作用域**（`<style scoped>`）。

### 3.2 状态体系设计（照此实现）

| 状态 | 触发场景 | 呈现 |
|---|---|---|
| 空态（empty） | 列表 0 条数据 | 图标占位 + 主文案「暂无候选人」+ 副文案（说明原因）+ 主操作按钮（如「上传简历」） |
| 加载态（loading） | 数据请求中 | 骨架屏（表格骨架 / 卡片骨架），**不用全屏 loading 遮罩**（现有 `v-loading` 可保留，但列表首屏改用骨架） |
| 错误态（error） | 请求失败 | 错误图标 + 「加载失败」+ 「重试」按钮（重试 = 重新调用原 fetch，不改数据流） |
| 无权限态（forbidden） | 后端返回 403 或角色不可见 | 锁图标 + 「你没有查看权限」+ 「申请权限」（无申请流程则只留文案） |
| 缺省值（placeholder） | 单字段无值 | 灰色「未填写」（替代 `-`） |

## 4. 实施任务

### 4.1 ✱ `client/src/assets/css/variables.scss`（**追加**，不改现有内容）

在文件末尾追加（中文注释说明用途）：

```scss
// ============ 本轮新增：UI Token 层（UI-S0）============
// 说明：仅新增，不修改上方任何既有变量，避免全站样式突变。

// 语义色（后续切片统一引用这些，不再直接写 #RRGGBB）
$ui-color-primary: $primary-color;
$ui-color-primary-hover: #66b1ff;
$ui-color-success: $success-color;
$ui-color-warning: $warning-color;
$ui-color-danger: $danger-color;

// 阶段色阶（招聘阶段 tag 专用，浅底深字）
$ui-stage-bg-new: #f1efe8;      // 入库/初筛
$ui-stage-bg-interview: #b5d4f4; // 面试中
$ui-stage-bg-offer: #e1f5ee;     // 拟录用/Offer
$ui-stage-bg-hired: #c0dd97;     // 已入职
$ui-stage-fg-default: #5f5e5a;
$ui-stage-fg-strong: #0c447c;

// 中性灰阶（统一"多种灰"问题）
$ui-gray-50: #fafafa;
$ui-gray-100: #f5f7fa;
$ui-gray-200: #ebeef5;
$ui-gray-300: #dcdfe6;
$ui-gray-500: #909399;
$ui-gray-700: #606266;
$ui-gray-900: #303133;

// 间距（4 的倍数）
$ui-space-xs: 4px;
$ui-space-sm: 8px;
$ui-space-md: 12px;
$ui-space-lg: 16px;
$ui-space-xl: 24px;

// 字号（只允许这 5 档）
$ui-font-xs: 11px;
$ui-font-sm: 12px;
$ui-font-base: 13px;
$ui-font-md: 14px;
$ui-font-lg: 15px;
$ui-font-metric: 24px; // KPI 数字

// 圆角
$ui-radius-sm: 6px;
$ui-radius-md: 8px;
$ui-radius-lg: 12px;
$ui-radius-pill: 999px;

// 边框（统一 0.5px，替代现在的 1px 参差）
$ui-border-width: 0.5px;
$ui-border-color: $ui-gray-300;
$ui-border-color-light: $ui-gray-200;

// 层级
$ui-z-sticky: 10;
$ui-z-dropdown: 100;
$ui-z-dialog: 1000;
```

### 4.2 ✱ `client/src/assets/css/main.scss`（**追加**状态类）

追加（不要动上方既有内容）：

```scss
// ============ UI-S0：界面状态体系 ============
.ui-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: $ui-space-xl $ui-space-lg;
  text-align: center;
  color: $ui-gray-500;
  font-size: $ui-font-base;
}
.ui-state__title { font-size: $ui-font-md; color: $ui-gray-700; margin: $ui-space-sm 0 $ui-space-xs; }
.ui-state__desc { font-size: $ui-font-sm; color: $ui-gray-500; margin: 0 0 $ui-space-md; }
.ui-empty { border: $ui-border-width dashed $ui-gray-300; border-radius: $ui-radius-md; }
.ui-placeholder { color: $ui-gray-500; font-size: $ui-font-sm; } // 替代 "-"
```

### 4.3 ✱ `client/src/components/common/EmptyState.vue`（新增，通用状态组件）

props：
```ts
type Props = {
  type: 'empty' | 'error' | 'forbidden';   // 决定图标与默认文案
  title?: string;      // 不传用 type 的默认文案
  description?: string;
  actionText?: string; // 有值才显示主按钮
};
emits: ['action']     // 点主按钮触发（重试/上传简历等由父组件决定）
```
实现要点：
- 图标用**内联 SVG**（不引图标库、不用 emoji）。
- 默认文案：empty → 「暂无数据」；error → 「加载失败」；forbidden → 「你没有查看权限」。
- 纯展示组件，**不发起任何请求**。
- `<style scoped>`，用 §4.1 的 token。

### 4.4 `client/src/components/Skeleton/`（**尽量不改**；缺什么追加什么）

先读现有 Skeleton 组件。若缺少「表格骨架」，`新增 TableSkeleton.vue`（表头 + 5 行占位条）；若缺少「卡片骨架」，`新增 CardSkeleton.vue`。**既有文件一律不重写**。骨架用纯 CSS 块 + 轻微透明度，**不加动画库**（可用 CSS `@keyframes` 呼吸效果，禁止引入依赖）。

### 4.5 缺省值文案替换（**范围受限的既有文件小改**）

全局搜索 `|| '-'`、`|| "-"`、`'-'` 作为**显示值**的位置，仅在**列表页与详情页**把字段空值展示改为：
```vue
<span v-if="!value" class="ui-placeholder">未填写</span>
<span v-else>{{ value }}</span>
```
- **每个改动点加中文注释** `// UI-S0：空值展示语义化（数据未改动）`。
- 若某处无法判断是否为"用户可读字段显示"，**跳过并在交付报告列出**。
- 改动文件数**不超过 5 个**，超出则停止并报告（说明剩余位置清单）。

## 5. 关键决策点

### 5.1 为什么只追加不修改现有变量
改 `$primary-color` 会让所有未改造页面同时变色，风险不可控且无法灰度。**新 token 与旧变量并存**，后续切片改造哪个页面就引用哪套。

### 5.2 为什么不用全屏 loading
现有 `v-loading` 在数据量大时整页白屏感强；骨架屏能保持布局稳定。但**本切片不替换任何现有 v-loading**，只提供骨架组件供后续切片选用。

### 5.3 不做的
- 不做任何页面的布局改版（那是 UI-S1~S5）
- 不改 Element Plus 主题（不引入暗色模式、不改 `--el-color-primary`）
- 不新增路由、不改菜单
- 不碰 `server/**`、`e2e/**`、`mobile/**`

## 6. 修改文件清单

### 6.1 必改文件（3-4 个；✱=新增）
1. `client/src/assets/css/variables.scss`（**追加** token 段）
2. `client/src/assets/css/main.scss`（**追加**状态类）
3. ✱ `client/src/components/common/EmptyState.vue`
4. `client/src/components/Skeleton/`（**优先不改**，缺则追加 1 个新文件）
5. 缺省值替换涉及的列表/详情页（≤5 个，**逐处注释**）

### 6.2 禁止修改文件
- `server/**`、`e2e/**`、`mobile/**`、任何 `package.json` / `tsconfig` / `vite.config.ts` / `eslint*`
- `client/src/router/index.ts`（本切片不涉及路由）
- `client/src/layouts/DefaultLayout.vue`、`client/src/components/layout/*`（那是 UI-S1 的范围）
- 任何 `.vue` 的既有 SCSS 变量块

### 6.3 越界检测（交付前自检）
- `git status --short` 只允许出现 §6.1 的路径。
- `git diff --stat -- server e2e mobile` 必须 **0 行**。
- `git diff -- client/src/assets/css/variables.scss` 里**不允许出现删除行**（只允许 `+` 追加）。

## 7. 验收标准

### 7.1 硬性验收（审核方执行，你不跑；仅供了解通过线）
- `client pnpm type-check`：仍 **88**（0 新增）。
- `client pnpm lint:check`：仍 **137 errors / 224 warnings**（0 新增）。
- `client pnpm test`：4 文件 / 22 用例全过。
- `git diff --stat -- server e2e mobile` = 0 行；variables.scss 无删除行。
- 视觉回归：打开任一列表页，**除空值文案由 `-` 变「未填写」外，不应有任何可见变化**（这是本切片"零视觉冲击"的验收要点）。

### 7.2 交付报告模板（最终回复必须完整包含）
1. 完成范围概述（实际改了哪些文件）。
2. 文件逐个说明（新增写职责；既有文件**逐处**列 before→after 摘要 + 中文注释位置）。
3. Token 清单表（新增了哪些 token、各自用途）。
4. 缺省值替换清单（改了哪些文件的哪些位置；跳过的位置及原因）。
5. **功能零回归自检表**（按 `UI-GUARD.md` 第四节第 3 项，逐项打勾 + 证据）。
6. 越界自检（`git status --short` 全文 + `git diff --stat -- server e2e mobile` 输出）。
7. 已知问题与遗留风险（如某些空值位置未改、Skeleton 复用情况）。
8. 红线自检确认（GUARD 第一节 8 条逐条）。

按本提示词直接执行：先输出实施计划，然后动手，最终回复给出完整交付报告。
