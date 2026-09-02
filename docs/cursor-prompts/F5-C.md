# F5-C 猎头推荐通道·前端 执行提示词

## ⚠️ 强约束（最优先阅读）

1. 本切片为**纯前端**切片：`server/**`、`e2e/**` 一行都不许动；不改任何 `package.json` / vite / tsconfig / eslint 配置。
2. 文件预算 **6 个**（§6.1 逐一编号）：3 个新增 + 3 个既有文件条件修改（最小化改动 + 中文注释，交付报告逐处列出）。
3. 不跑验收命令（`pnpm type-check` / `lint:check` / `test` 都不跑，审核方重跑）；不 git commit。
4. 编码红线：禁整文件重写既有文件；新文件 UTF-8 无 BOM、LF 行尾、2 空格缩进、单引号、行尾分号；中文注释。
5. **lint 零增量红线（F3-C 教训）**：交付代码不得引入任何新 eslint error/warning——
   - 所有函数**先定义后使用**（`no-use-before-define`：在 A 函数里调用 B，B 的定义必须排在 A 之前；computed 里用到的函数同样如此）；
   - API 层函数必须写全返回类型，调用处**禁止 `as any`**（`@typescript-eslint/no-explicit-any`）；
   - el-form 属性顺序遵守 `vue/attributes-order`（v-if/v-loading 等指令排在 class/shadow 等属性之前）。
6. headless 无人工确认：先输出实施计划，然后直接动手。

## 1. 任务 ID + 目标

### 1.1 任务 ID
F5-C

### 1.2 任务目标
实现 PRD 阶段 5 F5「猎头推荐通道」前端（需求全文 `PRD_阶段5_AI招聘增强与HR考核_20260901.md` §7，尤其 §7.6）：
- **机构管理页** `/settings/agencies`（hr/admin）：机构列表（含链接数/推荐数）、新增/编辑/启停用机构、生成推荐链接弹窗（选职位/有效期）、链接复制、转化漏斗弹窗（ECharts 漏斗图）。
- **公开推荐页** `/referral/:token`：**独立极简页面，不带系统布局与导航**（meta.public，外部猎头唯一可见页面）——品牌头 + 机构名/职位名 + 表单 + 提交成功页 + 链接失效页。
- **候选人列表来源筛选**增加「猎头渠道」分组。

### 1.3 端点清单（0 新增后端端点，全部消费 F5-S 已实现接口）

| 方法 | 路径 | 响应结构（已实读 controller 核实） | 说明 |
|---|---|---|---|
| POST | `/api/agencies` | 201 `{ success, message, data: Agency }` | 新增机构 |
| PATCH | `/api/agencies/:id` | `{ success, message, data: Agency }` | 编辑/启停用 |
| GET | `/api/agencies` | `{ success, data: AgencyListItem[] }` | 列表含 linkCount/referralCount |
| POST | `/api/agencies/:id/links` | 201 `{ success, message, data: AgencyLinkRecord }` | 生成链接，**token 仅此一次返回** |
| DELETE | `/api/agencies/links/:linkId` | `{ success, message }` | 停用链接（本切片 UI 暂不用，见 §5.2） |
| GET | `/api/agencies/:id/stats` | `{ success, data: AgencyStats }` | 转化漏斗 |
| GET | `/api/referral/:token` | `{ success, data: { agencyName, jobTitle } }` | **公开**，410 = 链接已失效 |
| POST | `/api/referral/:token` | `{ success, message: '已提交，将由 HR 联系候选人' }` | **公开**，FormData |

以上 6 个管理接口均需登录且角色 hr/admin（`agency:manage`）；hiring_manager/interviewer 调用会 403。

## 2. 上下文

### 2.1 项目位置
仓库根即项目根；前端在 `client/`，一律用 `@/` 别名导入。

### 2.2 已核实类型（与 server 实读一致，直接照抄到 api 层）

