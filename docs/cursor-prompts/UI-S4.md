# UI-S4 仪表盘栅格修复 + 漏斗图渲染修复 执行提示词

> **前置**：先粘贴 `UI-GUARD.md` 并等 Cursor 确认后，再粘贴本文件。
> **依赖**：建议在 UI-S0 之后执行（复用 `EmptyState.vue`）；若 S0 未做，按 §3.3 降级处理。

## ⚠️ 强约束（最优先阅读）

1. **纯前端**：`server/**`、`e2e/**`、`mobile/**` 一行不动；**不新增/不修改任何后端接口调用**。
2. **不改数据语义**：KPI 数字、漏斗各阶段数值、接口返回字段的映射关系**一律不变**。本切片只改「栅格宽度」「图表视觉配置」「空数据时的呈现」。
3. **禁止整文件重写**：`client/src/views/dashboard/index.vue`（**636 行**）、`client/src/views/stats/index.vue` 全部用**局部替换**方式修改。
4. **不新增依赖**：不得安装任何图表库；ECharts 已在 `package.json` 中（使用 `echarts/core` 按需引入）。若需要 `BarChart` / `GridComponent`，用 `echarts/charts`、`echarts/components` 的**现有包内 import**（不装新包）。
5. 变更用**开关** `ui:new-layout:UI-S4` 控制；关闭时回到改造前渲染。
6. **不跑验收命令**（审核方重跑）。
7. 编码红线：UTF-8 无 BOM、LF、2 空格缩进、单引号、中文注释。
8. headless 无人工确认：先输出实施计划，然后直接动手。

## 1. 任务 ID + 目标

### 1.1 任务 ID
UI-S4

### 1.2 任务目标
修复两处**当前已在生产出现、肉眼可见**的问题：

1. **仪表盘 KPI 区栅格错位**：4 张统计卡各占 `lg=8`，第 4 张换行后右侧空出 16 栅格（约 2/3 行宽），视觉上像"缺了一块"。
2. **招聘漏斗图标签重叠、不可读**：ECharts 漏斗 `min/max` 被硬编码为固定值、`minSize: '0%'`，导致人数少的阶段被压成细条、`position: 'inside'` 的标签互相重叠。仪表盘与数据统计页**同样的问题**。

**本切片不做「今日待办」等需要新聚合接口的功能**（见 §5.2）。

### 1.3 为什么（现状证据，已实读源码）

- `client/src/views/dashboard/index.vue`（**636 行**）：
  - 第 6 行 `<el-row :gutter="20" class="stats-row">`，内含 **4 个** `<el-col :xs="24" :sm="12" :lg="8">`（分别在第 7、27、42、57 行），卡片标题依次为「本月新增候选人」「进行中职位数」「待入职人数」「…」（第 4 个跳 `/hc-requests`）。`4 × 8 = 32 > 24` → 第 4 张必然换行且右侧留白。
  - 漏斗图：`initFunnelChart()` 在**第 306–354 行**，`echarts.init(funnelChartRef.value)`（第 309 行），`option`（第 311 行起）关键配置：
    ```ts
    min: 0,
    max: 100,          // ⚠️ 硬编码，与真实人数无关
    minSize: '0%',     // ⚠️ 最小值阶段宽度可为 0
    maxSize: '100%',
    sort: 'descending',
    label: { show: true, position: 'inside', formatter: '{b}\n{c}人', fontSize: 12 },
    ```
    当某阶段人数远小于最大值（或总数超过 100）时，该层被压扁 → `inside` 标签溢出/重叠。
  - 时间范围切换 `funnelTimeRange`（第 215 行）→ `watch` 重新拉数（第 404 行）→ `funnelChart?.setOption({ series: [{ data }] })`（第 368 行）。**切换时没有重建 option**，所以 §4.2 的修复必须**同时作用于 `initFunnelChart` 与被 watch 触发的 `setOption`**，否则切换时间范围后修复失效。
  - 图表容器高度在样式 `.funnel-chart`（**第 558 行**）。
