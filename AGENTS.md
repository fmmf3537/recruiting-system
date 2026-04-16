# AGENTS.md — 招聘管理系统 (ATS)

> 本文件面向 AI 编码助手。如果你第一次接触这个项目，请先阅读本文档，再动手修改代码。

---

## 1. 项目概览

这是一个全栈**招聘管理系统（Applicant Tracking System, ATS）**，采用现代 Web 技术栈开发，帮助 HR 团队管理职位、候选人、面试流程、Offer 及招聘数据统计。

- **仓库结构**：Monorepo，使用 `pnpm workspaces` 管理
- **主要包**：`client`（前端）、`server`（后端）、`e2e`（端到端测试）
- **Node 版本要求**：`>= 18.0.0`
- **主要文档语言**：中文（代码注释、README、提交信息均以中文为主）

---

## 2. 技术栈

### 前端 (`client/`)
- **框架**：Vue 3（Composition API / `<script setup>`）
- **语言**：TypeScript 5.x
- **构建工具**：Vite 5.x
- **UI 组件库**：Element Plus 2.5+
- **状态管理**：Pinia 2.x
- **路由**：Vue Router 4.x
- **图表**：ECharts + vue-echarts
- **其他**：axios、@vueup/vue-quill（富文本）、xlsx（Excel 导出）
- **工程化**：unplugin-auto-import / unplugin-vue-components（自动引入 Element Plus）

### 后端 (`server/`)
- **框架**：Express 4.x
- **语言**：TypeScript 5.x（ES Modules，`"type": "module"`）
- **ORM**：Prisma 5.22.0（PostgreSQL）
- **认证**：JWT（`jsonwebtoken`）+ bcryptjs 密码加密
- **校验**：Zod
- **安全**：helmet、cors、express-rate-limit
- **队列/缓存**：BullMQ + ioredis（用于简历解析异步任务）
- **文件处理**：multer（上传）、pdf-parse / mammoth（简历解析）
- **开发运行**：`tsx watch src/index.ts`

### 测试
- **服务端单元/集成测试**：Vitest 1.6 + @vitest/coverage-v8 + supertest
- **E2E 测试**：Playwright（chromium / firefox / webkit）

### 部署与运维
- **容器化**：Docker + Docker Compose
- **反向代理**：Nginx
- **脚本支持**：`Makefile`、`deploy.sh`（Linux/Mac）、`deploy.ps1`（Windows）

---

## 3. 项目结构

```
recruiting-system/
├── client/                  # 前端（Vue 3 + Vite）
│   ├── src/
│   │   ├── api/            # API 接口封装（按业务模块拆分）
│   │   ├── assets/         # 静态资源、SCSS 变量
│   │   ├── components/     # 公共 Vue 组件
│   │   ├── layouts/        # 页面布局组件
│   │   ├── router/         # Vue Router 配置
│   │   ├── stores/         # Pinia Store（auth / user / app）
│   │   ├── types/          # TypeScript 类型定义
│   │   ├── utils/          # 工具函数
│   │   └── views/          # 页面级组件（按模块分目录）
│   ├── dist/               # 构建产物（Vite 输出）
│   ├── package.json
│   └── vite.config.ts
│
├── server/                  # 后端（Express + TypeScript）
│   ├── src/
│   │   ├── app.ts          # Express 应用实例（中间件、路由挂载）
│   │   ├── index.ts        # 服务入口（启动、优雅关闭）
│   │   ├── controllers/    # 请求处理器（按模块）
│   │   ├── middleware/     # Express 中间件（auth、errorHandler、validate 等）
│   │   ├── routes/         # 路由定义（按模块）
│   │   ├── services/       # 业务逻辑层（单元测试重点覆盖对象）
│   │   ├── types/          # 类型定义与 Express 扩展
│   │   ├── utils/          # 工具函数
│   │   ├── workers/        # BullMQ Worker（如简历解析）
│   │   └── lib/            # 基础设施（prisma、redis、queue、env、llm）
│   ├── prisma/
│   │   ├── schema.prisma   # 数据库模型定义
│   │   ├── seed.ts         # 种子数据脚本
│   │   └── migrations/     # Prisma 迁移文件
│   ├── tests/
│   │   ├── unit/           # 单元测试（services）
│   │   ├── integration/    # 接口集成测试
│   │   └── utils/          # 测试辅助（setup.ts、mocks.ts）
│   ├── uploads/            # 用户上传文件（简历等）
│   ├── package.json
│   ├── tsconfig.json
│   └── vitest.config.ts
│
├── e2e/                     # Playwright 端到端测试
│   ├── tests/
│   ├── playwright.config.ts
│   └── package.json
│
├── nginx/
│   └── nginx.conf          # Nginx 反向代理与静态资源配置
├── docker-compose.yml      # 开发环境 Docker Compose
├── docker-compose.prod.yml # 生产环境 Docker Compose
├── .env.example            # 环境变量模板
├── Makefile                # 常用命令快捷方式
└── package.json            # Root workspace 脚本
```

---

## 4. 开发环境配置