```ts
// 机构列表项（GET /api/agencies）
interface AgencyListItem {
  id: string;
  name: string;
  contact: string | null;
  phone: string | null;
  enabled: boolean;
  remark: string | null;
  createdById: string;
  createdAt: string;
  linkCount: number;      // 链接数（_count.links）
  referralCount: number;  // 推荐数（source='猎头:'+name 的候选人数）
}

// 生成链接返回（POST /api/agencies/:id/links）
interface AgencyLinkRecord {
  id: string;
  agencyId: string;
  token: string;
  jobId: string | null;
  expiresAt: string | null;
  disabledAt: string | null;
  createdById: string;
  createdAt: string;
  referralUrl: string;    // '/referral/<token>' 相对路径
}

// 转化漏斗（GET /api/agencies/:id/stats）
interface AgencyStats {
  total: number;
  stages: Array<{ stage: string; count: number }>;
  offers: number;
  joined: number;
}

// 公开落地页（GET /api/referral/:token）
interface ReferralInfo {
  agencyName: string;
  jobTitle: string | null;  // null = 通用推荐
}
```

### 2.3 可复用模块（严禁重写）
- `client/src/utils/request.ts` 默认导出 axios 实例 `request`（baseURL 已含 `/api`，响应拦截器直接返回 `response.data`，请求拦截器自动带 token）；文件上传参照同文件 `uploadFile` 的 FormData 写法（`headers: { 'Content-Type': 'multipart/form-data' }`）。
- `client/src/types/error.ts` 的 `BusinessError`（字段 `statusCode`，注意不是 `status`）。
- `client/src/api/job.ts` 的 `getJobList(params?)`（返回 `Promise<JobListData>`，先读该文件确认 JobListData 结构与分页参数再用于链接弹窗职位下拉）。
- ECharts：参照 `client/src/views/stats/index.vue` 151-181 行的按需引入范式（`echarts/core` 的 `use` + `CanvasRenderer` + `FunnelChart` + `TooltipComponent/LegendComponent/TitleComponent` + `vue-echarts` 默认导出 `VChart`），**复制同一套 import 写法**。
- 设置页 CRUD 范式：参照 `client/src/views/settings/TagManagement.vue`（page-header + el-card + el-table + el-dialog 表单）。
- 公开极简页范式：参照 `client/src/views/login/index.vue`（顶级路由 + 自带容器样式，无 DefaultLayout）。
- 角色判断：`useAuthStore()`（`@/stores/auth`）；member 与 hr 等价，前端换算惯例 `rawRole === 'member' ? 'hr' : rawRole`（见 DefaultLayout.vue 183-184 行）。

### 2.4 业务规则来源（动笔前必读）
- `PRD_阶段5_AI招聘增强与HR考核_20260901.md` §7（尤其 §7.6 前端页面）
- `server/src/routes/referral.ts`（公开提交表单 zod 规则：姓名 2-30、手机 `^1[3-9]\d{9}$`、邮箱可空但填了须合法、推荐理由 ≤1000、consent 必填；multer 单文件字段名 `file`）

## 3. 必读约束

### 3.1 已拍板决策（服务端复核继承，前端不得偏离）
- 公开提交成功页只显示固定文案「已提交，将由 HR 联系候选人」，不显示任何 ID。
- 授权勾选必填，未勾选禁止提交（前端校验 + 服务端 zod 双重）。
- 链接生成后 **token 只返回一次**：生成成功弹窗必须展示完整链接 + 复制按钮 + 「链接仅本次显示，请立即复制保存」警示；不存在链接列表接口。