- `client/src/views/stats/index.vue`：第 **244–264 行** 同样是 `type: 'funnel'`，`min: 0`、`max: 1000`、`minSize: '0%'`、`label.position: 'inside'`，**同一类问题，必须一并修**。
- 已注册组件（dashboard 第 179–184 行）：`CanvasRenderer`、`FunnelChart`、`TooltipComponent`。**未注册** `LegendComponent` / `GridComponent` / `BarChart`。

## 2. 上下文

### 2.1 项目位置
前端在 `client/`，ECharts 采用 `echarts/core` + `use([...])` 按需引入（不要改成全量 `import * as echarts from 'echarts'`，会显著增大包体）。

### 2.2 关键已核实事实（可直接采信）
- 漏斗数据来自 `getFunnelStats({ startDate, endDate })`，映射在 **第 363–368 行**：`res.data.map((item, index) => ({ value, name, itemStyle: { color } }))` —— **这个映射不许改**。
- `funnelData` 初始定义在**第 222 行**。
- 时间范围工具 `getDateRangeByType`（在第 300 行附近）。
- 生命周期：`onMounted` 初始化、`onActivated`（第 ~420 行）、`window.resize` → `funnelChart?.resize()`（第 410/428 行）、`onUnmounted` → `dispose()`（第 434 行）。**这些生命周期逻辑不许改**。
- **验收基线**（审核方重跑）：`client pnpm type-check` **88**、lint **137 errors / 224 warnings**、`client pnpm test` 4 文件 / 22 用例全过。

## 3. 必读约束

### 3.1 反直觉点（显式标注）

1. **不要把漏斗换成横向条形图来"绕开"问题**（我在早期方案里提过，现撤回）：换图需额外注册 `BarChart` + `GridComponent`，且改变用户已习惯的视觉隐喻。**本方案保留 funnel 类型，只修配置**。
2. **`min`/`max` 正确做法是"删掉"而不是"改个数"**：ECharts 漏斗不写 `min`/`max` 时默认按数据自适应。**不要**改成一个新的魔法数字。
3. **修复必须两处同步**：`initFunnelChart()` 的初始 option 与 watch 里的 `setOption`。建议把 option 抽取成一个函数 `buildFunnelOption()` 供两处复用（**抽取函数是新增，不删除原调用点逻辑**）。
4. **空数据不等于 0**：若所有阶段都是 0，漏斗会渲染成一堆空条。需要 `v-if` 切到空态组件（**复用 UI-S0 的 `EmptyState.vue`**，未做 S0 则用 `<el-empty>`——见 §3.3）。**不新增接口**。
5. **KPI 卡片的 `@click="goTo(...)"` 与数据来源一律不动**，只改 `el-col` 的 `:lg` 值。

### 3.2 KPI 栅格修复（照此实现）

| 断点 | 现状 | 改为 | 效果 |
|---|---|---|---|
| `xs` | 24 | 24（不变） | 手机一行一张 |
| `sm` | 12 | 12（不变） | 平板一行两张 |
| `lg` | **8** | **6** | 桌面一行四张（4×6=24） |

**只允许改 `:lg` 的值**，其余属性（`shadow="hover"`、`class="stat-card"`、`@click`、`v-loading`）保持原样。若第 4 张卡之后还有第 5 个元素，一并纳入计算并在报告中说明。

### 3.3 空态降级方案（S0 未执行时）
若 `client/src/components/common/EmptyState.vue` 不存在，**不要新建它**（避免与 S0 冲突），直接用 Element Plus 内置：
```vue
<el-empty v-if="isFunnelEmpty" description="暂无招聘数据" />
```
并在交付报告「遗留项」里注明：S0 完成后可替换为 `<EmptyState type="empty" ... />`。

## 4. 实施任务

### 4.1 KPI 栅格（dashboard 第 7 / 27 / 42 / 57 行）

把 4 处 `<el-col :xs="24" :sm="12" :lg="8">` 的 `lg` 改为 `6`。每处加注释：
```vue
<!-- UI-S4：lg 8→6，四张卡一行（原 4×8=32>24 导致第四张换行留白） -->
```

### 4.2 漏斗图配置修复（dashboard 第 306–354 行 + 第 368 行）

**步骤 1**：把 option 抽成函数（**新增**，放在 `initFunnelChart` 之前）：

