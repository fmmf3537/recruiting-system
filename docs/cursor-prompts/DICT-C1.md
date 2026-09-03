# DICT-C1 字典·导入导出前端 + 分类动态化 执行提示词

## ⚠️ 强约束（最优先阅读）

1. 本切片为**纯前端**切片：`server/**`、`e2e/**` 一行都不许动。
2. 文件预算 **4 个**（§6.1 逐一编号）；其中 2 个为既有文件的**条件修改**——必须最小化改动 + 中文注释说明，交付报告逐条列出。
3. **不跑验收命令**（`pnpm type-check` / `lint` / `test` / `build` 都不跑，审核方重跑）。
4. 编码红线：禁整文件重写既有文件；新文件 UTF-8 无 BOM、LF 行尾、2 空格缩进、单引号（Prettier 惯例）；中文注释。
5. **禁止新增依赖**：client 已有 `xlsx@0.18.5`（stats 页在用），直接复用，不加新包。
6. headless 无人工确认：先输出实施计划，然后直接动手。

## 1. 任务 ID + 目标

### 1.1 任务 ID
DICT-C1

### 1.2 任务目标
实现字典管理页的**导入导出 + 分类动态化**（PRD：`PRD_字典导入导出_20260903.md`）：
- 「导出」按钮：当前分类 → 前端用 xlsx 生成 .xlsx 下载（6 列）
- 「导入」按钮 + 弹窗：下载模板（前端生成空模板）→ 选文件 → 预览前 20 行 → 调 `POST /api/dictionaries/import` → 结果统计展示
- **分类动态化**：页面顶部 8 个写死的 radio 改为 `GET /dictionaries/categories` 返回的分类清单渲染（阶段 5 新增 3 个分类立即可见）

服务端接口已在 DICT-S1 就绪（`POST /api/dictionaries/import` + `GET /api/dictionaries/categories`），**本切片禁止任何 server 改动**。

### 1.3 服务端接口（DICT-S1 已交付，直接对接）

| 方法 | 路径 | 说明 |
|---|---|---|
| POST | `/api/dictionaries/import` | multipart form，字段 `file`（.xlsx/.xls，≤5MB，≤1000 行）→ `{ success, skipped, failed, errors: [{row, reason}] }` |
| GET | `/api/dictionaries/categories` | 返回 `string[]` 分类清单（内置分类 ∪ 已有分类，去重排序）|

## 2. 上下文

### 2.1 项目位置
前端在 `client/`（Vue 3 `<script setup>` + TS + Element Plus 2.5 + Pinia）。路径别名 `@/*` → `src/*`。Element Plus 组件自动引入，但 `ElMessage` / `ElMessageBox` 等 API 与图标需显式 import。

### 2.2 关键已核实事实（起草人已实读源码，可直接采信）

- **字典管理页** `client/src/views/settings/DictionaryPage.vue`（291 行）：
  - 顶部操作栏（9-12 行）：只有一个「新增字典项」按钮 → 在旁边加「导出」「导入」
  - 分类 radio（16-25 行）：**8 个写死**（department/location/education/source/job_type/skills/evaluation_dimension/matching_dimension）→ 改为「数据源弹窗选择 / 动态渲染」——见 §4.1
  - `currentCategory` ref 控制当前分类；`dictionaryStore.fetchDictionaries(category)` 拉数据
  - 表格列：code/name/sortOrder/enabled/description + 操作（编辑/删除）
  - `onMounted`（252-255 行）：fetch department + location