### 3.2 反直觉点（实读核实，勿「自作主张修正」）
1. **来源筛选值是精确匹配**：后端 `where.source = source` 精确匹配，猎头候选人 `source = '猎头:机构名'`（**半角冒号**）。候选人页「猎头渠道」分组的选项 value 必须是 `猎头:${机构name}`。
2. **机构列表接口仅 hr/admin 可调**：候选人页加载「猎头渠道」分组前必须先判断当前用户角色（member 换算 hr），仅 admin/hr 才发请求；其他角色**不发请求**（不是发了再 catch——403 会触发 request.ts 全局错误弹窗，污染体验）。
3. **410 的双重表现**：公开页 GET 410 时，request.ts 拦截器会弹一次 `ElMessage.error('链接已失效')`，同时页面 catch `BusinessError`（`statusCode === 410`）切换到「链接失效」视图——两者并存是可接受的，**不要**为了抑制弹窗去改 request.ts（红线）。
4. **expiresAt 三态语义**：生成链接 body 中 `expiresAt` 缺省（不传）= 默认 90 天；显式 `null` = 长期有效；ISO 字符串 = 自定义。UI 用单选三态映射，禁止只传日期。
5. 公开页提交表单字段名：`name` / `phone` / `email` / `reason` / `consent`（字符串 `'true'`）+ 文件字段名 `file`。
6. 菜单不是 router meta 驱动的：`DefaultLayout.vue` 的 `menuItems` computed 手动按角色 push（178-223 行），新菜单项加在那里；路由 meta 的 `role` 数组只被路由守卫消费。

### 3.3 RBAC 权限矩阵（本切片相关）
| 角色 | 机构管理页 | 猎头分组筛选 | 公开页 |
|---|---|---|---|
| admin | ✅ | ✅ | ✅（任何人） |
| hr（含 member 换算） | ✅ | ✅ | ✅ |
| hiring_manager | ❌（守卫拦截） | ❌（不显示分组、不发请求） | ✅ |
| interviewer | ❌ | ❌ | ✅ |

## 4. 实施任务

### 4.1 ✱ `client/src/api/agency.ts`（新增）
类型（§2.2 照抄）+ 8 个 API 函数，全部写全返回类型（参照 `client/src/api/dictionary.ts` 的 `Promise<{ success: boolean; data: ... }>` 写法）：
- `createAgency(data: { name: string; contact?: string; phone?: string; remark?: string }): Promise<{ success: boolean; message: string; data: AgencyListItem }>`
- `updateAgency(id: string, data: Partial<{ name: string; contact: string; phone: string; remark: string; enabled: boolean }>): Promise<{ success: boolean; message: string; data: AgencyListItem }>`
- `getAgencyList(): Promise<{ success: boolean; data: AgencyListItem[] }>`
- `createAgencyLink(agencyId: string, data: { jobId?: string; expiresAt?: string | null }): Promise<{ success: boolean; message: string; data: AgencyLinkRecord }>`
- `disableAgencyLink(linkId: string): Promise<{ success: boolean; message: string }>`（UI 暂不用，导出备用）
- `getAgencyStats(agencyId: string): Promise<{ success: boolean; data: AgencyStats }>`
- `getReferralInfo(token: string): Promise<{ success: boolean; data: ReferralInfo }>`
- `submitReferral(token: string, form: { name: string; phone: string; email?: string; reason?: string }, file: File): Promise<{ success: boolean; message: string }>`——内部组 FormData（字段名 §3.2-5，consent 固定 `'true'`，email/reason 空则不 append），`request.post('/referral/' + token, formData, { headers: { 'Content-Type': 'multipart/form-data' } })`，参照 request.ts `uploadFile`。

