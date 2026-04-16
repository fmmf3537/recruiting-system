# 招聘管理系统移动端开发执行方案

> 基于 `mobile.md` 方案 B（Vue 3 + Vant 4 独立 H5，含飞书 H5 微应用适配）的详细实施计划。
> 
> **使用方式**：本方案按阶段拆分，每个阶段末尾包含一个 `Vibe Coding Prompt`。你可以将该 Prompt 直接复制到 AI 编程助手（如 Cursor、Windsurf、Kimi 等）中执行，AI 将按 Prompt 完成该阶段的全部开发、自测与交付。
> 
> **状态**：待启动

---

## 1. 项目定位与约束

### 1.1 技术选型
- **框架**：Vue 3.4 + TypeScript 5.x + `<script setup>`
- **构建**：Vite 5.x
- **组件库**：Vant 4.x（有赞移动端组件库）
- **状态管理**：Pinia 2.x
- **路由**：Vue Router 4.x
- **HTTP**：Axios（封装同 PC 端规范）
- **适配**：`postcss-px-to-viewport` + Vant 自带 rem 适配
- **飞书 JSAPI**：`@larksuite/jsapi-sdk`
- **图表**：`@antv/f2` 或 ECharts 精简版（视阶段 3 需求定）

### 1.2 不触碰的边界
- ❌ **不修改** `../client/` 目录下任何文件
- ❌ **不修改** `../server/prisma/schema.prisma` 的结构（除非明确追加可选字段）
- ✅ **复用** `../server/` 的现有 REST API
- ✅ **新建** `../mobile/` 目录，所有移动端代码集中于此

### 1.3 目标目录结构
```
recruiting-system/mobile/
├── mobdevplan.md           # 本文档
├── index.html
├── package.json
├── tsconfig.json
├── vite.config.ts
├── postcss.config.js
├── .env                    # 移动端专用环境变量
├── .env.example
├── src/
│   ├── main.ts
│   ├── App.vue
│   ├── api/               # 接口封装（复用/裁剪 server API）
│   ├── assets/
│   ├── components/        # 移动端公共组件
│   ├── composables/       # 组合式逻辑
│   ├── lib/               # 飞书 SDK 封装、axios 实例
│   ├── router/
│   ├── stores/            # Pinia stores
│   ├── styles/            # 全局样式、变量
│   ├── types/             # TS 类型
│   ├── utils/             # 工具函数
│   └── views/             # 页面视图
└── tests/
    ├── unit/              # Vitest 单元测试
    └── e2e/               # Playwright 移动端视口测试
```

---

## 2. 阶段总览

| 阶段 | 名称 | 周期 | 里程碑 | 交付物 |
|------|------|------|--------|--------|
| Phase 0 | 工程搭建与基础框架 | 3 天 | 脚手架可运行 | `mobile/` 项目能 `pnpm dev` 出 Hello World，Vant 组件正常显示，vw 适配生效 |
| Phase 1 | 认证体系 + 飞书免登 + 导航骨架 | 5 天 | 能登录并看到首页 | 账号密码登录页、飞书免登、底部 TabBar、首页 Dashboard 骨架、个人中心 |
| Phase 2 | 核心业务模块 | 10 天 | 候选人/面试/Offer/职位 四大模块可完整跑通 | 列表/详情/表单页面完整，支持增删改查与状态流转 |
| Phase 3 | 数据看板 + 飞书 JSAPI + 体验优化 | 5 天 | 飞书环境可完整使用核心功能 | 数据看板、飞书扫码/分享/导航栏控制、下拉刷新、软键盘适配、图片预览 |
| Phase 4 | 联调测试与部署上线 | 4 天 | 生产环境可访问 | 真机测试报告、Nginx 配置、CI 构建脚本、操作文档 |

**总周期：约 27 天（5～6 周，1 名前端全职）**

---

## 3. Phase 0：工程搭建与基础框架

### 3.1 阶段目标
搭建 `mobile/` 项目的完整工程骨架，确保开发环境、构建流程、组件库、适配方案、代码规范全部就绪。

### 3.2 开发任务清单

#### 3.2.1 初始化项目
1. 在 `recruiting-system/mobile/` 下执行 `npm create vite@latest . -- --template vue-ts`（或等效命令）
2. 安装核心依赖：
   - `vue@^3.4`, `vue-router@^4`, `pinia@^2`
   - `vant@^4`, `@vant/touch-emulator`（测试用）
   - `axios`, `@larksuite/jsapi-sdk`
   - `dayjs`, `lodash-es`
3. 安装开发依赖：
   - `postcss-px-to-viewport`, `@vitejs/plugin-vue`
   - `vitest`, `@vue/test-utils`, `jsdom`
   - `eslint`, `prettier`, `typescript`（配置与 `../client/` 保持一致）

#### 3.2.2 配置工程化
1. **Vite 配置** (`vite.config.ts`)：
   - 配置 `@/` 路径别名指向 `./src/`
   - 配置 Vant 4 按需引入（`unplugin-vue-components` + `unplugin-auto-import` 或手动引入）
   - 配置代理：`/api` → `http://localhost:3001`
2. **TypeScript 配置** (`tsconfig.json`)：
   - 继承 `@vue/tsconfig/tsconfig.dom.json`
   - 配置 `paths: { "@/*": ["./src/*"] }`
   - 开启 `strict: true`
3. **PostCSS 适配** (`postcss.config.js`)：
   - 配置 `postcss-px-to-viewport`，viewportWidth = 375（基于设计稿宽度）
   - Vant 组件已基于 375 设计，无需额外转换规则