1. **安装依赖**（分别在 client / server 目录执行）：
   ```bash
   cd client && pnpm install
   cd ../server && pnpm install
   ```

2. **配置环境变量**：
   ```bash
   cp .env.example .env
   # 编辑 .env，填写 PostgreSQL 账号密码、JWT_SECRET 等
   ```

3. **初始化数据库**：
   ```bash
   cd server
   npx prisma migrate dev
   npx prisma db seed   # 可选：导入示例数据
   ```

4. **确认 Redis 可用**：后端使用 Redis 作为 BullMQ 的底层存储，开发时请确保 `REDIS_URL` 可连接。

---

## 5. 构建与运行命令

### Root 级别（快捷命令）
```bash
pnpm dev              # 同时启动 client + server（concurrently）
pnpm build            # 先 build server，再 build client
pnpm lint             # lint client + server
pnpm format           # format client + server
```

### 前端 (`client/`)
```bash
pnpm dev              # vite --port 5173，开发服务器
pnpm build            # vite build，输出到 dist/
pnpm preview          # 预览生产构建
pnpm lint             # ESLint 自动修复
pnpm format           # Prettier 格式化
pnpm type-check       # vue-tsc --noEmit
```

### 后端 (`server/`)
```bash
pnpm dev              # tsx watch src/index.ts
pnpm build            # tsc，输出到 dist/
pnpm start            # tsx src/index.ts
pnpm lint             # eslint src --ext .ts --fix
pnpm format           # prettier --write "src/**/*.ts"

# 数据库
pnpm db:generate      # prisma generate
pnpm db:migrate       # prisma migrate dev
pnpm db:deploy        # prisma migrate deploy（生产）
pnpm db:studio        # prisma studio
pnpm db:seed          # tsx prisma/seed.ts
pnpm db:reset         # prisma migrate reset

# 测试
pnpm test             # vitest run
pnpm test:watch       # vitest
pnpm test:coverage    # vitest run --coverage
pnpm test:ui          # vitest --ui
```

### E2E (`e2e/`)
```bash
pnpm test             # playwright test
pnpm test:ui          # 带 UI 模式
pnpm test:report      # show-report
```

---

## 6. 代码规范

### TypeScript / 模块
- 前后端均为 **ES Modules**（`"type": "module"`）。
- `tsconfig.json` 开启 `strict` 以及 `noUnusedLocals`、`noUnusedParameters`、`noImplicitReturns`。
- 服务端 `tsconfig.json` 额外要求 `strictNullChecks`、`strictFunctionTypes`、`noImplicitThis`。

### 格式化
- **Prettier** 统一配置（前后端一致，客户端多两项 Vue 专用配置）：
  - `semi: true`
  - `singleQuote: true`
  - `tabWidth: 2`
  - `trailingComma: "es5"`
  - `printWidth: 100`
  - `endOfLine: "lf"`

### ESLint 规则
- **服务端**：基于 `airbnb-base` + `airbnb-typescript/base`，关闭 `explicit-function-return-type`、`prefer-default-export`、`consistent-return`。
- **客户端**：基于 `plugin:vue/vue3-recommended` + `@vue/eslint-config-airbnb` + `@vue/eslint-config-typescript`。
- 通用规则：
  - `max-len: 120`（Prettier 负责 100，ESLint 兜底 120）
  - `no-console`：生产环境 `warn`，开发环境 `off`
  - 未使用变量：`argsIgnorePattern: '^_'`
  - Import 排序：按 `builtin -> external -> internal -> parent -> sibling -> index` 分组，字母序升序

### 命名与注释
- 文件/目录：小写 + kebab-case（如 `candidate-detail.vue`、`resume-parser.service.ts`）。
- Vue 组件：PascalCase（如 `CandidateDetail.vue`）。
- 数据库表：Prisma schema 中使用小写下划线（`@@map("stage_record")`）。
- **注释以中文为主**，尤其是业务逻辑注释。

---

## 7. 路径别名

### 服务端 (`server/tsconfig.json`)
```json
{
  "@/*": ["./src/*"],
  "@routes/*": ["./src/routes/*"],
  "@controllers/*": ["./src/controllers/*"],
  "@middleware/*": ["./src/middleware/*"],
  "@services/*": ["./src/services/*"],
  "@types/*": ["./src/types/*"],
  "@utils/*": ["./src/utils/*"]
}
```

### 客户端 (`client/tsconfig.json` & `vite.config.ts`)
```json
{
  "@/*": ["./src/*"],
  "@components/*": ["./src/components/*"],
  "@views/*": ["./src/views/*"],
  "@stores/*": ["./src/stores/*"],
  "@api/*": ["./src/api/*"],
  "@router/*": ["./src/router/*"],
  "@types/*": ["./src/types/*"],
  "@utils/*": ["./src/utils/*"],
  "@assets/*": ["./src/assets/*"]
}
```

> 修改代码时，**优先使用别名导入**，不要写相对路径 `../../`。

---

## 8. 测试说明

