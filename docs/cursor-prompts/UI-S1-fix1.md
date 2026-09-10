# UI-S1-fix1：分组标题加图标 + 折叠态可用（UI-S1 小修）

> 前提：本提示词基于已提交的 `752a4fa feat(UI-S1)`。
> 只修复 UI-S1 交付时如实披露的**已知遗留问题 1**：分组标题没有图标，
> 导致侧边栏折叠到 64px 后菜单区近乎空白、用户找不到菜单。
> **这是一次局部小修，不是重做 UI-S1**：分组结构、面包屑、开关逻辑一律不动。

---

## 1. 目标（本次要什么）

1. 4 个分组标题（招聘作业 / 面试 / 数据与考核 / 设置与管理）各带一个图标，与子菜单项的图标视觉对齐
2. 侧边栏**折叠态（64px）下分组图标可见**，hover/点击分组能弹出子菜单
3. 兜底「其他」组也要有图标（当前无未映射 path，但未来新增菜单会出现）

---

## 2. 允许改动的文件（**严格 1 个**）

| 文件 | 允许 |
|---|---|
| `client/src/layouts/DefaultLayout.vue` | ✅ 唯一可改 |
| `client/src/router/index.ts` | ❌ 不改 |
| `client/src/components/layout/**` | ❌ 已删除的死代码，不要恢复 |
| `server/**` `e2e/**` `mobile/**` `client/src/api/**` `client/src/stores/**` | ❌ 越界 |

---

## 3. 现状事实（已核实，作为实现依据）

当前 `DefaultLayout.vue` 关键位置：

| 内容 | 行号 |
|---|---|
| `<el-menu>` 起始（含 `:collapse="appStore.sidebarCollapsed"`、`:default-openeds`） | 14–24 |
| `el-sub-menu` 分组循环 | 27–45 |
| 分组`<template #title>`（**目前只有 `<span>{{ group.title }}</span>`，无图标**） | 32–34 |
| `@element-plus/icons-vue` 导入块结束行 | 175 |
| `const MENU_GROUPS: { title: string; paths: string[] }[] = [` | 215 |
| `groupedMenuItems` computed（含末尾 push「其他」） | 301–322 |
| 「其他」兜底组 push 处 | 318–320 |
| `<style scoped lang="scss">` 起始 | 404 |
| `.sidebar` / `.sidebar-menu` 样式块 | 411–438 |

环境：element-plus `^2.5.0`、`@element-plus/icons-vue` `^2.3.1`（均已安装，**本次不新增任何 npm 依赖**）。

**为什么折叠态会空白**（已在 `client/node_modules/element-plus/dist/index.css` 中核实）：

```css
.el-menu--collapse > .el-sub-menu > .el-sub-menu__title > span { visibility: hidden; ... }
```

折叠时只隐藏**直接子 `span`**，`el-icon` 渲染成 `<i>` 不受影响。子菜单项有 `<el-icon>` 所以正常；
分组标题只有 `<span>` 没有图标，于是折叠后什么都不剩。**加 `<el-icon>` 即可解决**，不需要改 collapse 逻辑。

---

## 4. 实现要求

### 4.1 分组表加 `icon` 字段

把 `MENU_GROUPS`（215 行）的类型从 `{ title: string; paths: string[] }[]` 改为
`{ title: string; icon: Component; paths: string[] }[]`，并在 `<script setup>` 顶部补一行：

```ts
import type { Component } from 'vue';
```

> 用 `Component` 类型，**不要写 `any`**（lint 基线只许少不许增多）。`vue` 已是现有依赖，不算新依赖。

推荐使用**已导入**的图标（避免动导入块）：

| 分组 | 建议图标 | 是否已导入 |
|---|---|---|
| 招聘作业 | `Briefcase` | ✅ 已导入 |
| 面试 | `Calendar` | ✅ 已导入 |
| 数据与考核 | `TrendCharts` | ✅ 已导入 |
| 设置与管理 | `Setting` | ✅ 已导入 |
| 其他（兜底） | `Connection` | ✅ 已导入 |

若你认为有更贴切的图标（如 `Suitcase` / `Microphone` / `DataAnalysis` / `Tools` / `More`），
允许从 `@element-plus/icons-vue` **追加导入**（同一已安装包，**不算新增依赖**），但必须：
1. 先在 `client/node_modules/@element-plus/icons-vue/dist/index.d.ts`（或同名类型产物）里
   `grep` 确认该导出名**确实存在**；
2. 确认不存在就回退到上表的已导入图标，并在交付报告里说明。

### 4.2 分组标题渲染图标

把 32–34 行的 `#title` 改为与子菜单项一致的写法：

```vue
<template #title>
  <el-icon>
    <component :is="group.icon" />
  </el-icon>
  <span>{{ group.title }}</span>
</template>
```