4. **ESLint / Prettier**：
   - 直接复制 `../client/` 的配置规则（`.eslintrc.cjs`、`.prettierrc.json` 等），保证 Monorepo 风格一致

#### 3.2.3 搭建代码骨架
创建以下空文件/目录结构（至少要有文件头注释），确保路由能通：
- `src/main.ts` — 应用入口
- `src/App.vue` — 根组件（含 `<router-view />`）
- `src/router/index.ts` — 路由表（先定义 3 个测试路由：/、/test、/404）
- `src/stores/user.ts` — 空的 user store
- `src/lib/request.ts` — axios 实例封装（参考 `../client/src/utils/request.ts` 的风格）
- `src/views/home/index.vue` — 测试首页
- `src/views/login/index.vue` — 空登录页占位
- `src/components/TabBar.vue` — 底部导航占位

#### 3.2.4 验证适配效果
在 `src/views/home/index.vue` 中放入多个 Vant 组件（Button、Cell、Search、List），用不同 px 尺寸写死宽度，验证在不同浏览器视口下是否正确转为 vw。

### 3.3 里程碑
> **M0：移动端脚手架成功运行，Vant 组件正确显示，px 已自动转为 vw。**

### 3.4 可测试生成物
1. 执行 `cd mobile && pnpm install && pnpm dev`，服务正常启动于 `http://localhost:5174`
2. 浏览器访问 `http://localhost:5174/`，能看到带有 Vant Button、Search 的测试页面
3. 打开 DevTools 切换 iPhone 14 Pro 视口，组件比例正常，无横向滚动条
4. 检查元素样式，确认 `width: 100px` 已被转为 `width: 26.6667vw`（或类似 vw 值）

### 3.5 测试方案
| 测试项 | 方法 | 通过标准 |
|--------|------|----------|
| 开发服务器启动 | `pnpm dev` | 无报错，端口 5174 可访问 |
| Vant 组件渲染 | 手动浏览 | Button、Search、Cell 样式正常 |
| vw 适配 | DevTools 检查 computed style | px 已转为 vw |
| 路由跳转 | 访问 `/test`、非法路径 | 正常跳转与 404 兜底 |
| 构建产物 | `pnpm build` | `dist/` 目录生成，无 TS/ESLint 报错 |

### 3.6 验收标准
- [ ] `pnpm dev` 成功启动
- [ ] `pnpm build` 成功构建
- [ ] `pnpm lint` 无错误
- [ ] 移动端视口下 UI 比例正确
- [ ] 代码已提交到 Git（`mobile/` 目录下至少有一个 commit）

### 3.7 Vibe Coding Prompt（Phase 0）
```text
你是资深前端工程师，正在一个 Monorepo 项目中新建移动端子项目。

【上下文】
- 项目根目录：recruiting-system/
- 需要在 recruiting-system/mobile/ 下新建一个 Vue 3 + Vite + TypeScript 项目
- 组件库必须使用 Vant 4
- 屏幕适配使用 postcss-px-to-viewport，设计稿宽度 375px
- 路径别名使用 @/ 指向 src/
- API 代理配置为 /api -> http://localhost:3001
- ESLint 和 Prettier 规则尽量与 recruiting-system/client/ 保持一致

【任务】
1. 初始化 mobile/ 项目并安装全部依赖
2. 配置 vite.config.ts、tsconfig.json、postcss.config.js
3. 创建 src/main.ts、src/App.vue、src/router/index.ts（含3个测试路由）、src/views/home/index.vue
4. 在 home 页面中展示 Vant Button、Search、Cell 组件，并用固定 px 值写一些宽高
5. 确保 pnpm dev 能在 localhost:5174 启动，且 px 被正确转为 vw
6. 运行 pnpm build 确保构建通过
7. 提交代码

【验收标准】
- 浏览器访问 http://localhost:5174/ 能看到 Vant 组件
- DevTools iPhone 视口下比例正常，无横向滚动
- 检查元素确认 px 已转为 vw
- 没有任何 TS 或 ESLint 报错

完成后，告诉我项目结构、启动命令、以及验证截图说明。
```

---

## 4. Phase 1：认证体系 + 飞书免登 + 导航骨架

### 4.1 阶段目标
完成用户认证闭环（账号密码登录 + 飞书免登），搭建底部 TabBar 导航骨架，实现首页 Dashboard 和个人中心的基础 UI。

### 4.2 开发任务清单

#### 4.2.1 复用 API 模块
1. 在 `src/api/` 下创建：
   - `auth.ts` — 登录、获取当前用户信息、飞书登录
   - `user.ts` — 用户列表（admin 用）
2. 接口 URL 与 `../server/src/routes/` 对齐，直接复用现有后端：
   - `POST /api/auth/login`
   - `GET /api/auth/me`
   - `POST /api/auth/feishu/login`（预留，飞书接入用）

#### 4.2.2 账号密码登录页
1. `src/views/login/index.vue`：
   - 使用 Vant `Form` + `Field` + `Button`
   - 表单字段：email、password
   - 登录成功后：将 JWT token 存入 `localStorage`，调用 `auth/me` 获取用户信息写入 Pinia `userStore`
   - 使用 `vue-router` 跳转到首页
2. `src/stores/user.ts`：
   - 定义 `userInfo`、`token`、`isLogin`、`isAdmin` 等 state
   - 定义 `login()`、`logout()`、`fetchUserInfo()` 等 action

