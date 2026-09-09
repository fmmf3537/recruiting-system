# UI-S3 候选人录入入口合并 + 查重前置 执行提示词

> **前置**：先粘贴 `UI-GUARD.md` 并等 Cursor 确认后，再粘贴本文件。
> **依赖**：建议 UI-S0 完成后再做（会用到 `EmptyState` 与 token；不依赖也能做，token 直接写值亦可）。

## ⚠️ 强约束（最优先阅读）

1. 本切片为**纯前端**切片：`server/**`、`e2e/**`、`mobile/**` 一行不动；不改 `package.json`。
2. **不新增任何后端接口调用**。查重前置只能用**现有已存在**的接口实现（见 §5.1 方案 A）；若现有接口不支持，**只做入口合并，查重前置标注「需后端，不在本切片」并停止该子项**。
3. **保留现有保存时查重逻辑**（`CandidateForm.vue:585` 的 `res.warning && res.duplicates` 确认弹窗）——新增的失焦提示只是**提前告知**，**不替代、不删除**原逻辑。
4. **不改变任何提交数据结构**：`handleSubmit` 提交的字段名、必填校验规则**一个都不许改**（除新增 UI 引导外）。
5. 文件预算 **4 个**（§6.1 逐一编号），既有文件一律最小化增量 diff，**禁止整文件重写**（CandidateForm.vue 有 804 行，重写必炸）。
6. **不跑验收命令**；编码红线：UTF-8 无 BOM、LF、2 空格缩进、单引号、中文注释。
7. headless 无人工确认：先输出实施计划，然后直接动手。

## 1. 任务 ID + 目标

### 1.1 任务 ID
UI-S3

### 1.2 任务目标
解决候选人录入的**入口割裂**问题，并让查重提示**提前**到输入阶段：

- **现状两条互不相通的路径**：
  - 路径 A：`新增候选人` → `CandidateForm.vue`（空白表单，20+ 字段全手填）
  - 路径 B：`上传简历` → `ResumeUpload.vue`（独立解析页）→ 创建
  - HR 常常先手填一半才发现应该先传简历，导致重复录入。
- **目标**：合并为**一个入口两条支线**——进入「新增候选人」首屏即可选择「上传简历自动解析（推荐）」或「手动填写」，两者最终进入**同一个表单**；解析结果自动预填字段；手机号失焦即提示重复（若现有接口支持）。

### 1.3 非目标（本切片不做）
- 不做分步向导（stepper）——合并入口已解决核心问题，分步留待后续。
- 不做「简历解析置信度」（**后端 `resume-parser.service.ts` 无 confidence 字段，本轮不引入**）。
- 不改简历解析服务本身。

## 2. 上下文

### 2.1 关键已核实事实（起草人已实读源码，可直接采信）

- `client/src/views/candidates/CandidateForm.vue`（**804 行**）：
  - `:9` `<el-card class="form-card" v-loading="loading">` ← 卡片开始
  - `:32` 姓名、`:37` 性别、`:48-51` **手机号**（`<el-input v-model="formData.phone" placeholder="请输入手机号" />`）
  - `:61` 年龄、`:66` 工作年限、`:73` 授权同意
  - `:102` 最高学历、`:114` 毕业院校、`:127` 当前公司、`:132` 当前职位、`:138` 期望薪资
  - `:211` `<!-- 简历信息 -->`、`:213` `<h3 class="section-title">简历信息</h3>`、`:215` 简历附件（prop="resumeUrl"）、`:224` `<el-icon><Upload /></el-icon>上传简历`
  - `:237` 来源渠道、`:248` 来源备注、`:252` 推荐人
  - `:340` 提交按钮 `@click="handleSubmit" :loading="submitting"`
  - `:563` `async function handleSubmit()`、`:585` `if (res.warning && res.duplicates && res.duplicates.length > 0)` → **保存时查重确认弹窗**（`ElMessageBox.confirm`）
- `client/src/views/candidates/ResumeUpload.vue`：
  - `:8` `<div class="upload-area" v-if="!parsedData">` ← 上传区
  - `:36` 「解析简历」按钮
  - `:41` `<div class="parse-result" v-else>`、`:42-46` `el-descriptions` 展示 `parsedData.name / phone / email / gender` 等
  - **注意**：解析字段名与 `formData` 字段名不一定完全一致，需你实读后做**映射表**（见 §4.3）。
- `client/src/api/candidate.ts`：有候选人列表/详情/创建等接口（**先读它**，确认列表接口是否支持关键词检索参数）。
- **验收基线**：`client pnpm type-check` **88**（0 新增）、`client pnpm lint:check` **137e/224w**（0 新增）、`client pnpm test` 4 文件 / 22 用例全过。

## 3. 必读约束

