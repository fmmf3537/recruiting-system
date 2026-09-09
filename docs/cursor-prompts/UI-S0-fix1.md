# UI-S0-fix1 修复 EmptyState 样式块遗漏 lang="scss"（微型切片）

> **前置**：先粘贴 `UI-GUARD.md` 并等 Cursor 确认后，再粘贴本文件。
> **规模**：**改 1 行**，不要扩大范围。

## ⚠️ 强约束

1. **只改 1 个文件的 1 行**。禁止顺手改任何其他内容（包括"优化" EmptyState 的其他部分）。
2. 不跑验收命令（审核方重跑）。
3. 不改 `server/**`、`e2e/**`、`mobile/**`。

## 1. 任务 ID + 目标

### 1.1 任务 ID
UI-S0-fix1

### 1.2 问题（审核方审计发现，已实读源码确认）

`client/src/components/common/EmptyState.vue` 第 **80 行**是：

```vue
<style scoped>
```

但该样式块内部使用了 SCSS 变量：

- 第 84 行 `color: $ui-gray-500;`
- 第 97 行 `color: $ui-color-danger;`

`vite.config.ts` 通过 `preprocessorOptions.scss.additionalData` 全局注入 `@use "@/assets/css/variables.scss" as *;`，**该注入只对 `lang="scss"` 的样式块生效**。当前 `<style scoped>` 不带 `lang`，Vite 按**纯 CSS** 处理：

- `$ui-gray-500` / `$ui-color-danger` 作为 CSS 值**无效**，浏览器整条声明忽略；
- **不会编译报错**（CSS 容错），因此 `type-check` / `lint` / `build` 全部发现不了；
- 实际后果：空态图标不是设计灰色（回退为继承色），**错误态图标不会变红**。

### 1.3 影响面（为什么不紧急但必须修）

该组件在 UI-S0 中**尚未接入任何页面**，所以当前**零可见影响**。但 UI-S2 / UI-S3 / UI-S4 会引用它，一引用就会暴露。因此在引用前修掉。

## 2. 实施任务（唯一改动）

`client/src/components/common/EmptyState.vue` **第 80 行**：

```vue
<!-- before -->
<style scoped>
```
```vue
<!-- after -->
<style scoped lang="scss">
```

其余内容**一个字符都不许动**（不需要加 `@use`，变量由 Vite 全局注入）。

## 3. 不做的

- 不改组件模板、props、emits、SVG 图标
- 不新增/删除任何样式规则
- 不改 `variables.scss` / `main.scss`
- 不动任何其他文件

## 4. 修改文件清单

### 4.1 必改（1 个）
1. `client/src/components/common/EmptyState.vue`（第 80 行 `<style scoped>` → `<style scoped lang="scss">`）

### 4.2 越界检测
- `git status --short` 除该文件（及 UI-S0 已改的 7 个路径）外**不得出现新路径**。
- `git diff --stat -- server e2e mobile` = 0 行。
- `git diff -- client/src/components/common/EmptyState.vue` 的改动应为 **1 行删 + 1 行增**。

## 5. 交付报告（简短即可）

1. 改动确认：贴出该行 `before → after` 及行号。
2. 自查命令与输出：`grep -n '\$ui-' client/src/components/common/EmptyState.vue`（确认用到的变量行）与 `grep -n '<style' client/src/components/common/EmptyState.vue`（确认已带 `lang="scss"`）。
3. 越界自检：`git status --short` 全文 + `git diff --stat -- server e2e mobile`。
4. 确认未改动组件其他部分。

按本提示词直接执行，最终回复给出上述 4 项。
