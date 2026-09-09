# UI-S1 导航信息架构 + 顶栏补全 执行提示词

> **前置**：先粘贴 `UI-GUARD.md` 并等 Cursor 确认后，再粘贴本文件。
> **依赖**：建议在 UI-S0 之后执行（复用 token 与 EmptyState；若 S0 未做，本切片不依赖也能独立完成，见 §3.4）。

## ⚠️ 强约束（最优先阅读）

1. **纯前端**：`server/**`、`e2e/**`、`mobile/**` 一行不动。
2. **不删功能入口**：任何现有菜单项、路由 `path`、路由 `name` **一个都不许删、不许改名**。本切片只做「分组呈现 + 顶栏补全」，是**加法**。
3. **不改路由数据本身的能力边界**：允许在 `client/src/router/index.ts` 的 `meta` 上**新增** `group` 字段（纯新增 key）；**禁止**修改现有 `path` / `name` / `component` / `meta.title` / `meta.icon` / `meta.role` / `meta.hidden` / `meta.requireAdmin` 的任何取值。
4. **禁止整文件重写**：`Sidebar.vue`（71 行）、`Navbar.vue`（73 行）、`router/index.ts`（452 行）全部用**局部插入/追加**方式修改。
5. 新导航用**开关** `ui:new-layout:UI-S1`（`localStorage` 或 `stores/app.ts`），关闭时**完全回到扁平菜单原渲染**。
6. **不跑验收命令**（审核方重跑）。
7. 编码红线：UTF-8 无 BOM、LF、2 空格缩进、单引号、中文注释；**零新增依赖**（图标只能用项目已引入的 `@element-plus/icons-vue`）。
8. headless 无人工确认：先输出实施计划，然后直接动手。

## 1. 任务 ID + 目标

### 1.1 任务 ID
UI-S1

### 1.2 任务目标
把当前**约 17 项平铺、无分组、图标重复**的侧边栏，改为**分组导航**；同时补全顶栏（当前面包屑是空实现、无通知入口）。目标是让 HR 一眼能找到功能，而不是在 17 条同权重列表里逐条扫。

**本切片不改变任何页面的可达性**——分组后每个入口仍在，且开关关闭时完全回到现状。

### 1.3 为什么（现状证据，已实读源码）

- `client/src/components/layout/Sidebar.vue`（71 行）：`menuItems` 是**扁平数组**，直接 `v-for` 渲染 `<el-menu-item>`，**没有任何 `el-sub-menu` 分组**，17 项同权重平铺。
- 图标大量重复：`Briefcase` 用于「招聘工作台」和「职位管理」，`User` 用于「面试官工作台」和「成员管理」，`Setting` 被 5 个设置项共用，`TrendCharts` 用于「数据统计」和「考核报表」。
- `client/src/components/layout/Navbar.vue`（73 行）第 10 行：`const Breadcrumb = () => null;` —— **面包屑是空实现占位**，顶栏左侧实际是空白；右侧只有用户头像下拉（个人中心 / 退出登录），**没有通知入口**（`/notifications` 被埋在侧边栏第 11 项）。

## 2. 上下文

### 2.1 项目位置
前端在 `client/`（Vue 3 `<script setup>` + TS + Element Plus 2.5 + Pinia + SCSS）。路径别名 `@/*` → `src/*`。Element Plus 组件自动引入，但 `ElMessage` / `ElMessageBox` 等 API 与图标需显式 import。

### 2.2 关键已核实事实（可直接采信）

- `client/src/router/index.ts`（**452 行**）：`Layout` 路由（第 39–41 行 `path: '/'`、`name: 'Layout'`、`redirect: '/dashboard'`）的 `children` 里，每个子项 `meta` 形如 `{ title: '仪表盘', icon: Odometer }`，部分带 `role: ['admin','hr']`、`requireAdmin: true`、`hidden: true`。
- 全文件有 **19 处 `hidden: true`**（详情页 / 编辑页 / 大部分设置页 / 个人中心），这些**不进菜单**，本切片保持不动。
- `Sidebar.vue` 的过滤逻辑（第 13–21 行）：只过滤 `meta.hidden` 和 `meta.requireAdmin`。
- 侧边栏配色硬编码在模板里：`background-color="#304156"`、`text-color="#bfcbd9"`、`active-text-color="#409EFF"`；`layout/index.vue` 里 `.sidebar { background-color: #304156 }`、`el-aside width="210px"`。
- **验收基线**（审核方重跑）：`client pnpm type-check` **88**（0 新增）、`client pnpm lint:check` **137 errors / 224 warnings**（0 新增）、`client pnpm test` 4 文件 / 22 用例全过。