#### 4.2.3 路由守卫与权限
1. `src/router/index.ts` 增加 `beforeEach`：
   - 白名单：`/login`
   - 其他路由：检查 `localStorage` 中是否有 token，无则跳登录
   - 支持 `meta.requireAdmin` 控制 admin 专属页面

#### 4.2.4 底部 TabBar 导航
1. `src/components/TabBar.vue`：
   - 使用 Vant `Tabbar` + `TabbarItem`
   - 4 个 Tab：首页（home-o）、候选人（friends-o）、消息（comment-o）、我的（user-o）
2. `src/App.vue` 调整：
   - 登录页不显示 TabBar
   - 其他页面固定底部 TabBar
3. 创建对应的 4 个页面目录（先放占位内容）：
   - `src/views/home/index.vue`
   - `src/views/candidates/index.vue`
   - `src/views/messages/index.vue`
   - `src/views/profile/index.vue`

#### 4.2.5 首页 Dashboard 骨架
`src/views/home/index.vue` 实现：
- 顶部欢迎语（"早上好，xxx"）
- 快捷操作入口（Grid 宫格）：候选人、面试、Offer、职位
- 今日待办卡片（待处理候选人数量、待面试数量、待审批 Offer 数量）— 先写死 Mock 数据或简单计算

#### 4.2.6 个人中心页面
`src/views/profile/index.vue` 实现：
- 用户头像、姓名、角色
- 设置列表（修改密码、清除缓存、关于我们）
- 退出登录按钮（清除 token + 跳转登录页）

#### 4.2.7 飞书环境检测与免登（基础版）
1. `src/lib/feishu.ts`：封装飞书 JSAPI
   - `initFeishu()` — 初始化 SDK
   - `isFeishu()` — 判断是否运行在飞书内置浏览器
   - `getAuthCode()` — 获取临时授权码
2. `src/views/login/index.vue` 增加飞书逻辑：
   - 进入登录页时，先判断 `isFeishu()`
   - 如果是飞书环境，自动调用 `getAuthCode()` → 调 `POST /api/auth/feishu/login` → 成功后跳首页
   - 如果不是飞书环境，显示普通账号密码表单
3. **注意**：`POST /api/auth/feishu/login` 后端接口本期可能尚未实现，前端需做好 `try-catch` 降级到普通登录。

### 4.3 里程碑
> **M1：用户可通过账号密码或飞书免登进入系统，看到带有底部导航的首页和个人中心。**

### 4.4 可测试生成物
1. 账号密码登录完整流程（输入 → 请求 → 存 token → 跳转）
2. 底部 TabBar 切换 4 个页面正常
3. 未登录时访问任意页面被拦截到登录页
4. 个人中心可点击退出登录并清除状态
5. 飞书环境检测逻辑可通过 User-Agent 模拟验证

### 4.5 测试方案
| 测试项 | 方法 | 通过标准 |
|--------|------|----------|
| 账号密码登录 | 手动输入测试账号 | 登录成功，localStorage 有 token，跳转到首页 |
| 路由守卫 | 直接访问 `/candidates` | 未登录时强制跳 `/login`；登录后正常进入 |
| TabBar 切换 | 点击 4 个 tab | 页面切换流畅，激活状态正确 |
| 退出登录 | 个人中心点击退出 | token 被清除，跳回登录页 |
| 飞书环境模拟 | DevTools 修改 UA 为飞书 | 登录页隐藏表单，尝试走免登逻辑（可因后端未实现而失败，但前端逻辑需正确走到请求） |
| 单元测试 | `pnpm test:unit` | user store、login form 校验通过测试 |

### 4.6 验收标准
- [ ] 账号密码登录完整闭环
- [ ] 路由权限控制生效
- [ ] 底部 TabBar 4 个页面能正常切换
- [ ] 个人中心信息展示与退出功能正常
- [ ] 飞书环境检测与免登请求逻辑已编码（可降级）
- [ ] 至少 2 个 Vitest 单元测试通过

### 4.7 Vibe Coding Prompt（Phase 1）
```text
你是资深前端工程师，继续开发 recruiting-system/mobile/ 子项目。

【上下文】
- 项目已初始化，技术栈：Vue 3 + Vite + TS + Vant 4 + Pinia + Vue Router
- 后端 API 运行在 localhost:3001，已存在以下接口：
  - POST /api/auth/login （body: { email, password }）
  - GET /api/auth/me （header: Authorization Bearer <token>）
  - POST /api/auth/feishu/login （body: { authCode }）【可能后端暂未实现，需要 try-catch 降级】
- 现有 PC 端封装在 recruiting-system/client/src/api/ 和 stores/ 中，可参考其风格

【任务】
1. 在 src/api/ 下创建 auth.ts、user.ts，封装上述接口（使用 src/lib/request.ts 中的 axios 实例）
2. 创建 src/stores/user.ts，包含 token、userInfo、login、logout、fetchUserInfo
3. 实现 src/views/login/index.vue：
   - 使用 Vant Form + Field 做账号密码登录
   - 登录成功后存 token 和用户信息，跳转到 /
   - 集成飞书检测：引入 @larksuite/jsapi-sdk，封装 src/lib/feishu.ts（isFeishu、getAuthCode）
   - 如果是飞书环境，自动获取 authCode 并调用 /api/auth/feishu/login，成功则跳转；失败则显示账号密码表单
4. 配置路由守卫：未登录强制跳转 /login；支持 meta.requireAdmin
5. 实现底部 TabBar 组件（4 个 Tab：首页、候选人、消息、我的），在 App.vue 中控制登录页不显示 TabBar
6. 实现 4 个页面的基础占位：
   - 首页（/）：顶部欢迎语 + 4 个宫格快捷入口 + 今日待办卡片（先 mock 数据）
   - 候选人（/candidates）：空列表占位
   - 消息（/messages）：空列表占位
   - 个人中心（/profile）：头像、姓名、角色、退出登录按钮
7. 为 user store 和 login 表单校验编写至少 2 个 Vitest 单元测试
8. 提交代码

【验收标准】
- http://localhost:5174/login 能正常登录测试账号
- 登录后跳转到首页，显示 TabBar，切换 4 个页面正常
- 未登录时直接访问 /candidates 会被拦截到 /login
- 个人中心点击退出后，token 清除并回到登录页
- DevTools 模拟飞书 User-Agent 时，登录页能隐藏表单并尝试调用飞书接口（可因 404 降级显示表单）
- pnpm test:unit 至少通过 2 个测试
- 无 ESLint / TypeScript 报错

完成后，告诉我登录流程的关键代码位置和测试运行结果。
```

