# DICT-S1 字典·批量导入服务端 执行提示词

## ⚠️ 强约束（最优先阅读）

1. 本切片为**纯服务端**切片：`client/**`、`e2e/**` 一行不动；不改任何 tsconfig / eslint。
2. 文件预算 **6 个**（§6.1 逐一编号）；其中 4 个为既有文件的**条件修改**——最小化改动 + 中文注释，交付报告逐条列出。
3. **允许且必须**新增 `xlsx` 依赖到 `server/package.json`（与 client 同版本 0.18.5）。**禁止**其他新依赖。
4. **不需要** schema 变更：Dictionary 表已存在（category/code/name/sortOrder/enabled/description），无新表无双新字段。
5. 编码红线：禁整文件重写既有文件；新文件 UTF-8 无 BOM、LF 行尾、2 空格缩进、单引号、行尾分号；中文注释。
6. 不跑验收命令（`pnpm test` / `build` / `lint` 都不跑，审核方重跑）。
7. headless 无人工确认：先输出实施计划，然后直接动手。

## 1. 任务 ID + 目标

### 1.1 任务 ID
DICT-S1

### 1.2 任务目标
实现字典批量导入的服务端链路（PRD：`PRD_字典导入导出_20260903.md`）：
- `POST /api/dictionaries/import`：收 .xlsx/.xls 文件 → service 解析 → **逐行 upsert**（同分类同 code 覆盖更新）→ 返回 { success, skipped, failed, errors } 统计
- 新增分类清单接口 `GET /api/dictionaries/categories`（供 DICT-C1 前端分类动态化使用）
- **导入跳过 ensureDefaults**（防空分类被内置默认值抢先填充，PRD §4 决策 6）
- 服务端测试：unit（service 逐行 upsert / 错误统计）+ integration（权限 / 文件校验 / 行级错误）

## 2. 上下文

### 2.1 项目位置
后端在 `server/`（Express 4 + TS ESM + Prisma 5.22）。既有代码用相对路径 `../services/x`——沿用相对路径风格。

### 2.2 关键已核实事实（起草人已实读源码，可直接采信）

- **Dictionary 模型**（`server/prisma/schema.prisma` 603 行）：`id / category / code / name / sortOrder(default 0) / enabled(default true) / description(String?) / createdAt / updatedAt`。**无 (category, code) 唯一约束**——upsert 不能依赖 Prisma 唯一索引，要用「先 findFirst 判重再 create/update」的手工逻辑。
- **现有 service** `server/src/services/dictionary.service.ts`（290 行）：
  - `ensureDefaults(category?)`（133 行）：分类没数据时自动初始化 `DEFAULT_DICTIONARIES` 内置默认值。**导入必须跳过它**。
  - `getDictionaries(category?)`（156 行）：内部会调 ensureDefaults。
  - `createDictionary(input)` / `updateDictionary(id, input)` / `deleteDictionary(id)`：现有单条操作，可复用其校验。
  - `generateUniqueCode(category, name)`（183 行）：拼音生成 code（**导入时不需要**——导入模板 code 必填，直接用文件里的 code）。
- **现有路由** `server/src/routes/dictionaries.ts`（87 行）：GET `/`（authenticate）、POST/PATCH/DELETE（authenticate + authorize('admin')）。
- **multer 惯例**：参照 `server/src/routes/upload.ts`（30-45 行）——`multer.diskStorage` 存临时目录 + 后续 magic bytes 校验。**本切片用内存存储**（`multer.memoryStorage()`）更简单：xlsx ≤5MB，直接 `req.file.buffer` 给 service 解析，不需要临时盘文件。
- **file-type 库已存在**：`server/src/utils/upload-file.ts` 已 import `fileTypeFromFile`。可用 `fileTypeFromBuffer(req.file.buffer)` 检测 zip 头（xlsx 是 zip，detected.mime 应为 `application/vnd.openxmlformats-officedocument.spreadsheetml.sheet`）。**本切片单独写 xlsx 校验**（不塞进 ALLOWED_UPLOAD_MIMES——那是简历白名单，不能污染）。
- **xlsx 读取**：`import * as XLSX from 'xlsx'`；`XLSX.read(buffer)` 得到 workbook，`XLSX.utils.sheet_to_json(sheet, { header: 1 })` 得到二维数组（每行一个数组），`defval` 选项可填空串。
- **错误统计契约**（PRD §3.2）：
  ```
  { success: 12, skipped: 3, failed: 1, errors: [{ row: 3, reason: '编码不能为空' }] }
  ```
  - `success`：成功 create/update 的行数
  - `skipped`：空行 / 表头行 / 已处理且被规则忽略的行
  - `failed`：校验失败跳过的行数
  - `errors`：失败明细（≤20 条，超出截断并在 reason 提示「…等 N 条错误」）