### 4.2 ✱ `client/src/views/settings/Agencies.vue`（新增，机构管理页）
范式参照 TagManagement.vue。结构：
- page-header：标题「猎头机构」+ 机构计数 tag + 「新增机构」按钮。
- 机构表格：名称/联系人/电话/状态（el-tag 启用·停用）/链接数/推荐数/创建时间/备注 + 操作列（编辑、生成链接、转化漏斗、启用|停用）。停用前 `ElMessageBox.confirm` 警示「停用后该机构所有推荐链接将立即失效」；启用直接 PATCH。
- 新增/编辑机构弹窗：name 必填 1-50 字；contact/phone/remark 选填。
- **生成链接弹窗**：职位下拉（`getJobList` 拉取，可清空，空 = 通用推荐）+ 有效期三态单选（`90 天（默认）` / `长期有效` / `自定义` + el-date-picker，映射 §3.2-4）。
- **链接结果弹窗**（生成成功后）：完整 URL（`window.location.origin + referralUrl`）只读输入框 + 「复制链接」按钮（`navigator.clipboard.writeText`，成功 ElMessage.success，失败降级提示手动复制）+ el-alert 警示「链接仅本次显示，关闭后无法再次查看」。
- **转化漏斗弹窗**：`getAgencyStats` → 顶部指标行（推荐总数/Offer 数/入职数）+ VChart 漏斗图（series type 'funnel'，数据来自 `stages`，`{ name: stage, value: count }`；stages 为空显示 el-empty）。echarts import 复制 stats/index.vue 范式（只引入 FunnelChart 需要的组件）。
- 全部函数先定义后使用（§5 lint 红线）；catch 块注释「错误提示已在 request 拦截器统一处理」。

### 4.3 ✱ `client/src/views/referral/index.vue`（新增，公开推荐页）
**独立极简页面，不带系统布局**（参照 login/index.vue 的容器风格）：
- 品牌头「辰航卓越 · 人才推荐」（与登录页一致的品牌文案风格）。
- 三态视图：`loading`（加载中）/ `invalid`（链接失效：el-result 图标 + 「链接已失效」+ 「请联系 HR 获取新的推荐链接」）/ 正常表单 / `success`（提交成功：el-result success + 固定文案「已提交，将由 HR 联系候选人」）。
- onMounted 调 `getReferralInfo(token)`（token 从 `useRoute().params.token` 取）：成功展示「推荐机构：{agencyName}」+（jobTitle 非空时）「推荐职位：{jobTitle}」；catch `BusinessError`（`statusCode === 410`）→ invalid 视图；其他错误也归 invalid 视图（网络错误除外——network error 由拦截器 toast，页面保持 loading→invalid 均可，选简单实现）。
- 表单（el-form + rules，前端校验与服务端 zod 对齐）：
  - 姓名*（2-30 字）、电话*（`^1[3-9]\d{9}$`）、邮箱（选填，填了须 email 格式）、推荐理由（textarea，≤1000 字，show-word-limit）
  - 简历文件*：el-upload 手动模式（`:auto-upload="false"`、`:limit="1"`、accept `.pdf,.doc,.docx`），change 时校验扩展名与大小（>10MB 提示「文件过大」——服务端上限即 10MB 量级）
  - 授权勾选*：el-checkbox「我已获得候选人授权，同意将其信息提交至贵司招聘系统」
- 提交：调 `submitReferral`，loading 锁 + 成功切 success 视图；失败 catch（400 文案如「请确认已获得候选人授权」由拦截器 toast，页面不重复弹）。
- 全页中文注释说明这是外部用户唯一可见页面，**不得出现任何系统内部数据/导航**。

### 4.4 `client/src/router/index.ts`（条件修改）
- 顶级路由（与 `/login` 平级、`meta.public`）：`{ path: '/referral/:token', name: 'Referral', component: () => import('@/views/referral/index.vue'), meta: { public: true, title: '猎头推荐' } }`。
- Layout children 追加：`{ path: '/settings/agencies', name: 'Agencies', component: () => import('@/views/settings/Agencies.vue'), meta: { title: '猎头机构', role: ['admin', 'hr'] } }`。
- 中文注释标注 F5-C。

### 4.5 `client/src/layouts/DefaultLayout.vue`（条件修改）
- `role === 'admin' || role === 'hr'` 的 jobs 菜单块后追加：`items.push({ path: '/settings/agencies', title: '猎头机构', icon: Connection })`；`Connection` 图标从 `@element-plus/icons-vue` 引入（加到既有 import 列表）。

