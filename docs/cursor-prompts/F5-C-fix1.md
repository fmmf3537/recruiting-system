# F5-C-fix1 修订任务（opencode headless）

F5-C 的代码已写完，审核方重跑 `client pnpm lint:check` 发现 **lint 增量 9 处（7 error no-use-before-define + 1 error no-restricted-globals + 1 warning vue/attributes-order）**，全部出自 `client/src/views/settings/Agencies.vue` 一个文件（基线 137e/231w 必须持平）。请只修复这 9 处，不做任何其他改动。

## 问题清单与修法（同一个文件：`client/src/views/settings/Agencies.vue`）

### A. 7 个 `no-use-before-define` error —— 只移动定义位置，函数体一字不改

1. `fetchAgencyList` 定义在约 445 行，却在 268/280/307/367 行被调用（4 处报错）。
   **修法**：把 `fetchAgencyList` 整个函数定义（含「============ 列表加载 ============」注释行）**移动**到 `handleSubmit` 定义之前（建议紧跟 `formRules` 之后、`resetForm` 之前）。
2. `loadJobOptions` 定义在约 338 行，在 335 行（`showCreateLinkDialog` 内）被调用（1 处报错）。
   **修法**：把 `loadJobOptions` 整个定义**移动**到 `showCreateLinkDialog` 之前。
3. `resultUrl` 与 `resultDialogVisible` 声明在约 377-378 行，在 364/366 行（`handleCreateLink` 内）被使用（2 处报错）。
   **修法**：把「============ 链接结果弹窗 ============」注释 + 这两行 ref 声明**移动**到 `handleCreateLink` 之前（`handleCopyUrl` 不动，它本来就在两者之后）。

### B. 1 个 `no-restricted-globals` error

4. 约 461 行 `if (isNaN(date.getTime())) return '-';` → 改为 `if (Number.isNaN(date.getTime())) return '-';`。

### C. 1 个 `vue/attributes-order` warning

5. 第 19 行 `<el-card shadow="never" v-loading="loading">` → 调整属性顺序为 `<el-card v-loading="loading" shadow="never">`（指令在属性之前）。

## 编码红线

- 只做外科式小编辑/块移动，禁止整文件重写（防 BOM/行尾污染）。
- 只许碰 `client/src/views/settings/Agencies.vue` 这一个文件。
- 禁止修改其他任何文件 / git commit / 运行测试套件与 lint（审核方会重跑）。

完成后，最终回复列出：每处改动的 diff 摘要（哪段代码从哪移到哪 / 哪行改了什么）。