### 服务端测试
- **运行器**：Vitest（Node 环境，`globals: true`）
- **测试文件位置**：`server/tests/**/*.test.ts`
- **分类**：
  - `tests/unit/*.test.ts`：针对 `services/` 层的单元测试（核心业务逻辑）。
  - `tests/integration/*.test.ts`：基于 supertest 的接口集成测试。
  - `tests/utils/setup.ts` / `mocks.ts`：测试辅助与 Prisma mock。
- **覆盖率策略**：重点覆盖 `src/services/**/*.ts`
  - lines / functions / statements：`>= 80%`
  - branches：`>= 75%`
- **并发策略**：`pool: 'forks'`，`maxConcurrency: 1`，避免测试间数据库状态互相污染。

### E2E 测试
- **运行器**：Playwright
- **基础地址**：`http://localhost:5173`
- **浏览器**：chromium、firefox、webkit
- **并发**：`workers: 1`，`fullyParallel: false`
- **重试**：本地 1 次，CI 2 次
- **自动启动**：`playwright.config.ts` 中配置了 `webServer`，会自动启动后端（:3001）和前端（:5173）

### 修改代码时的测试义务
- 修改 `services/` 层代码 → 同步更新或补充 `tests/unit/` 对应测试。
- 修改接口行为 → 检查 `tests/integration/` 是否仍通过。
- 新增关键页面或交互流程 → 考虑在 `e2e/tests/` 增加 Playwright 用例。

---

## 9. 数据库与迁移

- **数据库**：PostgreSQL 14+
- **ORM**：Prisma
- **核心模型**：
  - `User`（用户，角色 admin / member）
  - `Job`（职位）
  - `Candidate`（候选人）
  - `CandidateJob`（候选人与职位多对多关联）
  - `WorkHistory`（工作经历）
  - `StageRecord`（招聘阶段记录）
  - `InterviewFeedback`（面试反馈）
  - `Offer`（Offer 记录）
  - `OperationLog`（操作日志）

### 日常操作
```bash
# 开发环境新增/修改模型后
npx prisma migrate dev --name <迁移名>

# 生成/更新 Prisma Client
npx prisma generate

# 生产环境应用迁移（零停机）
npx prisma migrate deploy

# 查看/编辑数据
npx prisma studio
```

---

## 10. 部署方式

### 本地 Docker Compose（开发）
```bash
# 1. 构建前端
 docker-compose --profile build run --rm client-build
# 2. 启动服务
 docker-compose up -d
# 3. 数据库迁移
 docker-compose exec server npx prisma migrate deploy
```

### 生产部署
- 使用 `docker-compose.prod.yml`，或直接运行 `deploy.sh` / `deploy.ps1`。
- 生产环境 Nginx 直接挂载 `client/dist`（而不是 volume），要求先本地/CI 构建好前端产物。
- 上传文件通过 volume 映射到 `server/uploads`，并在 Nginx 中通过 `/uploads/` 路径直接访问。

### 部署架构
```
Nginx (:80)
 ├── /      → 前端静态资源 (client/dist)
 ├── /api/  → Express Server (:3001)
 └── /uploads/ → server/uploads/
         ↓
    PostgreSQL (:5432)
```

---

## 11. 安全注意事项

- **JWT_SECRET**：生产环境必须替换为强随机字符串，切勿使用默认值。
- **DB_PASSWORD**：生产环境必须使用强密码。
- **文件上传**：
  - Nginx 限制 `client_max_body_size 50M`
  - Express 限制 `10mb`（JSON / URL-encoded）
  - 简历文件存储在 `server/uploads/`，通过 UUID 重命名，注意防范路径遍历。
- **Rate Limiting**：全局 15 分钟最多 1000 次请求（开发时如频繁刷新可调整）。
- **CORS**：由 `env.CORS_ORIGIN` 控制，生产环境应配置为具体域名。
- **Helmet**：已启用，并设置 `crossOriginResourcePolicy: { policy: 'cross-origin' }` 以兼容上传文件访问。
- **角色权限**：
  - `admin`：可访问成员管理、查看全部数据。
  - `member`：普通成员权限。
  - 后端通过 `authorize('admin')` 中间件保护敏感接口，前端路由通过 `meta.requireAdmin` 控制。

---

## 12. 给 AI 助手的修改建议

1. **最小变更原则**：只修改与需求直接相关的文件，避免大规模重构。
2. **保持中文注释**：新增或修改的复杂逻辑请用中文注释说明意图。
3. **类型安全**：不要轻易使用 `any`；如果必须，请加 `// eslint-disable-next-line @typescript-eslint/no-explicit-any` 并说明原因。
4. **路径别名**：导入时始终使用 `tsconfig` / `vite` 配置的别名，不要手写深层相对路径。
5. **测试同步**：改 `services/` 必须同步改/补 `tests/unit/`；改路由或控制器建议检查 `tests/integration/`。
6. **数据库变更**：修改 `schema.prisma` 后，**必须**生成 migration 并更新 Prisma Client（`prisma generate`）。
7. **环境变量**：新增环境变量时，同步更新 `.env.example` 和 `server/src/lib/env.ts`（如存在）。

---

*最后更新时间：2026-04-15*