### 3.1 反直觉点（显式标注）
1. **查重是"创建时后端返回"，没有独立查询 API**：`CandidateForm.vue:585` 的 `res.warning` 来自**创建接口响应**，不是单独查重接口。因此"失焦即查重"只能用现有列表检索接口本地比对（方案 A）。**严禁自己编造一个 `/api/candidates/check-duplicate` 去调。**
2. **原保存时查重逻辑必须保留**：新增的失焦提示只是"提前告知"，用户仍可继续创建；保存时若后端仍返回 warning，原有确认弹窗照常弹出。**两者并存，不删旧的。**
3. **解析结果预填不能覆盖用户已填内容**：若用户先手填了手机号再上传解析，**只填空字段**，已填字段保持不变（并在 UI 上标注「已自动填充 N 项」）。
4. **不引入新依赖**：不做拖拽库、不做文件预览库，沿用现有 `el-upload`。
5. **路由 path 不变**：两个页面的路由 `path`/`name` 都保留（外部可能有书签），只做页面内引导与跳转参数。

### 3.2 交互设计（照此实现）

**进入「新增候选人」页首屏**（在 `:9` 的 card 内、表单最上方）增加一条引导区：
```
┌────────────────────────────────────────────────────────┐
│ 有简历？上传后自动填入，省去手打    [ 上传简历解析 ]     │
│ 没有简历？直接手动填写 ↓                                │
└────────────────────────────────────────────────────────┘
```
- 「上传简历解析」按钮：点击后**就地展开**上传区（不跳页），复用 `:215-224` 已有的上传能力；解析成功后把结果映射到 `formData` 并提示「已自动填充 N 项，请核对」。
- 下方表单照常可用（手动填写支线）。

**ResumeUpload.vue 页面**：解析结果区（`:41-46`）下方，若已有「确定创建」类按钮，改为**跳转到 CandidateForm 并带上解析数据**（URL query 或 Pinia 暂存，二选一，见 §5.2）；若跳转改造风险大，**至少**在解析结果区加一个「在完整表单中补充信息」按钮。

**手机号失焦查重**（方案 A，若接口支持）：
- `:48` 的 `<el-input>` 加 `@blur="handlePhoneBlur"`
- 失焦时若手机号格式合法 → 调现有列表接口按关键词检索 → 本地比对手机号是否存在
- 命中 → 在输入框下方显示**非阻断**提示：`该手机号已存在：张三（面试中）· 点击查看`（点击跳转到该候选人详情）
- **不阻断提交**，不改变 `formData`，不弹 MessageBox（弹窗会打断填写）

## 4. 实施任务

### 4.1 `client/src/views/candidates/CandidateForm.vue`（**条件修改，最小化增量**）

1. 在 `:9` card 内、`<el-form>` 之前，新增引导区（约 12 行模板 + 1 个 ref + 1 个函数）：
```vue
<!-- UI-S3：录入入口合并——引导先传简历，减少手填 -->
<div class="ui-entry-tip">
  <span>有简历？上传后自动填入，省去手打</span>
  <el-button size="small" @click="showUploader = !showUploader">上传简历解析</el-button>
</div>
<div v-if="showUploader" class="ui-entry-uploader"><!-- 就地展开上传区 --></div>
```
2. `:48` 手机号输入框加 `@blur="handlePhoneBlur"` + 下方提示区（见 §3.2）。
3. `:211-224` 简历信息区的上传组件：**抽成一个局部可复用片段**（或直接把上传逻辑提到 `setup` 里的 `handleResumeParsed(parsed)` 函数），让顶部引导区与此处**共用同一个处理函数**（避免两套逻辑）。
4. 新增 `handleResumeParsed(parsed)`：
   - 按映射表（§4.3）把 `parsed` 写入 `formData`
   - **只填空字段**，已填不动
   - `ElMessage.success(\`已自动填充 ${n} 项，请核对\`)`
   - 收起上传区
5. **不要动** `handleSubmit` 的提交结构与 `:585` 的查重确认逻辑（保留原样，加一行中文注释说明"保存时查重保留，与失焦提示并存"）。

### 4.2 `client/src/views/candidates/ResumeUpload.vue`（**条件修改，小改**）

在 `:41-46` 解析结果区下方加「在完整表单中补充信息」按钮 → 携带 `parsedData` 跳转到 CandidateForm（跳转方式见 §5.2）。**解析页原有创建流程保持不变**（不删除任何现有按钮或逻辑）。

### 4.3 解析字段映射（`parsedData` → `formData`）

实读 `ResumeUpload.vue` 的 `parsedData` 结构与 `CandidateForm.vue` 的 `formData` 定义后，**在代码里写一张显式映射表**（中文注释逐项说明），例如：
```ts
// UI-S3：解析字段 → 表单字段映射（只映射能确定的，不确定留空由人工填）
const RESUME_FIELD_MAP: Record<string, string> = {
  name: 'name', phone: 'phone', email: 'email', gender: 'gender',
  education: 'education', school: 'school', /* …按实读结果补全… */
};
```
**映射不上的字段一律跳过**（不要猜），并在交付报告列出"未映射字段清单"。