- **字典 API** `client/src/api/dictionary.ts`：`getDictionaries({category?, includeDisabled?})` 已有；**新增** `importDictionaries(file)` / `getCategories()` / 导出工具。
- **xlsx 惯例**：`client/src/views/stats/index.vue` 166/478-483 行：`import * as XLSX from 'xlsx'`；`XLSX.utils.json_to_sheet(data)` → `book_new()` → `book_append_sheet(wb, ws, name)` → `XLSX.writeFile(wb, filename)`。**照抄这套**。
- **上传惯例**：`client/src/utils/request.ts` 有 `uploadFile(file)` 返回 `{ success, data?: { url } }`（102 行）。但字典导入需要 multipart 带 file → 用 `FormData` + `request.post('/dictionaries/import', formData)`（referral 页就是这么传文件的，参照 `client/src/api/referral.ts` 或 `client/src/utils/request.ts` 的 uploadFile 实现——FormData 由 axios 自动设 multipart 头）。
- **字典 store** `client/src/stores/dictionary.ts`：`fetchDictionaries(category)` / `refreshCategory(category)` 已有。**注意**：store 有 `loadedCategories` 缓存，导入成功后需 `refreshCategory` 刷新当前分类。
- **类型**：字典项 `DictionaryItem`（api/dictionary.ts）已有：id/category/code/name/sortOrder/enabled/description/createdAt/updatedAt。
- **验收基线**（审核方重跑）：`client pnpm type-check` 90（0 新增）、`client pnpm lint:check` 137e/231w（0 新增）、`client pnpm test` 4 文件 / 22 用例全过。

### 2.3 交互细节（PRD 已拍板）

- **导出**：只导出**当前选中分类**（radio 选中的），6 列全字段。
- **导入弹窗**流程：打开弹窗 → 顶部「下载导入模板」链接（生成一个空模板 xlsx 下载）→ 文件选择（el-upload auto-upload=false，仅 .xlsx/.xls，≤5MB）→ 选中后**前端解析前 20 行预览**（table 展示将导入的 6 列）→ 「开始导入」按钮 → 调后端 → 结果卡片（成功/跳过/失败 + 失败明细表）。
- **导入后**：关闭弹窗 + 刷新当前分类（`dictionaryStore.refreshCategory(currentCategory)`）+ ElMessage.success 提示统计。

## 3. 必读约束

### 3.1 反直觉点（显式标注）
1. **导入文件解析在前端也要做一次（预览用），但以服务端为准**：前端预览只是给用户看「我将导入这些行」，最终 upsert 语义服务端定。前端预览解析失败（非 xlsx/格式错）→ 提示「文件解析失败，请确认是 .xlsx 格式」，**不调后端**。
2. **导出不调后端**：前端拿着 `getDictionaries` 已有数据（`dictionaryStore.items.filter(category)`）直接生成 xlsx，零网络请求。
3. **radio 动态化后，默认选中项要变化**：首次加载 `getCategories()` 后默认选第一个**有数据的分类**（或默认 'department'——与现状一致更稳，但要处理「department 不在清单里」的边界：fallback 第一个）。**选 'department' 若在清单则保留，不在则 fallback 第一个**。
4. **导入按钮权限**：页面本身 requireAdmin（路由 meta），但追加一层保险：非 admin 打开页面时按钮隐藏（`authStore.isAdmin`）——与「新增字典项」按钮一致（现有代码没隐藏，但页面路由已拦；**保持一致不额外加隐藏**）。
5. **enabled 列导出格式**：导出时 `enabled` 输出 `true/false`（boolean 原样进 xlsx 会自动变 TRUE/FALSE 或 1/0——**要转成字符串 '启用'/'禁用'**，让 Excel 可读且导入端能解析）。
6. **sortOrder 导出**：number 原样；导入端接受数字或数字字符串。

### 3.2 模板设计（前端生成）
模板 = 空版本（表头 + 2 行示例 + # 注释行被服务端过滤）：

| 分类(category) | 编码(code) | 名称(name) | 排序(sortOrder) | 状态(enabled) | 备注/分值(description) |
|---|---|---|---|---|---|
| department | tech | 技术部 | 1 | 启用 | （示例行）|
| department | product | 产品部 | 2 | 启用 | （示例行）|

- 表头用**中文名 + 英文别名**（服务端按别名解析：分类→category 或 分类；编码→code 或 编码…见 DICT-S1 的 XLSX_HEADER_ALIASES）
- 生成方式：`XLSX.utils.json_to_sheet([...表头行, ...示例行])` 然后手动把第一行改成表头字符串数组（因为 json_to_sheet 会把 key 当表头，直接给 `aoa_to_sheet` 更简单：二维数组含表头）
- **建议直接用 `XLSX.utils.aoa_to_sheet`** 生成（二维数组，表头第一行），比 json_to_sheet 更可控