### 4.3 `groupedMenuItems` 必须透传 icon

`groupedMenuItems`（301 行）内部的 `groups` 数组类型与 push 语句要带上 `icon`：

- 第 305 行 `const groups: { title: string; items: typeof items }[]` → 增加 `icon: Component`
- 第 313 行 `groups.push({ title: group.title, items: matched })` → 增加 `icon: group.icon`
- 第 319 行兜底组 `groups.push({ title: '其他', items: rest })` → 增加兜底图标（见 4.1 表）

**分组 key / index 仍用 `group.title`，不要改成 icon**，否则 `default-openeds` 失效。

### 4.4 折叠态样式（仅在实测异常时才加）

加完图标后，Element Plus 内置规则应已能让折叠态显示图标。**先不要写额外样式**。
只有当你确认出现下列任一问题，才按对应方案最小处理，并在报告里说明：

- 折叠态 popper（分组弹出的子菜单浮层）背景/文字色发白 → 给 `el-sub-menu` 加
  `popper-class="sidebar-group-popper"`，并在 `<style scoped lang="scss">` 内用
  `:deep(.sidebar-group-popper)` 写背景 `#304156`、文字 `#bfcbd9`、激活色 `#409EFF`
  （**用十六进制色值，不要用 `$ui-*`**，红线 7.5 只限制 `$ui-*` 必须待在 scoped scss 块内，此处即为该块内）
- 折叠态图标未垂直居中 → 在 `.sidebar .sidebar-menu` 下补 `:deep(.el-menu--collapse .el-sub-menu__title)` 的
  `justify-content: center`

### 4.5 明确禁止

1. ❌ 改 `uiNewNavLayout` 开关逻辑（当前已是 `!== 'false'` 默认开启，**保持不动**）
2. ❌ 改分组结构、`MENU_GROUPS` 的 19 个 path、角色过滤条件、面包屑逻辑
3. ❌ 改 `menuItems` computed（第 236–298 行）
4. ❌ 恢复或新建 `components/layout/**`
5. ❌ 新增 npm 依赖 / 改 `package.json` / lockfile
6. ❌ 整文件重写（当前 606 行，本次改动预计 ≤ 40 行，超出需说明原因）
7. ❌ 跑 type-check / lint / test / build（审核方重跑；基线 type-check 88、lint 137e/224w、client test 4 文件/22 用例，只许少不许多）
   —— 只允许 `curl -s -o /dev/null -w "%{http_code}" http://localhost:5174/` 做连通性检查

### 4.6 编码规范

- UTF-8 无 BOM / LF / 单引号 / 中文注释
- 新增注释统一前缀 `// UI-S1-fix1：`

---

## 5. 自测要求（不跑构建，可用浏览器人工确认）

Dev server 已在 `http://localhost:5174` 运行（Vite HMR）。改完后请人工/脚本确认两点：

| 场景 | 期望 |
|---|---|
| 展开态（`appStore.sidebarCollapsed === false`） | 4 个分组标题前有图标，与子菜单图标左对齐 |
| 折叠态（点顶栏折叠按钮，侧栏 64px） | 4 个分组图标**可见**；点击分组能弹出子菜单浮层并显示全部子项 |

回退验证：`localStorage.setItem('ui:new-layout:UI-S1','false')` 刷新后，
应回到 19 项扁平无分组、无面包屑的旧版（**本次不得影响该回退路径**）。

---

## 6. 交付报告必须包含

1. 逐处改动说明（before → after，贴关键代码片段与实际行号）
2. 4 个分组 + 「其他」兜底组各自使用的**图标名**，以及它是已导入还是追加导入（追加的请贴 grep 证据）
3. `MENU_GROUPS` / `groupedMenuItems` 类型改动后的完整签名
4. 是否新增了折叠态样式（4.4）——若加了，贴代码与触发原因；若没加，说明实测结论
5. 折叠态自测结论（图标是否可见、子菜单能否弹出）
6. 越界自检：`git status --short` + `git diff --stat -- server e2e mobile client/src/api client/src/router client/src/stores`（必须 0 行）
7. 差异总览：`git diff --stat`（预计 1 文件，≤ 40 行新增）
8. 红线自检逐条确认（含 7.5、不新增依赖、不跑验收命令）
9. 回退方式：`localStorage.setItem('ui:new-layout:UI-S1','false')` 后刷新

> ⚠️ git 命令必须**重新执行**，不要复用 UI-S1-B 报告的输出。

---

## 7. 若发现与本文档描述不符

**停下来报告，不要自行折中。** 特别是：
- 行号与本文不符 → 以实际内容为准，报告里注明实际行号
- 推荐图标在 `@element-plus/icons-vue` 中不存在 → 回退到已导入图标并说明
- 加图标后折叠态仍不可见 → 报告实际 DOM/样式原因，等审核方给方案，不要自行大改样式