- **导入行解析规则**（PRD §2.4，已拍板）：
  - 表头：`分类(category) | 编码(code) | 名称(name) | 排序(sortOrder) | 状态(enabled) | 备注/分值(description)`
  - 表头识别：第一行若含「编码」或「code」视为表头跳过；模板示例行（说明行）识别方式见模板设计——服务端过滤掉「以 # 开头的行」和「编码行为例：」的说明行
  - **重复 code（同 category）→ 覆盖更新**（findFirst 判重 → create 或 update）
  - category 以**文件内列**为准（支持跨分类）
  - 空行跳过；未知 category 报错；code/name 缺失报错；sortOrder 非数字报错；enabled 只认 true/false/1/0/启用/禁用，否则报错
  - **单次上限 1000 行**（超了直接 400「单次导入最多 1000 行」）
- **权限**：POST /import 与 GET /categories 都 `authenticate`；import 加 `authorize('admin')`；categories 所有登录用户可读（前端分类动态化需要 hr 也能读分类名）。
- **OperationLog**（PRD §2.5）：导入成功/失败都写 `prisma.operationLog.create({ data: { userId, targetType: 'Dictionary', targetId: category, action: 'dictionary_import', detail: JSON.stringify({ success, skipped, failed }) } })`（安全性：失败也要记，供审计）。

### 2.3 数据模型（无 schema 变更）

Dictionary 表已存在，无需动 schema / migration / prisma generate。

## 3. 必读约束

### 3.1 xlsx 依赖（新增）

`server/package.json` 的 dependencies 加：
```json
"xlsx": "^0.18.5"
```
然后 `pnpm install`（在 server 目录跑一次，更新 lockfile）。**这是本切片唯一允许的依赖变更。**

**动态 import 提示**：`import * as XLSX from 'xlsx'` 是同步导入，会拖慢 server 启动（xlsx 包较大）。若你发现启动变慢，可在 service 内用 `await import('xlsx')` 懒加载（仅导入接口用到时加载）。**二选一，实现时自行权衡，交付报告说明选择。**

### 3.2 权限矩阵

| 接口 | 权限 |
|------|------|
| `POST /api/dictionaries/import` | authenticate + authorize('admin') |
| `GET /api/dictionaries/categories` | authenticate（登录可读）|

### 3.3 导入语义（服务端必守）

1. **跳过 ensureDefaults**：导入方法**不调用** `getDictionaries`（它内部会 ensure），直接 `prisma.dictionary.count/findMany/create/update`。这保证空分类导入的是文件数据，不是内置默认值。
2. **手工 upsert**（无唯一约束）：对每行 `findFirst({ where: { category, code } })` → 存在则 `update`，不存在则 `create`。
3. **逐行独立**：不用全局事务，单行失败仅 skip 不 rollback；但**同文件内 code 去重**——文件内两行同 (category, code) 只算一次：后行覆盖前行（按文件顺序，后行生效）。
4. **enabled 解析映射**：`'true'/'1'/'启用'/1/true` → true；`'false'/'0'/'禁用'/0/false` → false；其他 → 报错。
5. **description 沿用字符串**（含空字符串→null；matching_dimension 权重数字也存字符串，不转 number）。
6. **sortOrder 转 Int**：`parseInt` 成功且 ≥0 才接受；空默认 0。

### 3.4 OperationLog 约定
- action: `dictionary_import`，targetType: `'Dictionary'`，targetId: 文件首个分类（或 'multiple'）
- detail: `JSON.stringify({ success, skipped, failed })`

## 4. 实施任务

### 4.1 `server/package.json`（条件修改）
dependencies 加 `"xlsx": "^0.18.5"`。