## 3. 必读约束

### 3.1 反直觉点（显式标注）

1. **分组只改呈现，不改数据可达性**：用 `el-sub-menu` 包裹后，每个 `el-menu-item` 的 `index` 必须**保持原值不变**（见 §3.2 第 1 条的 `//` 说明），点击后跳转行为必须与现状完全一致。
2. ⚠️ **不要顺手"修 bug"**：`Sidebar.vue` 第 37 行是 `:index="\`/${item.path}\`"`，而 `item.path` 已经自带前导斜杠（如 `/dashboard`），拼出来是 `//dashboard`。**这是现状行为且线上可用，本切片不要改它**——改了可能让当前可点的菜单失效。只在交付报告里列为「观察项」。
3. ⚠️ **`meta.role` 目前不生效**：路由里配了 `role: ['admin','hr']` 等，但 `Sidebar.vue` 的 computed **只过滤 `hidden` 和 `requireAdmin`，没有处理 `role`**，导致角色菜单没按预期收敛。**本切片不要自行加 role 过滤**——那会改变「谁能看到什么菜单」，属功能行为变更，需产品确认后单独立项。**只在交付报告中明确指出这个事实**。
4. **不引入折叠/抽屉等新交互**：侧边栏宽度、折叠行为、`el-aside width="210px"` 全部保持现状。
5. **若 UI-S0 未执行**：本切片不依赖 token，直接用现有变量或字面量即可，但**不要新建 token 文件**（避免与 S0 冲突）。

### 3.2 分组方案（照此实现）

在路由 `meta` **新增** `group` 字段，值取下列 4 个之一（分组标题文案固定）：

| group | 分组标题 | 建议归入的现有菜单项（以实际渲染为准） |
|---|---|---|
| `recruit` | 招聘业务 | 仪表盘、招聘工作台、职位管理、候选人管理、面试管理、我的面试、Offer管理、编制管理 |
| `talent` | 人才与数据 | 面试官工作台、数据统计、猎头机构 |
| `manage` | 组织管理 | 成员管理、我的积分、团队考核 |
| `system` | 系统设置 | AI 设置、消息通知（若保留在侧栏） |

实现要求：
- **每个现有菜单项都必须归入某一组**。若某项你判断不出归属，**归入 `system`** 并在报告里列出。
- 组顺序固定为 `recruit → talent → manage → system`。
- 组内顺序：**保持现有 `children` 数组的原始顺序**（不要重排，避免改变用户肌肉记忆）。
- 组图标从**已引入的图标**里选（不新增 import 也行，直接用已有变量）。
- 只有一个成员的组**仍然渲染为 `el-sub-menu`**（保持结构一致，避免后续加项时结构跳变）。

### 3.3 顶栏补全（范围严格受限）

1. **面包屑**：把 `Navbar.vue` 第 10 行的空实现 `const Breadcrumb = () => null;` **替换为真实面包屑组件**（新增文件 `client/src/components/layout/AppBreadcrumb.vue`）。
   - 数据源：`useRoute().matched` 过滤掉无 `meta.title` 的项（如 `Layout`），渲染 `el-breadcrumb` / `el-breadcrumb-item`。
   - 首页项显示为「首页」，点击跳 `/dashboard`。
   - 最后一项为当前页，不可点。
   - **纯展示**，不改路由、不发请求。
2. **通知入口**：在顶栏右侧、用户下拉**左侧**加一个铃铛图标按钮，点击 `router.push('/notifications')`。
   - **不显示未读红点**（不需要也不允许新增后端接口）。
   - **不删除侧边栏里的「消息通知」菜单项**（红线：不删功能入口）。
3. **不做**：不做全屏搜索、不做多语言、不做换肤、不做顶栏固定/隐藏。

## 4. 实施任务

### 4.1 ✱ `client/src/components/layout/AppBreadcrumb.vue`（新增）

```vue
<script setup lang="ts">
import { computed } from 'vue';
import { useRoute, useRouter } from 'vue-router';

const route = useRoute();
const router = useRouter();

// 只取有 title 层级（自动跳过 Layout 这类无标题父级）
const items = computed(() =>
  route.matched.filter((r) => r.meta?.title).map((r) => ({
    title: r.meta!.title as string,
    path: r.path,
  })),
);
</script>

<template>
  <el-breadcrumb separator="/" class="app-breadcrumb">
    <el-breadcrumb-item :to="{ path: '/dashboard' }">首页</el-breadcrumb-item>
    <el-breadcrumb-item v-for="(it, i) in items" :key="it.path">
      <span :class="{ 'is-last': i === items.length - 1 }">{{ it.title }}</span>
    </el-breadcrumb-item>
  </el-breadcrumb>
</template>
```
要点：`<style scoped>`；最后一项不加 `to`（不可点）；**不调用 `router` 的话删掉未使用的 import**（避免 lint 新增告警）。