---

## 5. Phase 2：核心业务模块

### 5.1 阶段目标
完成候选人、面试反馈、Offer、职位四大核心业务模块的移动端页面，支持列表浏览、详情查看、关键操作（状态流转、审批、反馈填写）。

### 5.2 开发任务清单

#### 5.2.1 通用列表组件封装
`src/components/ListPage.vue`：
- 基于 Vant `List` + `PullRefresh` + `Search` + `Empty`
-  props：`fetchApi`（请求函数）、`renderItem`（插槽）
- 内置下拉刷新、上拉加载更多、空状态、骨架屏

#### 5.2.2 候选人模块
1. `src/api/candidates.ts`：封装接口
   - `GET /api/candidates`（列表）
   - `GET /api/candidates/:id`（详情）
   - `POST /api/candidates`（创建）
   - `PUT /api/candidates/:id`（更新）
   - `POST /api/candidates/:id/stages`（推进阶段）
   - `POST /api/upload`（简历上传）
2. `src/views/candidates/index.vue`：
   - 使用 `ListPage` 展示候选人列表
   - 顶部搜索框（按姓名/邮箱搜索）
   - 筛选标签（按阶段筛选）
   - 列表项展示：姓名、当前阶段、最近更新、关联职位
   - 右下角浮动按钮（+）跳转到创建页
3. `src/views/candidates/CandidateDetail.vue`：
   - 基本信息卡片（姓名、电话、邮箱、学历、工作年限等）
   - 工作经历折叠面板（Vant `Collapse`）
   - 招聘阶段时间轴（Vant `Steps`）
   - 底部操作栏：推进阶段、上传简历、编辑信息
4. `src/views/candidates/CandidateForm.vue`：
   - 使用 Vant `Form` + `Field` + `Picker` + `Calendar`
   - 支持创建和编辑两种模式（通过 route query `mode=edit&id=xxx` 区分）
   - 表单字段对齐后端 Candidate 模型（精简移动端必填项）
5. `src/views/candidates/ResumeUpload.vue`：
   - 使用 Vant `Uploader`
   - 调用 `/api/upload`，成功后更新 candidate 的 resumeUrl

#### 5.2.3 面试反馈模块
1. `src/api/interviews.ts`：封装接口
   - `GET /api/interviews`（我的面试列表）
   - `GET /api/interviews/:id`（详情）
   - `POST /api/interviews`（创建反馈）
2. `src/views/interviews/index.vue`：
   - 列表展示：候选人姓名、面试轮次、面试时间、结论状态
   - 按时间倒序
3. `src/views/interviews/InterviewForm.vue`：
   - 表单字段：轮次（Picker）、面试官、面试时间（DatetimePicker）、结论（Radio）、反馈内容（Textarea）、淘汰原因（条件显示）
   - 移动端不使用富文本编辑器，改用纯文本域

#### 5.2.4 Offer 模块
1. `src/api/offers.ts`：封装接口
   - `GET /api/offers`（列表）
   - `GET /api/offers/:id`（详情）
   - `POST /api/offers`（创建）
   - `PUT /api/offers/:id`（更新）
2. `src/views/offers/index.vue`：
   - 列表展示：候选人、薪资、Offer 日期、结果状态
   - 状态标签颜色区分（pending/accepted/rejected）
3. `src/views/offers/OfferDetail.vue`：
   - 基本信息卡片 + 入职状态
   - 底部操作：接受/拒绝/已入职（通过 ActionSheet 选择）
4. `src/views/offers/OfferForm.vue`：
   - 创建/编辑 Offer 表单（字段对齐后端 Offer 模型，精简版）

#### 5.2.5 职位模块（只读 + 分享）
1. `src/api/jobs.ts`：封装接口
   - `GET /api/jobs`（列表）
   - `GET /api/jobs/:id`（详情）
2. `src/views/jobs/index.vue`：
   - 职位列表：标题、部门、地点、状态
   - 点击跳转到详情
3. `src/views/jobs/JobDetail.vue`：
   - 职位标题、部门、职级、地点、描述、要求
   - 顶部或底部增加"分享给同事"按钮（先调用 Web Share API 或复制链接）

#### 5.2.6 阶段推进弹窗
`src/components/StageActionSheet.vue`：
- 通用组件，用于候选人详情页点击"推进阶段"时弹出
- 选择目标阶段 + 填写备注
- 提交后调用对应 API

### 5.3 里程碑
> **M2：候选人/面试/Offer/职位 四大模块的列表、详情、关键操作页面全部可用，数据来自真实后端 API。**