```ts
// UI-S4：漏斗配置统一入口，供初始化与时间范围切换共用，避免两处配置漂移
function buildFunnelOption(): EChartsOption {
  return {
    tooltip: { trigger: 'item', formatter: '{b}: {c}人 ({d}%)' },
    series: [
      {
        name: '招聘漏斗',
        type: 'funnel',
        left: '10%',
        top: 20,
        bottom: 20,
        width: '80%',
        // UI-S4：删除硬编码 min/max，改为按数据自适应（原 min:0/max:100 会压扁小值阶段）
        // UI-S4：minSize 0%→20%，保证每一层都有可容纳标签的最小高度
        minSize: '20%',
        maxSize: '100%',
        sort: 'descending',
        gap: 2,
        label: {
          show: true,
          position: 'inside',
          formatter: '{b}\n{c}人',
          fontSize: 12,
          // UI-S4：小值阶段用外引线，避免标签挤在细条里重叠
          // 说明：ECharts 按 formatter 无法条件切换 position，故统一改为下方方案
        },
        labelLine: { show: false },
        itemStyle: { borderColor: '#fff', borderWidth: 1 },
        emphasis: { label: { fontSize: 14 } },
        data: funnelData.value,
      },
    ],
  };
}
```

**步骤 2（关键，解决标签重叠）**：把 `label.position` 从 `'inside'` 改为 `'right'`，并把 `labelLine.show` 改为 `true`：
```ts
label: {
  show: true,
  position: 'right',      // UI-S4：由 inside 改为右侧外显，彻底解决细条内文字重叠
  formatter: '{b} {c}人',
  fontSize: 12,
},
labelLine: { show: true, length: 12, lineStyle: { width: 1 } },
```
并把容器左右空间让出来（同 option 内）：`left: '5%'`、`width: '55%'`（给右侧标签留位置）。
> 若 `position: 'right'` 在你实测下仍不理想，**退回 `inside` 但保留 `minSize: '20%'` 且删除 `min/max`**，并在报告中说明取舍——**删除硬编码 min/max 与 minSize 20% 是本修复的核心，不可省略**。

**步骤 3**：`initFunnelChart()` 改为 `funnelChart.setOption(buildFunnelOption());`；第 368 行的时间范围切换改为：
```ts
funnelChart?.setOption(buildFunnelOption());
```
（原来是 `setOption({ series: [{ data: funnelData.value }] })`；改后仍只依赖已更新的 `funnelData`，**数据语义不变**。）

### 4.3 漏斗空态（dashboard 模板）

在漏斗卡片内、`<div ref="funnelChartRef">` **之外**加一层条件渲染：
```vue
<div v-if="isFunnelEmpty" class="funnel-empty">
  <EmptyState type="empty" title="暂无招聘数据" description="当前时间范围内没有候选人流转记录" />
</div>
<div v-show="!isFunnelEmpty" ref="funnelChartRef" class="funnel-chart"></div>
```
```ts
// UI-S4：所有阶段均为 0 时视为空（不新增接口，纯前端判断）
const isFunnelEmpty = computed(() => funnelData.value.every((d) => !d.value));
```
> ⚠️ 用 `v-show` 而非 `v-if` 包裹图表容器，避免 `echarts.init` 在容器不存在时被调用（原来的 `initFunnelChart` 已有 `if (!funnelChartRef.value) return;` 保护，保持该保护不变）。

### 4.4 数据统计页同步修复（stats/index.vue 第 244–264 行）

按 §4.2 的**同一套**配置修改（删除 `min: 0` / `max: 1000`、`minSize` → `'20%'`、`label.position` → `'right'` + `labelLine.show: true`）。
- 该页漏斗若也支持时间范围切换，**同样要保证 option 复用**。
- 若该页同时有 Bar/Line/Pie 图，**只改 funnel 那一个 series**，其他图表一个字都不动。

### 4.5 开关接入

```ts
// UI-S4：新布局开关（关闭时回到改造前栅格与图表配置）
const newLayout = ref(localStorage.getItem('ui:new-layout:UI-S4') === 'true');
```
- KPI `:lg` 用 `:lg="newLayout ? 6 : 8"`。
- 漏斗：`buildFunnelOption()` 内根据 `newLayout` 返回新旧配置两套（**保留原配置副本**，便于回退对比）。
- **默认建议 `false`**（灰度），报告中写明。