### 4.2 ✱ `server/src/utils/xlsx-import.ts`（新增，导入解析工具）

导出：
- `parseXlsxImportRows(buffer: Buffer): Array<{ category: string; code: string; name: string; sortOrder: number; enabled: boolean; description: string | null }>` —— 解析 + 表头/说明行过滤 + 基础校验失败抛出带行号的 AppError（400）
- `XLSX_HEADER_ALIASES`：表头各列别名映射（支持「分类/category」「编码/code」「名称/name」「排序/sortOrder」「状态/enabled」「备注/description、分值/description」）

实现要点：
- `XLSX.read(buffer, { type: 'buffer' })` → `sheet_to_json(sheet1, { header: 1 })` → 二维数组
- 表头行识别：找含「编码」或 `code` 的那一行作为表头起始，其左边列序：0=category 1=code 2=name 3=sortOrder 4=enabled 5=description
- 过滤：空行（所有单元格空）、以 `#` 开头的行（说明行）、模板示例行（含「例：」）
- 每行逐字段校验，失败 `throw new AppError('第 X 行：<原因>', 400)`（**首个错误即抛**——行级错误由 service 逐行 catch，这里负责「行内容非法」的单行识别）

### 4.3 `server/src/services/dictionary.service.ts`（条件修改）

新增方法：
```ts
async importDictionaries(rows: ImportRow[]): Promise<{ success: number; skipped: number; failed: number; errors: Array<{ row: number; reason: string }> }>
```

逻辑：
1. 空 rows → 返回 `{ success: 0, skipped: 0, failed: 0, errors: [] }`（或 400「文件没有有效数据行」——选 400 更友好）
2. 逐行循环（for + try/catch 单行包裹）：
   - 行内重复 (category, code)：后行覆盖（用临时 Map 记录，或 pass 时自然覆盖）
   - `findFirst({ where: { category: row.category, code: row.code } })` → upsert
   - 单行 catch 记 `errors.push({ row, reason: e.message })`，failed++
3. 返回统计；errors 截断 20 条
4. 写 OperationLog（action: dictionary_import）

### 4.4 ✱ `server/src/controllers/dictionary.controller.ts`（条件修改）

新增方法：
```ts
async importDictionaries(req, res, next)  // 收 req.file.buffer → 调 service
async getCategories(req, res, next)        // 返回分类清单
```

getCategories 实现：查 `prisma.dictionary.findMany({ select: { category: true }, distinct: ['category'] })` + 合并 `Object.keys(DEFAULT_DICTIONARIES)`（内置分类即使无数据也返回）→ 返回 `string[]`（去重 + 排序）。

### 4.5 `server/src/routes/dictionaries.ts`（条件修改）

新增两条路由（在现有 GET / 之后）：
```ts
// 分类清单（登录可读，前端分类动态化）
router.get('/categories', authenticate, dictionaryController.getCategories);

// 批量导入（仅 admin）
router.post(
  '/import',
  authenticate,
  authorize('admin'),
  upload.single('file'),
  dictionaryController.importDictionaries
);
```

- multer 实例 `const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024 } })`（5MB）
- 文件校验在 controller 内做（fileTypeFromBuffer 验 xlsx）——**不直接复用** `validateAndRenameUpload`（那是简历白名单，扩展名不同）

### 4.6 测试

**✱ `server/tests/unit/dictionary-import.service.test.ts`**（新增，unit）：
mock prisma.dictionary（findFirst/create/update/count/operationLog create）。覆盖：
- 新 code → create；已存在 code → update（upsert 两分支）
- 行内重复 code → 后行覆盖（只一次写库）
- 单行失败 → errors 记 { row, reason } + failed++
- 空 rows → 400 或空统计
- enabled 解析（true/false/1/0/启用/禁用/非法）
- sortOrder 解析（数字/空/非法）
- errors 截断 20 条

**✱ `server/tests/integration/dictionary-import.test.ts`**（新增，integration）：
supertest + mock prisma。覆盖：
- 无 token → 401
- 非 admin（x-test-role: 'hr'）→ 403
- admin 上传合法 xlsx buffer → 200 + 统计
- 上传非 xlsx（乱字节）→ 400「不支持的文件类型」
- 超过 1000 行（可 mock 行数判定）→ 400
- 文件缺失（无 file 字段）→ 400
- GET /categories → 200 返回 string[] 分类清单