### 4.6 `client/src/views/candidates/index.vue`（条件修改）
- 来源 el-select 内：既有字典选项包进 `<el-option-group label="常规来源">`，新增 `<el-option-group v-if="agencySourceOptions.length" label="猎头渠道">`，选项 `value: '猎头:' + name`（§3.2-1 半角冒号精确匹配）、label 同值。
- `agencySourceOptions` 仅在当前用户为 admin/hr（member 换算，§3.2-2）时才调 `getAgencyList()` 构建（onMounted 或筛选区首次展开时，选简单实现；失败静默置空数组）；其他角色不发请求。
- 全部改动带「F5-C」前缀中文注释。

## 5. 关键决策点

### 5.1 lint 零增量实现要点（F3-C-fix1 的直接教训）
- 先写辅助函数/computed 依赖的函数，再写使用它们的函数；模板渲染顺序不影响该规则，只看 `<script setup>` 内定义顺序。
- API 返回类型在 §4.1 已给全；`getJobList` / `getDictionaries` 等既有函数自带类型，调用处一律不写 `as any`。res 需要 `.data` 时直接用类型化字段。
- el-select/el-option 模板属性顺序遵循既有文件的写法（指令在前、属性在后），参照同文件已有代码。

### 5.2 已知能力缺口（不许自行补后端）
F5-S 未提供「链接列表」接口（安全设计：token 仅创建时返回一次），因此本切片**不做**链接列表/单链接停用 UI；`disableAgencyLink` 仅导出备用。机构级停用（级联失效全部链接）已在 §4.2 提供。交付报告「已知问题」中注明此缺口，由用户决定是否追加后端接口。

### 5.3 不做清单
- 不改 `server/**`、`e2e/**`、`utils/request.ts`、auth store、字典管理页
- 不做链接点击统计、不做 F4 积分展示
- 不新增前端测试文件（本切片验收 client test 基线持平 4 文件 22 用例）
- 不 git commit、不跑验收命令

## 6. 修改文件清单

### 6.1 必改文件（6 个；✱=新增）
1. ✱ `client/src/api/agency.ts`
2. ✱ `client/src/views/settings/Agencies.vue`
3. ✱ `client/src/views/referral/index.vue`
4. `client/src/router/index.ts`（条件修改）
5. `client/src/layouts/DefaultLayout.vue`（条件修改）
6. `client/src/views/candidates/index.vue`（条件修改）

### 6.2 禁止修改文件
清单以外一切；特别地：`server/**`、`e2e/**`、`client/src/utils/request.ts`、任何 package.json / vite.config.ts / tsconfig / eslint 配置。

### 6.3 越界检测（交付前自检）
- `git status --short` 只允许出现 6.1 的 6 个路径。
- `git diff --stat -- server e2e` 必须 0 行。

## 7. 验收标准

### 7.1 硬性验收（审核方执行，你不跑；仅供了解通过线）
- `client pnpm type-check`：维持 78 个存量错误，**零新增**。
- `client pnpm lint:check`：维持 137 errors / 231 warnings，**零新增**（§5.1 三条要点就是为此）。
- `client pnpm test`：4 文件 22 用例全过（持平）。
- git status 仅 6 个预算文件；新文件无 BOM（前 3 字节不得 EF BB BF）。

### 7.2 交付报告模板（最终回复必须完整包含）
1. 完成范围概述
2. 6 个文件逐个说明（新增写职责；条件修改**逐处**列 before→after 摘要）
3. 端点消费清单（8 个接口各自在哪个组件/函数被调用）
4. 反直觉点（§3.2）落实确认逐条
5. lint 零增量自查说明（函数定义顺序、无 as any、属性顺序）
6. 越界自检（git status 全文 + `git diff --stat -- server e2e`）
7. 已知问题与遗留风险（必须含 §5.2 缺口说明）
8. 红线自检确认

按本提示词直接执行（headless 环境无人工确认环节）：先输出实施计划，然后动手，最终回复给出完整交付报告。