## 5. 关键决策点

### 5.1 为什么保留 funnel 而不换横向条形
用户已熟悉漏斗隐喻；换图需新增 ECharts 组件注册（扩大 diff 与包体），收益不确定。修配置即可解决可读性。

### 5.2 为什么不做「今日待办」
「今日待办」需要聚合「今日面试 / 待处理 Offer / 新简历」三类数据。现有 `stats` 路由虽有若干 GET 接口，但是否能拼出该聚合**未经验证**。按红线「不新增后端调用、不臆造接口」，本切片**只保留并微调现有「最近动态」区块**，不做待办。「今日待办」列为**需后端确认的独立项**，在报告遗留项中写明。

### 5.3 不做的
- 不改 KPI 数字口径、不改接口调用、不改 `funnelData` 的映射逻辑
- 不改时间范围切换的数据流与生命周期钩子
- 不新增图表（不新增折线/饼图）
- 不碰 `server/**`、`e2e/**`、`mobile/**`

## 6. 修改文件清单

### 6.1 必改文件（2 个）
1. `client/src/views/dashboard/index.vue`（4 处 `:lg` + 漏斗 option + 空态 + 开关）
2. `client/src/views/stats/index.vue`（funnel series 配置同步修复）

### 6.2 可能涉及（≤1 个）
3. 若 `components/common/EmptyState.vue` 已存在（UI-S0 产出），则**只引用不修改**。

### 6.3 禁止修改文件
- `server/**`、`e2e/**`、`mobile/**`、任何 `package.json` / `tsconfig` / `vite.config.ts` / `eslint*`
- `client/src/api/**`（不改任何接口封装）
- `client/src/router/index.ts`
- 任何 ECharts 的 import 段（除 §4.4 确需外，**不得新增 `use([...])` 注册项**）

### 6.4 越界检测（交付前自检）
- `git status --short` 只允许出现 §6.1/§6.2 的路径。
- `git diff --stat -- server e2e mobile client/src/api` 必须 **0 行**。
- `git diff -- client/src/views/dashboard/index.vue | grep -E '^-'` 中**不得出现** `getFunnelStats`、`funnelData.value = res.data.map`、`onMounted`、`onUnmounted`、`dispose` 等数据/生命周期相关删除行。

## 7. 验收标准

### 7.1 硬性验收（审核方执行，你不跑；仅供了解通过线）
- `client pnpm type-check`：仍 **88**（0 新增）。
- `client pnpm lint:check`：仍 **137 errors / 224 warnings**（0 新增）。
- `client pnpm test`：4 文件 / 22 用例全过。
- `git diff --stat -- server e2e mobile client/src/api` = 0 行。
- **功能零回归**：KPI 4 个数字与改造前完全一致；切换时间范围后漏斗数值与改造前完全一致（需列出切换前后的数值对照）。
- **视觉**：开关开启后，KPI 四张卡在 ≥1200px 宽下**一行显示**；漏斗各层标签**互不重叠、全部可读**；全 0 数据显示空态而非一堆空条。

### 7.2 交付报告模板（最终回复必须完整包含）
1. 完成范围概述。
2. 文件逐个说明（**逐处** before→after 摘要 + 行号，含 4 处 `lg` 的行号）。
3. **漏斗配置对照表**（改造前 vs 改造后，逐配置项列出，重点标出 `min`/`max`/`minSize`/`label.position`/`labelLine`）。
4. **数据一致性证明**：切换 3 个时间范围（本月/本季/本年度或实际存在的选项），列出改造前后各阶段数值对照。
5. **功能零回归自检表**（按 `UI-GUARD.md` 第四节第 3 项，逐项打勾 + 证据）。
6. 越界自检（`git status --short` 全文 + `git diff --stat -- server e2e mobile client/src/api`）。
7. 已知问题与遗留风险（含：空态是否用了 S0 组件、`position: 'right'` 实测效果若不佳的回退方案、"今日待办"需后端确认）。
8. 回退方式：开关 `ui:new-layout:UI-S4` 置 `false` 的步骤。
9. 红线自检确认（GUARD 第一节 8 条逐条）。

按本提示词直接执行：先输出实施计划，然后动手，最终回复给出完整交付报告。