### 5.4 可测试生成物
1. 候选人列表可下拉刷新、上拉加载、搜索、筛选
2. 候选人详情页能看到完整信息和阶段时间轴
3. 可从候选人详情页填写面试反馈
4. 可从候选人详情页创建/编辑 Offer
5. 职位列表和详情页正常浏览，支持分享

### 5.5 测试方案
| 测试项 | 方法 | 通过标准 |
|--------|------|----------|
| 候选人列表 | 手动浏览 + 搜索 + 筛选 | 数据正确，下拉刷新和上拉加载正常 |
| 候选人创建 | 填写表单提交 | 创建成功后跳回列表，列表第一条是新数据 |
| 候选人详情 | 点击列表项 | 信息完整，工作经历可折叠，阶段时间轴正确 |
| 面试反馈 | 从候选人详情页点击"填写反馈" | 表单提交成功，返回详情页后数据更新 |
| Offer 审批 | 从候选人详情页或 Offer 列表操作 | 状态变更成功，标签颜色变化 |
| 职位浏览 | 访问职位列表和详情 | 信息正确，分享按钮可触发（至少复制链接成功） |
| 单元测试 | `pnpm test:unit` | candidates store / ListPage 逻辑至少通过 3 个测试 |

### 5.6 验收标准
- [ ] 4 大业务模块的所有列表页支持下拉刷新 + 上拉加载
- [ ] 候选人详情页包含完整信息和操作入口
- [ ] 面试反馈表单不使用富文本编辑器
- [ ] Offer 状态可变更且实时反映在 UI 上
- [ ] 职位模块只读，支持分享
- [ ] 至少 3 个 Vitest 单元测试通过
- [ ] 所有新增页面在 iPhone 14 Pro 视口下无横向滚动

### 5.7 Vibe Coding Prompt（Phase 2）
```text
你是资深前端工程师，继续开发 recruiting-system/mobile/ 子项目。

【上下文】
- 技术栈：Vue 3 + Vite + TS + Vant 4 + Pinia + Vue Router
- 后端 API 已运行在 localhost:3001，接口规范与 recruiting-system/server/src/routes/ 一致
- 当前阶段需要完成：候选人、面试反馈、Offer、职位 四大核心业务模块
- 移动端表单不使用富文本编辑器，改用 Vant Field Textarea
- 要求所有列表页支持下拉刷新 + 上拉加载

【任务】
1. 封装通用列表组件 src/components/ListPage.vue（基于 Vant PullRefresh + List + Search + Empty）
2. 在 src/api/ 下创建 candidates.ts、interviews.ts、offers.ts、jobs.ts，封装对应 CRUD 接口
3. 候选人模块：
   - src/views/candidates/index.vue：列表页（搜索、阶段筛选、浮动按钮+）
   - src/views/candidates/CandidateDetail.vue：详情页（基本信息、工作经历折叠面板、阶段时间轴 Steps、底部操作栏）
   - src/views/candidates/CandidateForm.vue：创建/编辑页（精简字段，使用 Picker/Calendar）
   - src/views/candidates/ResumeUpload.vue：简历上传页（Vant Uploader 对接 /api/upload）
   - src/components/StageActionSheet.vue：推进阶段弹窗（选择阶段 + 备注）
4. 面试反馈模块：
   - src/views/interviews/index.vue：列表页
   - src/views/interviews/InterviewForm.vue：创建反馈页（轮次、面试官、时间、结论、反馈内容、淘汰原因）
5. Offer 模块：
   - src/views/offers/index.vue：列表页（状态标签颜色区分）
   - src/views/offers/OfferDetail.vue：详情页 + 底部操作（接受/拒绝/已入职 ActionSheet）
   - src/views/offers/OfferForm.vue：创建/编辑页
6. 职位模块：
   - src/views/jobs/index.vue：列表页
   - src/views/jobs/JobDetail.vue：详情页 + 分享按钮（优先使用 Web Share API，不支持则降级为复制链接）
7. 确保所有列表页使用 ListPage 组件，支持下拉刷新和上拉加载
8. 为 ListPage 或 candidates store 编写至少 3 个 Vitest 单元测试
9. 提交代码

【验收标准】
- 候选人列表支持搜索、筛选、下拉刷新、上拉加载
- 能成功创建候选人，并在列表中第一条看到
- 候选人详情页信息完整，工作经历可折叠，阶段时间轴正确
- 可从候选人详情页或面试列表进入填写面试反馈，提交成功
- Offer 列表状态标签颜色正确，可操作变更状态
- 职位详情页可分享（至少能复制链接到剪贴板）
- pnpm test:unit 至少通过 3 个测试
- iPhone 14 Pro 视口下所有页面无横向滚动
- 无 ESLint / TypeScript 报错

完成后，告诉我各模块的核心文件位置和测试覆盖情况。
```

---

## 6. Phase 3：数据看板 + 飞书 JSAPI + 体验优化

### 6.1 阶段目标
完成首页数据看板、深度集成飞书 JSAPI（分享、扫码、导航栏控制），全面优化移动端交互体验（软键盘、安全区、图片预览、错误兜底）。

### 6.2 开发任务清单

#### 6.2.1 数据看板页面
1. `src/api/stats.ts`：封装 `GET /api/stats/dashboard`
2. `src/views/stats/index.vue`：
   - 核心 KPI 卡片：本月新增候选人、在面人数、待发 Offer 数、本月入职人数
   - 使用 Vant `Grid` 或自定义卡片展示
   - 简单趋势图（近 7 天新增候选人折线图），使用 `@antv/f2` 或 ECharts 精简版
   - 注意图表在移动端的性能和尺寸适配