### 4.2 `client/src/components/layout/Navbar.vue`（**局部修改**，73 行）

1. 删除第 10 行 `const Breadcrumb = () => null;` 及其注释。
2. `import AppBreadcrumb from './AppBreadcrumb.vue';`
3. 模板中 `<breadcrumb />` 改为 `<AppBreadcrumb />`。
4. 在 `.right-menu` 内、`<el-dropdown>` **之前**插入铃铛按钮：
```vue
<el-tooltip content="消息通知" placement="bottom">
  <el-button link class="notification-btn" @click="router.push('/notifications')">
    <el-icon :size="18"><i-ep-bell /></el-icon>
  </el-button>
</el-tooltip>
```
（`router` 已在文件中定义；`i-ep-bell` 为 Element Plus 全局注册图标，若无则改为 `import { Bell } from '@element-plus/icons-vue'` 并用 `<component :is="Bell" />`——**优先试 `i-ep-bell`，报错再改**。）

### 4.3 `client/src/router/index.ts`（**仅追加 meta.group**）

- 只给**会出现在菜单里**的项（即无 `hidden: true` 的项）追加 `group: 'xxx'`。
- `hidden: true` 的项**一律不加**（加了也没用，且增加 diff 噪音）。
- 每处加中文注释 `// UI-S1：菜单分组（仅新增 meta，不改 path/name/组件）`。
- **禁止**改动任何其他行。

### 4.4 `client/src/components/layout/Sidebar.vue`（**核心改动**，71 行）

在 `<script setup>` 内新增分组 computed（**追加**，保留原 `menuItems` 不动，供开关关闭时使用）：

```ts
// UI-S1：按 meta.group 分组（仅改变呈现，不改变任何一项的 path 与可达性）
const menuGroups = computed(() => {
  const order = ['recruit', 'talent', 'manage', 'system'];
  const titles: Record<string, string> = {
    recruit: '招聘业务',
    talent: '人才与数据',
    manage: '组织管理',
    system: '系统设置',
  };
  const map = new Map<string, typeof menuItems.value>();
  for (const item of menuItems.value) {
    // 没标 group 的一律归入 system，保证不丢项
    const g = (item.meta as any)?.group || 'system';
    if (!map.has(g)) map.set(g, []);
    map.get(g)!.push(item);
  }
  return order
    .filter((g) => map.has(g))
    .map((g) => ({ key: g, title: titles[g], items: map.get(g)! }));
});
```

模板改造（**开关控制**）：
```vue
<el-menu :default-active="activeMenu" router ...>
  <!-- 关闭开关：完全回到改造前的扁平渲染 -->
  <template v-if="!newNav">
    <el-menu-item v-for="item in menuItems" :key="item.path" :index="`/${item.path}`">
      <el-icon><component :is="item.meta?.icon" /></el-icon>
      <template #title>{{ item.meta?.title }}</template>
    </el-menu-item>
  </template>
  <!-- 开启开关：分组渲染，index 与原逻辑保持一致 -->
  <template v-else>
    <el-sub-menu v-for="g in menuGroups" :key="g.key" :index="`group-${g.key}`">
      <template #title><span>{{ g.title }}</span></template>
      <el-menu-item v-for="item in g.items" :key="item.path" :index="`/${item.path}`">
        <el-icon><component :is="item.meta?.icon" /></el-icon>
        <template #title>{{ item.meta?.title }}</template>
      </el-menu-item>
    </el-sub-menu>
  </template>
</el-menu>
```

开关定义：`const newNav = ref(localStorage.getItem('ui:new-layout:UI-S1') === 'true');`（默认值由你决定，但**必须在报告里写明默认值与切换方式**；建议默认 `false` 以便灰度）。

**样式**：`<el-sub-menu>` 在深色背景下需保证文字对比度，只在 `<style scoped>` 内加：
```scss
// UI-S1：分组标题与子项在深色侧栏下的可读性
:deep(.el-sub-menu__title) { color: #bfcbd9; &:hover { background-color: #263445 !important; } }
:deep(.el-menu--inline) { background-color: #1f2d3d !important; }
```
**不要全局覆写 `.el-menu`**。

### 4.5 图标去重（**可选，低优先级**）