### 3.3 失败明细展示
导入返回 `errors: [{row, reason}]`（≤20 条）：结果卡片里用 `el-table`（行号 + 原因）或 `el-alert` 列表展示。**失败行不阻止成功行**（服务端已部分成功），提示文案：「成功 {success} 条，跳过 {skipped} 条，失败 {failed} 条；失败明细如下（不影响已导入行）」。

## 4. 实施任务

### 4.1 ✱ `client/src/api/dictionary.ts`（条件修改，追加）

新增：
```ts
// 分类清单（登录可读，前端分类动态化）
export function getCategories(): Promise<{ success: boolean; data: string[] }>

// 批量导入
export function importDictionaries(file: File): Promise<{
  success: boolean;
  data: { success: number; skipped: number; failed: number; errors: Array<{ row: number; reason: string }> };
}>

// 导出当前分类为 xlsx（纯前端）
export function exportDictionaryCategory(category: string, items: DictionaryItem[]): void
```

`importDictionaries` 实现：
```ts
const formData = new FormData();
formData.append('file', file);
return request.post('/dictionaries/import', formData) as Promise<...>;
```

`exportDictionaryCategory` 实现（照 stats 页套路）：
```ts
import * as XLSX from 'xlsx';
const rows = items.map((i) => ({
  '分类': i.category, '编码': i.code, '名称': i.name,
  '排序': i.sortOrder, '状态': i.enabled ? '启用' : '禁用',
  '备注/分值': i.description ?? '',
}));
const ws = XLSX.utils.json_to_sheet(rows);
const wb = XLSX.utils.book_new();
XLSX.utils.book_append_sheet(wb, ws, category);
XLSX.writeFile(wb, `字典_${category}_${new Date().toISOString().split('T')[0]}.xlsx`);
```

### 4.2 ✱ `client/src/components/settings/DictionaryImportDialog.vue`（新增，导入弹窗）

props: `modelValue`（v-model 显隐）、`category`（当前分类，用于预览默认）
emits: `update:modelValue`、`imported`（导入成功后父组件刷新生效）

结构：
- el-dialog title「导入字典」width 640px destroy-on-close
- 顶部操作行：「下载导入模板」按钮（生成模板 xlsx 下载、不调后端）+ 提示「支持 .xlsx/.xls，≤5MB，≤1000 行」
- el-upload（auto-upload=false，limit=1，accept=".xlsx,.xls"）：文件选择
- 选中文件后：`XLSX.read` 解析前 20 行 → el-table 预览（6 列；表头对齐；空行过滤）
- 解析失败 → el-alert error「文件解析失败，请确认是 .xlsx 格式」
- 底部：取消 / 「开始导入」（loading + 禁重复点击）
- 导入成功 → 「imported」emit + ElMessage.success(`导入成功 ${success} 条…`)
- 失败明细：成功/跳过/失败数卡片 + 失败表（row + reason）

模板生成（4.2 内嵌函数）：
```ts
function downloadTemplate() {
  const aoa = [
    ['分类(category)', '编码(code)', '名称(name)', '排序(sortOrder)', '状态(enabled)', '备注/分值(description)'],
    ['# 说明：分类用英文 code（如 department），编码唯一，状态填 启用/禁用 或 true/false'],
    ['department', 'tech_example', '技术部示例', 1, '启用', '示例行，导入前请删除'],
  ];
  const ws = XLSX.utils.aoa_to_sheet(aoa);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, '模板');
  XLSX.writeFile(wb, '字典导入模板.xlsx');
}
```

> 注意：# 说明行会被 DICT-S1 服务端过滤（以 # 开头跳过），示例行含「示例」也会被过滤（服务端识别「例：」或专门关键词）。**你按上面的模板生成即可，服务端已兼容。**

### 4.3 `client/src/views/settings/DictionaryPage.vue`（条件修改）

1. **分类 radio 动态化**（16-25 行）：
   - 加 `categories = ref<string[]>([])`
   - `onMounted`：`getCategories().then(res => { categories.value = res.data; 若 currentCategory 不在清单，fallback 第一个 })`
   - template 里 `v-for="cat in categories"` 渲染 radio-button，:label="cat"
   - **保留** department/location 预取逻辑；切换分类时 fetch 对应数据（现有 handleCategoryChange → fetchDictionaries）