#### 6.2.2 首页 Dashboard 数据化
将 Phase 1 中首页的 Mock 待办数据替换为真实计算：
- 待处理候选人：调用候选人列表 API，统计 `stage=初筛` 的数量
- 待面试：调用面试列表 API，统计 `conclusion=pending` 的数量
- 待审批 Offer：调用 Offer 列表 API，统计 `result=pending` 的数量

#### 6.2.3 飞书 JSAPI 深度集成
在 `src/lib/feishu.ts` 中扩展：
1. `shareAppMessage(title, desc, url, imgUrl)` — 飞书原生分享
2. `scanQRCode()` — 扫一扫（预留，用于扫描简历二维码等场景）
3. `setNavigationBarTitle(title)` — 动态设置标题
4. `hideNavigationBarLoading() / showNavigationBarLoading()` — 加载状态
5. `openDocument(url)` — 飞书内打开 PDF/Word 文件预览

在以下页面集成飞书能力：
- **职位详情页**：点击"分享给同事"时，若 `isFeishu()` 则调用 `shareAppMessage`
- **简历预览**：若 `isFeishu()` 则调用 `openDocument`，否则用 `<a href>` 打开
- **全局**：页面切换时通过 `setNavigationBarTitle` 同步标题

#### 6.2.4 软键盘与表单体验优化
1. 所有表单页面（CandidateForm、InterviewForm、OfferForm）增加 `inputmode` 和 `autocomplete` 优化
2. 固定底部按钮在软键盘弹出时不被顶飞（使用 `position: fixed` + `padding-bottom` 安全区）
3. 搜索框获得焦点时，iOS 不回弹异常（必要时引入 `viewport-units-buggyfill` 或手动处理 blur）

#### 6.2.5 图片预览与空状态优化
1. 候选人头像、简历截图等图片使用 Vant `ImagePreview`
2. 所有列表页的 `Empty` 状态统一使用插画 + 文案
3. 网络错误全局兜底：在 `src/lib/request.ts` 中统一拦截 5xx/4xx，使用 Vant `Toast` 提示

#### 6.2.6 安全区与底部适配
1. 检查所有固定底部元素（TabBar、操作栏）是否预留 `safe-area-inset-bottom`
2. 飞书环境下额外增加底部 padding（飞书安卓版有系统导航条）

### 6.3 里程碑
> **M3：首页数据看板可用，飞书环境下能正常使用分享、文档预览、导航栏控制，整体交互体验达到可发布标准。**

### 6.4 可测试生成物
1. 首页显示真实待办统计和 KPI 卡片
2. Stats 页面展示趋势图
3. 在飞书内置浏览器中打开职位详情页，点击分享弹出飞书原生分享面板
4. 所有表单页面在 iOS/Android 真机软键盘弹出时布局正常
5. 网络断开时有统一的 Toast 错误提示

### 6.5 测试方案
| 测试项 | 方法 | 通过标准 |
|--------|------|----------|
| 数据看板 | 手动浏览首页和 /stats | 数字正确，图表正常渲染 |
| 飞书分享 | 飞书 App 内打开职位详情 | 点击分享后弹出飞书原生分享面板 |
| 飞书文档预览 | 飞书 App 内点击简历链接 | 调用飞书 `openDocument` 预览 |
| 软键盘适配 | 真机测试（iOS Safari / Android Chrome / 飞书） | 底部固定按钮不被顶起，输入框不被遮挡 |
| 图片预览 | 点击候选人头像 | 进入 Vant ImagePreview 全屏预览 |
| 网络错误 | 关闭 WiFi 后刷新页面 | 出现 Toast 提示"网络异常，请检查连接" |

### 6.6 验收标准
- [ ] 首页 Dashboard 使用真实数据
- [ ] Stats 页面图表在移动端正常显示
- [ ] 飞书 JSAPI 分享、文档预览、标题设置已集成
- [ ] 所有底部固定元素已适配安全区
- [ ] 网络错误有全局 Toast 兜底
- [ ] 至少 2 个 Vitest 单元测试通过（feishu 工具函数或 stats 数据处理）