若时间允许，把重复图标换成语义更准的（仍从 `@element-plus/icons-vue` 已引入集合里选）：如「职位管理」用 `Briefcase`、「招聘工作台」改用 `Aim` 或 `DataLine`（若已 import）；「成员管理」用 `UserFilled`（候选人已用则换成 `Avatar`）。
- **必须**在报告里列出「原图标 → 新图标」对照表。
- 若某个替换需要**新增 import**，则**跳过该替换**（避免扩大 diff）。

## 5. 关键决策点

### 5.1 为什么分组不改 role 过滤
路由已配 `meta.role` 但侧边栏没实现，这看起来像 bug，但「修好它」会让部分角色突然看不到原本能看到的菜单，属于**功能可见性变更**，生产环境已在使用，必须由产品确认。本切片只在报告中指出。

### 5.2 为什么保留 `//` 的 index 拼接
现状线上可用，改动风险高于收益。列为观察项，交由后续专项验证。

### 5.3 为什么通知只加入口不做未读数
未读数需要后端接口；本切片红线是「不新增后端调用」，因此只做入口。

### 5.4 不做的
- 不改侧边栏宽度 / 折叠 / 配色主值
- 不做响应式（移动端 H5 属 `mobile/`，不在范围）
- 不新增任何路由、不删任何菜单
- 不碰 `server/**`、`e2e/**`、`mobile/**`

## 6. 修改文件清单

### 6.1 必改文件（4 个；✱=新增）
1. ✱ `client/src/components/layout/AppBreadcrumb.vue`
2. `client/src/components/layout/Navbar.vue`（局部：删 1 行 + 加 import + 加铃铛）
3. `client/src/components/layout/Sidebar.vue`（追加 computed + 模板分支 + scoped 样式）
4. `client/src/router/index.ts`（仅追加 `group` 到 meta）

### 6.2 禁止修改文件
- `server/**`、`e2e/**`、`mobile/**`、任何 `package.json` / `tsconfig` / `vite.config.ts` / `eslint*`
- `client/src/layouts/DefaultLayout.vue`（布局骨架不在本切片范围）
- 任何页面级 `views/**.vue`
- `client/src/stores/*`（除把开关放进 `stores/app.ts` 这一种可选做法外，不改其他 store 逻辑）

### 6.3 越界检测（交付前自检）
- `git status --short` 只允许出现 §6.1 的路径。
- `git diff --stat -- server e2e mobile` 必须 **0 行**。
- `git diff -- client/src/router/index.ts` 中**只允许出现新增 `group:` 的行**，不允许有任何 `path:` / `name:` / `component:` / `title:` / `hidden:` / `requireAdmin:` / `role:` 的改动或删除。

## 7. 验收标准

### 7.1 硬性验收（审核方执行，你不跑；仅供了解通过线）
- `client pnpm type-check`：仍 **88**（0 新增）。
- `client pnpm lint:check`：仍 **137 errors / 224 warnings**（0 新增）。
- `client pnpm test`：4 文件 / 22 用例全过。
- `git diff --stat -- server e2e mobile` = 0 行。
- **开关关闭**时：侧边栏与顶栏渲染与改造前**逐项一致**（唯一差异是顶栏多一个铃铛按钮——若审核要求严格一致，可将铃铛也纳入开关控制，你自行决定并在报告中说明）。
- **开关开启**时：菜单总数与改造前**完全相同**（逐项列出对照表证明没丢项），每个菜单项点击后跳转路径与改造前一致。

### 7.2 交付报告模板（最终回复必须完整包含）
1. 完成范围概述。
2. 文件逐个说明（新增写职责；既有文件**逐处**列 before→after 摘要 + 行号）。
3. **菜单项归组对照表**（改造前顺序 → 组名 → 组内顺序，证明无遗漏、无重排）。
4. 逐处说明（含行号）。
5. **功能零回归自检表**（按 `UI-GUARD.md` 第四节第 3 项，逐项打勾 + 证据）。
6. 越界自检（`git status --short` 全文 + `git diff --stat -- server e2e mobile` + router diff 摘要）。
7. **观察项报告**（必须包含以下两条，说明为何不改）：
   - `Sidebar.vue:37` index 拼接产生 `//dashboard` 双斜杠；
   - `meta.role` 在侧边栏未生效（路由已配但 computed 未过滤）。
8. 回退方式：开关名 `ui:new-layout:UI-S1` + 置为 `false` 的具体步骤。
9. 红线自检确认（GUARD 第一节 8 条逐条）。

按本提示词直接执行：先输出实施计划，然后动手，最终回复给出完整交付报告。