2. **顶部操作栏**（9-12 行）：加「导出」「导入」两个按钮：
   ```vue
   <el-button @click="handleExport">导出</el-button>
   <el-button type="primary" plain @click="importDialogVisible = true">导入</el-button>
   ```
3. **handleExport**：
   ```ts
   function handleExport() {
     const items = dictionaryStore.items.filter((i) => i.category === currentCategory.value);
     if (!items.length) { ElMessage.warning('当前分类无数据'); return; }
     exportDictionaryCategory(currentCategory.value, items);
   }
   ```
4. **导入弹窗挂载**：`<DictionaryImportDialog v-model="importDialogVisible" :category="currentCategory" @imported="handleImported" />`
   - `handleImported`：`dictionaryStore.refreshCategory(currentCategory.value)` + 关闭弹窗
5. `currentCategory` 默认值处理：若 categories 加载后当前值不在清单 → 改第一个。

### 4.4 `client/src/stores/dictionary.ts`（条件修改，可选小改）

不需要改 store——`fetchDictionaries(category)` 已支持任意分类，动态化后传字符串即可。**尽量不改 store**（除非发现 bug）。

## 5. 关键决策点

### 5.1 分类动态化的数据源
用 `GET /dictionaries/categories`（DICT-S1 已实现，内置 ∪ 已有）。**不**在前端硬编码映射表——服务端是单一事实源。

### 5.2 预览 vs 服务端权威
前端解析 xlsx 只做「预览 + 早失败提示」，**不参与** upsert 决策。最终语义（覆盖更新、行级错误）以服务端返回为准。

### 5.3 不新增依赖
client 已有 `xlsx@0.18.5`（stats 页在用）。导入/导出/模板全部复用它。**不加任何新包。**

### 5.4 不做的
- 不做「全部分类导出」（PRD v1.1 可选，本次不做）
- 不做后端导出接口（前端直接生成）
- 不做拖拽排序 / 批量删除等额外功能
- 不改 `server/**`、`e2e/**`、任何 package.json

## 6. 修改文件清单

### 6.1 必改文件（3-4 个；✱=新增）
1. `client/src/api/dictionary.ts`（追加 getCategories / importDictionaries / exportDictionaryCategory）
2. ✱ `client/src/components/settings/DictionaryImportDialog.vue`（导入弹窗）
3. `client/src/views/settings/DictionaryPage.vue`（操作栏按钮 + 分类动态化 + 弹窗挂载）
4. `client/src/stores/dictionary.ts`（**尽量不改**，除非动态化需要；预算内可不动）

### 6.2 禁止修改文件
- `server/**`、`e2e/**`、任何 package.json / tsconfig / vite / eslint
- `client/src/views/stats/index.vue`（仅参考 xlsx 写法，不改）
- `client/src/utils/request.ts` / `client/src/api/referral.ts`（仅参考，不改）

### 6.3 越界检测（交付前自检）
- `git status --short` 只允许出现 §6.1 的 3-4 个路径。
- `git diff --stat -- server e2e` 必须 0 行。
- 无 package.json / lockfile 改动。

## 7. 验收标准

### 7.1 硬性验收（审核方执行，你不跑；仅供了解通过线）
- `client pnpm type-check`：仍 90（0 新增）。
- `client pnpm lint:check`：仍 137e/231w（0 新增）。
- `client pnpm test`：4 文件 / 22 用例全过。
- git status 仅 §6.1 路径；无 BOM；`server/**` `e2e/**` 0 行。

### 7.2 交付报告模板（最终回复必须完整包含）
1. 完成范围概述（实际改了哪些文件）。
2. 文件逐个说明（新增写职责；条件修改**逐处**列 before→after 摘要 + 中文注释）。
3. 交互流程说明（导出 / 导入弹窗 / 模板下载 / 预览 / 结果展示）。
4. 分类动态化实现（数据源 / 默认项 fallback / 切换逻辑）。
5. 越界自检（git status 全文 + 0 行检查）。
6. 已知问题与遗留风险（如 xlsx 前端解析兼容、导入预览与服务端的差异）。
7. 红线自检确认。

按本提示词直接执行（headless 环境无人工确认环节）：先输出实施计划，然后动手，最终回复给出完整交付报告。