### 6.7 Vibe Coding Prompt（Phase 3）
```text
你是资深前端工程师，继续开发 recruiting-system/mobile/ 子项目。

【上下文】
- 前面阶段已完成登录、导航、候选人、面试、Offer、职位模块
- 本阶段目标是：数据看板、飞书 JSAPI 深度集成、移动端体验优化
- 后端已有 GET /api/stats/dashboard 接口
- 飞书 JSAPI SDK 已安装：@larksuite/jsapi-sdk

【任务】
1. 数据看板：
   - 创建 src/api/stats.ts 封装 GET /api/stats/dashboard
   - 创建 src/views/stats/index.vue：展示 KPI 卡片（本月新增候选人、在面人数、待发 Offer、本月入职）
   - 使用 @antv/f2 或 ECharts 精简版绘制近 7 天新增候选人折线图（要求移动端尺寸适配）
   - 更新 src/views/home/index.vue，将 Mock 待办数据替换为真实 API 计算（初筛人数、pending 面试数、pending Offer 数）

2. 飞书 JSAPI 集成：
   - 扩展 src/lib/feishu.ts，增加：shareAppMessage、scanQRCode、setNavigationBarTitle、openDocument
   - 职位详情页（src/views/jobs/JobDetail.vue）：点击分享按钮时，若 isFeishu() 调用 shareAppMessage，否则降级为 Web Share API 或复制链接
   - 简历预览/上传页面：若 isFeishu() 调用 openDocument 预览 PDF，否则用 window.open
   - 在 router afterEach 中调用 setNavigationBarTitle 同步页面标题（仅在飞书环境）

3. 体验优化：
   - 所有表单页面优化 inputmode/autocomplete
   - 所有列表空状态使用 Vant Empty 组件并配统一插画文案
   - 在 src/lib/request.ts 中统一拦截网络错误和 5xx/4xx，使用 Vant Toast 提示用户
   - 检查所有固定底部元素（TabBar、操作栏）是否增加 padding-bottom: env(safe-area-inset-bottom)
   - 候选人头像/简历图片增加 Vant ImagePreview 预览

4. 为 feishu.ts 中的工具函数或 stats 数据处理编写至少 2 个 Vitest 单元测试
5. 提交代码

【验收标准】
- 首页 Dashboard 显示真实的待办统计数字
- /stats 页面图表在 iPhone 14 Pro 视口下正常渲染，无性能卡顿
- 在飞书内置浏览器中打开职位详情，点击分享能弹出飞书原生分享面板
- 点击简历链接时，飞书环境下调用 openDocument，非飞书环境下正常打开
- 断网后刷新页面，出现统一的 Toast 错误提示
- 所有底部固定元素在 iOS/Android 真机或 DevTools 中不贴底被遮挡
- pnpm test:unit 至少通过 2 个测试
- 无 ESLint / TypeScript 报错

完成后，告诉我飞书集成的关键代码位置和体验优化清单。
```

---

## 7. Phase 4：联调测试与部署上线

### 7.1 阶段目标
完成与后端的最终联调、真机兼容性测试、部署配置、文档交付，确保移动端可在生产环境稳定访问。

### 7.2 开发任务清单

#### 7.2.1 后端联调
1. 与后端确认以下接口在真实数据量下的表现：
   - `/api/candidates` 列表在返回 100+ 条数据时是否流畅（考虑增加 `fields` 参数做字段裁剪）
   - `/api/upload` 在移动端上传 5MB+ PDF/图片时是否超时
   - `/api/auth/feishu/login` 飞书免登接口是否已部署
2. 若后端 `feishu/login` 已可用，进行完整的飞书免登端到端测试
3. 检查后端 CORS 配置是否允许移动端的域名（如 `https://m.your-domain.com`）

#### 7.2.2 真机兼容性测试
测试矩阵：
| 设备 | 浏览器 | 测试重点 |
|------|--------|----------|
| iPhone 14 Pro | Safari | 软键盘、安全区、分享 |
| iPhone 14 Pro | 飞书 App | 免登、JSAPI、底部导航 |
| Android (小米/华为) | Chrome | 适配、下拉刷新、上传 |
| Android (小米/华为) | 飞书 App | 免登、JSAPI、文件预览 |

测试用例（至少覆盖）：
1. 登录 → 首页 → 候选人列表 → 候选人详情 → 填写面试反馈 → 创建 Offer → 返回首页
2. 职位详情 → 分享 → 回到列表
3. 个人中心 → 退出登录 → 重新登录
4. 断网重连场景
5. 上传简历（相机/相册/文件管理器三种来源）

#### 7.2.3 测试覆盖补充
1. 补充 Vitest 单元测试至 **至少 10 个**（覆盖核心 stores、composables、utils）
2. 可选：增加 2～3 个 Playwright E2E 测试（移动端视口），覆盖登录 + 首页 + 候选人列表

#### 7.2.4 构建与部署
1. `mobile/package.json` 增加 `build` 脚本优化：
   - Vite 构建输出到 `mobile/dist/`
   - 生产环境 `base` 路径配置为 `/m/`（若使用子路径部署）
2. `../nginx/nginx.conf` 增加移动端路由配置：
   ```nginx
   location /m/ {
       alias /path/to/recruiting-system/mobile/dist/;
       try_files $uri $uri/ /m/index.html;
       index index.html;
   }
   ```
3. `docker-compose.yml` / `docker-compose.prod.yml` 确认 `mobile/dist` 可被 Nginx 挂载
4. 根目录 `package.json` 增加 `build:mobile` 和 `dev:mobile` 快捷命令

#### 7.2.5 文档交付
1. `mobile/README.md`：移动端项目说明、启动命令、目录结构
2. `mobile/DEPLOY.md`：部署步骤、Nginx 配置示例、飞书应用配置说明
3. `mobile/CHANGELOG.md`：记录本次上线功能清单

### 7.3 里程碑
> **M4：移动端通过真机测试，已成功部署到生产环境，用户可通过域名或飞书工作台正常访问。**

### 7.4 可测试生成物
1. 生产环境 URL（如 `https://your-domain.com/m/`）可直接访问
2. 飞书工作台点击应用图标可正常打开并完成免登
3. 测试报告文档（含测试矩阵、通过情况、已知问题）
4. 部署配置已合并到主分支

### 7.5 测试方案
| 测试项 | 方法 | 通过标准 |
|--------|------|----------|
| 完整业务闭环 | 真机手动操作 | 从登录到 Offer 创建的全流程无阻塞 |
| 飞书免登 | 飞书 App 点击应用图标 | 无需输入密码直接进入首页 |
| 构建产物 | `pnpm build` | `dist/` 生成，无报错，体积合理（< 2MB） |
| Nginx 部署 | 访问生产域名 /m/ | 页面正常加载，刷新不 404 |
| 单元测试 | `pnpm test:unit` | 至少 10 个测试通过，覆盖率 > 60%（lines） |
| E2E 测试 | `pnpm test:e2e`（如有） | 至少 2 个核心流程通过 |