**xlsx 测试辅助**：测试里用 `XLSX.utils.json_to_sheet` + `XLSX.write` 生成 buffer 当上传文件（不需要 fixture 文件）。

## 5. 关键决策点

### 5.1 手工 upsert vs 唯一约束
Dictionary 表**没有** (category, code) 唯一约束（历史表结构），**不改 schema**（PRD 非目标：不因导入改表）。用 findFirst 判重手工 upsert，量大时（1000 行）可接受（admin 低频操作）。

### 5.2 内存存储 vs 磁盘存储
multer 用 `memoryStorage`——xlsx ≤5MB 且需要 buffer 传给 xlsx lib，内存最省事，不需要临时文件 + 清理。

### 5.3 文件校验
controller 里 `fileTypeFromBuffer` 验：
- xlsx → mime `application/vnd.openxmlformats-officedocument.spreadsheetml.sheet`（zip 头 PK）
- 旧 .xls → mime `application/vnd.ms-excel`（OLE2 头 D0 CF 11 E0）
- 其他 → 400「仅支持 xlsx/xls 文件」
同时校验扩展名（.xlsx/.xls）与 `req.file.mimetype` 兜底（不信任浏览器 MIME）。

### 5.4 GET /categories 语义
返回 `string[]`（去重排序）：`DEFAULT_DICTIONARIES` 内置分类 ∪ 库里已有分类。这样前端能显示「还没有数据的内置分类」+ 阶段 5 新增分类（interview_focus_type / hr_score_rule / matching_dimension 都在 DEFAULT_DICTIONARIES 里的话会出现在列表）。

## 6. 修改文件清单

### 6.1 必改文件（6 个；✱=新增）
1. `server/package.json`（加 xlsx 依赖）
2. ✱ `server/src/utils/xlsx-import.ts`
3. `server/src/services/dictionary.service.ts`（importDictionaries）
4. `server/src/controllers/dictionary.controller.ts`（importDictionaries + getCategories）
5. `server/src/routes/dictionaries.ts`（/categories + /import 路由 + multer）
6. ✱ `server/tests/unit/dictionary-import.service.test.ts`
7. ✱ `server/tests/integration/dictionary-import.test.ts`

### 6.2 禁止修改文件
- `client/**`、`e2e/**`、任何 tsconfig / eslint / vite 配置
- `server/prisma/**`（schema / migrations **禁止任何改动**）
- `server/src/utils/upload-file.ts`（简历上传白名单，不污染）
- `server/src/lib/**`（env / logger / prisma 不碰）

### 6.3 越界检测（交付前自检）
- `git status --short` 仅出现 6.1 的 7 个路径 + `pnpm-lock.yaml`（xlsx 依赖）
- `git diff --stat -- client e2e server/prisma` 必须 0 行
- `server/package.json` 只有 xlsx 一个依赖新增

## 7. 验收标准

### 7.1 硬性验收（审核方执行，你不跑）
- `server pnpm build`（tsc）：0 错误。
- `server pnpm test`：基线 54 文件 / 561 用例 + 本切片 2 个新测试文件全过（预期 56 文件 / 585+ 用例）。
- `server pnpm lint:check`：不新增 error（xlsx 是外部包，eslint 应该无感）。
- client / e2e / server/prisma 0 行改动。
- 新文件无 BOM。

### 7.2 交付报告模板（最终回复必须完整包含）
1. 完成范围概述（6 文件 + xlsx 依赖）。
2. 文件逐个说明（新增写职责；条件修改**逐处**列 before→after 摘要 + 中文注释）。
3. 导入语义说明（upsert 两分支 / 行内去重 / 失败统计 / enabled 与 sortOrder 解析映射）。
4. GET /categories 返回值结构 + 内置分类合并逻辑。
5. 越界自检（git status 全文 + 0 行检查）。
6. 已知问题与遗留风险（如 xlsx 同步导入 vs 动态 import 的选择）。
7. 红线自检确认。

按本提示词直接执行（headless 环境无人工确认环节）：先输出实施计划，然后动手，最终回复给出完整交付报告。