### 4.4 可选新增文件

若失焦查重的逻辑（含防抖、格式校验、结果渲染）超过 40 行，**抽成** `client/src/composables/usePhoneDuplicateCheck.ts`（新增，纯前端，复用现有列表接口）。不超 40 行就直接写在 CandidateForm 内。

## 5. 关键决策点

### 5.1 查重前置的实现方案（**先确认再实现**）
- **方案 A（推荐，纯前端）**：复用现有候选人列表接口，传手机号作为关键词检索，前端本地比对 `phone` 是否完全匹配。
  - 前提：先读 `client/src/api/candidate.ts` 与 `candidates/index.vue` 的搜索实现，确认列表接口**支持关键词检索**（截图显示列表页有「关键词」搜索框，大概率支持）。
- **方案 B（需后端，本切片不做）**：新增 `GET /api/candidates/check-duplicate?phone=` 专用接口。
  - 若方案 A 不可行 → **只完成入口合并**，在交付报告「遗留风险」写明「查重前置需后端新增接口，建议单独立项」，**不要自己造接口**。

### 5.2 解析数据传递方式
二选一，选风险低的那个并说明理由：
- **Pinia 暂存**：`stores/` 里新增一个临时 `parsedResume` 状态，跳转后读取并清空。
- **URL query**：只传文件 URL / 解析结果 id（若解析结果已入库）。
⚠️ 不要把整份解析结果 JSON 塞进 URL（太长且有编码风险）。

### 5.3 不做的
- 不做分步向导 / 不做简历解析置信度 / 不改后端解析服务
- 不删 `ResumeUpload.vue` 的任何现有功能
- 不改提交数据结构与校验规则

## 6. 修改文件清单

### 6.1 必改文件（3-4 个）
1. `client/src/views/candidates/CandidateForm.vue`（引导区 + 手机号失焦 + 共用解析处理函数）
2. `client/src/views/candidates/ResumeUpload.vue`（解析结果区加「在完整表单中补充信息」入口）
3. （可选）`client/src/composables/usePhoneDuplicateCheck.ts`（✱ 新增，仅当查重逻辑 > 40 行）
4. （可选）`client/src/stores/` 下新增解析结果暂存（仅当采用 §5.2 Pinia 方案）

### 6.2 禁止修改文件
- `server/**`、`e2e/**`、`mobile/**`、任何 `package.json`
- `client/src/api/candidate.ts`（**只读不改**——不允许新增接口函数；若确实需要，停止并报告）
- `client/src/router/index.ts`（不改任何 path/name）
- `client/src/views/candidates/index.vue`（列表页，本切片不动）

### 6.3 越界检测
- `git status --short` 只允许 §6.1 路径。
- `git diff --stat -- server e2e mobile` 必须 **0 行**。
- `git diff -- client/src/views/candidates/CandidateForm.vue` 中，`handleSubmit` 函数体**不得有删除行**（只能有新增行与注释）。

## 7. 验收标准

### 7.1 硬性验收（审核方执行，你不跑）
- `client pnpm type-check`：仍 **88**（0 新增）。
- `client pnpm lint:check`：仍 **137e/224w**（0 新增）。
- `client pnpm test`：4 文件 / 22 用例全过。
- `git diff --stat -- server e2e mobile` = 0 行。
- **手工验证路径**（审核方做，你确保代码支持）：
  1. 新增候选人 → 首屏出现上传引导 → 上传简历 → 字段自动填充且已填字段不被覆盖
  2. 不上传直接手填 → 全流程与改造前完全一致（提交、校验、保存时查重弹窗均正常）
  3. 手机号输入已存在的号码并失焦 → 出现非阻断提示（若采用方案 A）
  4. 保存时后端返回重复 warning → 原有确认弹窗**照常出现**

### 7.2 交付报告模板
1. 完成范围概述。
2. 文件逐个说明（既有文件**逐处** before→after 摘要 + 中文注释位置）。
3. **解析字段映射表**（映射上的 + 未映射字段清单及原因）。
4. 查重前置采用的方案（A / 未做及原因）。
5. **功能零回归自检表**（按 `UI-GUARD.md` 第四节第 3 项逐项打勾 + 证据，重点证明 `handleSubmit` 提交结构与保存时查重未被破坏）。
6. 越界自检（`git status --short` 全文 + `git diff --stat -- server e2e mobile`）。
7. 已知问题与遗留风险（如方案 B 需后端、未映射字段、URL 传参限制）。
8. 红线自检确认（GUARD 第一节 8 条）。

按本提示词直接执行：先输出实施计划，然后动手，最终回复给出完整交付报告。