### 7.6 验收标准
- [ ] 真机测试矩阵全部通过（至少 2 台设备 × 2 个环境）
- [ ] 飞书免登端到端验证成功
- [ ] `pnpm build` 产物可正常部署
- [ ] Nginx / Docker 配置已更新并验证
- [ ] 单元测试 ≥ 10 个通过
- [ ] `mobile/README.md` 和 `mobile/DEPLOY.md` 已编写
- [ ] 代码已合并/提交到主分支

### 7.7 Vibe Coding Prompt（Phase 4）
```text
你是资深前端工程师，负责 recruiting-system/mobile/ 子项目的最后收尾工作。

【上下文】
- mobile/ 项目的前 3 个阶段已完成，现在需要联调、测试、部署上线
- 后端运行在 localhost:3001，生产部署使用 Nginx + Docker
- 移动端需要部署在 /m/ 子路径下
- 需要支持飞书 H5 微应用接入

【任务】
1. 联调检查：
   - 确认所有 API 调用正常（重点检查 /api/candidates 大数据量、/api/upload 大文件、/api/auth/feishu/login）
   - 若后端返回慢，在 request.ts 中增加 loading 和超时提示
   - 检查移动端生产域名是否在后端 CORS 白名单中

2. 真机兼容性测试：
   - 在 iPhone Safari / Android Chrome / 飞书 App 中完成以下流程测试：
     a) 登录 → 首页 → 候选人列表 → 候选人详情 → 填写面试反馈 → 创建 Offer
     b) 职位详情 → 分享
     c) 个人中心 → 退出 → 重新登录
     d) 上传简历（相册/文件）
   - 记录测试结果到 mobile/TEST_REPORT.md（表格：设备、浏览器、测试项、结果、备注）

3. 测试覆盖：
   - 补充 Vitest 单元测试至至少 10 个（覆盖 user store、候选人流转逻辑、feishu 工具函数、ListPage 逻辑等）
   - 可选：增加 2 个 Playwright E2E 测试（视口 375×812），覆盖登录+首页

4. 构建与部署：
   - 配置 vite.config.ts 的 base: '/m/'
   - 确保 pnpm build 输出到 mobile/dist/，且产物无报错
   - 修改 ../nginx/nginx.conf，增加 /m/ 路由配置
   - 修改根目录 package.json，增加 build:mobile 和 dev:mobile 脚本
   - 检查 ../docker-compose.yml 和 ../docker-compose.prod.yml，确保 mobile/dist 可被 Nginx 访问

5. 文档：
   - 编写 mobile/README.md（项目说明、启动命令、目录结构）
   - 编写 mobile/DEPLOY.md（部署步骤、Nginx 配置、飞书应用配置说明）

6. 提交所有代码

【验收标准】
- pnpm build 成功，dist/ 目录生成
- pnpm test:unit 至少通过 10 个测试
- mobile/TEST_REPORT.md 已创建，记录了真机测试结果（至少 4 个环境组合）
- nginx.conf 已更新 /m/ 路由
- 根目录 package.json 已增加 mobile 相关脚本
- mobile/README.md 和 mobile/DEPLOY.md 已编写
- 无 ESLint / TypeScript 报错

完成后，告诉我部署验证的关键步骤和已发现的问题清单（如有）。
```

---

## 8. 跨阶段的通用规范

### 8.1 Git 提交规范
- 每个 Phase 完成后必须有一个独立的 commit 或 PR
- 提交信息以中文为主，例如：
  - `feat(mobile): 搭建移动端工程脚手架`
  - `feat(mobile): 实现账号密码登录与飞书免登`
  - `feat(mobile): 完成候选人模块列表与详情页`
  - `feat(mobile): 集成飞书 JSAPI 与数据看板`
  - `chore(mobile): 真机测试与部署配置`

### 8.2 代码质量标准
- 每个 `.vue` 文件必须包含 `<script setup lang="ts">`
- 优先使用 `composables` 封装可复用逻辑
- 所有 API 响应必须做 `try-catch` 处理
- 不允许出现 `any`（除非有明确注释说明）

### 8.3 测试底线
- Phase 0：至少 0 个测试（基建阶段可豁免）
- Phase 1：≥ 2 个单元测试
- Phase 2：≥ 3 个单元测试
- Phase 3：≥ 2 个单元测试
- Phase 4：累计 ≥ 10 个单元测试 + 可选 E2E

### 8.4 与现有服务的关系
- **绝不修改** `../client/` 的任何代码
- **尽量不修改** `../server/` 的代码，除非追加完全向后兼容的接口（如 `feishu/login`）
- 所有移动端代码限制在 `recruiting-system/mobile/` 目录内

---

## 9. 快速启动检查单

如果你是第一次开始执行本方案，请按以下顺序操作：

1. [ ] 确保 `../server/` 已在 `localhost:3001` 运行
2. [ ] 确保 PostgreSQL 和 Redis 已启动
3. [ ] 将 Phase 0 的 Vibe Coding Prompt 复制到 AI 编程助手
4. [ ] AI 完成 Phase 0 后，按本方案的"验收标准"逐项检查
5. [ ] 检查通过后，进入 Phase 1，以此类推

---

*文档版本：v1.0*  
*编制日期：2026-04-16*  
*状态：待启动*
