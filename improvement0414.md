# 招聘管理系统改进计划

> 制定日期：2026-04-14
> 状态：分析阶段，待实施

---

## 一、计划概述

### 1.1 目标
基于对当前系统功能、架构、代码质量的全面分析，制定一份分阶段、可落地的改进计划，重点解决功能性缺陷、性能瓶颈、安全隐患和用户体验问题。

### 1.2 核心原则
- **先修 Bug，再优化体验**：优先修复影响数据正确性和系统稳定性的问题
- **最小侵入式改造**：在保持现有业务连续性的前提下逐步改进
- **可验证**：每项改进都应有明确的验收标准和测试覆盖

---

## 二、改进项总览

| 阶段 | 主题 | 优先级 | 预估工时 |
|------|------|--------|----------|
| Phase 1 | 缺陷修复与稳定性 | P0 | 3-4 天 |
| Phase 2 | 安全加固与性能优化 | P1 | 3-4 天 |
| Phase 3 | 功能完善（简历解析闭环） | P1 | 4-5 天 |
| Phase 4 | 工程化与可维护性提升 | P2 | 5-6 天 |
| Phase 5 | 业务增强（批量操作、导出等） | P3 | 7-10 天 |

---

## 三、Phase 1：缺陷修复与稳定性（P0）

### 3.1 修复候选人列表分页数据不一致问题

**问题描述**：
`candidate.service.ts` 中的 `getCandidates` 方法对 `stage` 和 `status` 的过滤是在内存中完成的，但 `total` 和 `totalPages` 仍然使用数据库查询前的原始总数。这会导致前端分页显示空白页或数据条数不匹配。

**改进方案**：
1. 重构查询逻辑，将阶段/状态过滤下沉到 Prisma 查询中
2. 方案 A（推荐）：使用 Prisma 的 `where` 子查询，通过 `stageRecords` 关联表条件直接过滤
3. 方案 B：若 Prisma 子查询复杂度过高，可先查满足 stage/status 条件的 candidateId 列表，再作为 `where.id.in` 的条件进行分页查询

**验收标准**：
- 按"初筛"+"in_progress"筛选时，返回的 `total` 与实际数据条数一致
- 分页切换正常，无空白页
- 集成测试通过

**涉及文件**：
- `server/src/services/candidate.service.ts`
- `server/tests/integration/candidate.test.ts`

---

### 3.2 统一并清理错误处理中间件

**问题描述**：
项目中存在两个错误处理中间件文件：`middleware/error.ts` 和 `middleware/errorHandler.ts`，后者更完善但前者未被删除，存在维护混淆风险。

**改进方案**：
1. 确认 `app.ts` 及所有路由仅引用 `middleware/errorHandler.ts`
2. 将 `error.ts` 中的有用内容（如 `createError`）迁移到 `errorHandler.ts`（如需要）
3. 删除 `server/src/middleware/error.ts`
4. 统一所有控制器的错误响应格式

**验收标准**：
- `error.ts` 文件被删除且不影响任何功能
- 所有接口错误响应格式统一为 `{ success: false, error: string, code: number }`
- 单元测试和集成测试全部通过

**涉及文件**：
- `server/src/middleware/error.ts`（删除）
- `server/src/middleware/errorHandler.ts`
- `server/src/app.ts`
- `server/src/controllers/*.ts`

---

### 3.3 规范化简历解析错误日志

**问题描述**：
`candidate.controller.ts` 的 `parseResume` 方法使用 `fs.appendFileSync` 同步写入错误日志，会阻塞 Node.js 事件循环，且无日志轮转机制。

**改进方案**：
1. 移除 `fs.appendFileSync` 的同步日志写入
2. 改为使用标准的 `console.error` 输出，由 Docker 日志驱动或外部日志系统（如 syslog）收集
3. 若需要持久化，引入轻量级日志库（如 `winston`）并配置日志文件轮转

**验收标准**：
- 简历解析错误不再使用同步文件 IO
- 错误信息仍可在容器日志或应用日志中查询到

**涉及文件**：
- `server/src/controllers/candidate.controller.ts`

---

## 四、Phase 2：安全加固与性能优化（P1）

### 4.1 为关键接口添加速率限制（Rate Limiting）

**问题描述**：
当前系统没有任何接口级别的速率限制，存在被恶意滥用的风险，尤其是 LLM 简历解析接口（调用成本高）和登录接口。

**改进方案**：
1. 引入 `express-rate-limit` 中间件
2. 配置通用限制：每个 IP 15 分钟内最多 100 次请求
3. 为敏感接口配置更严格的限制：
   - `POST /api/auth/login`：5 分钟内最多 10 次
   - `POST /api/candidates/parse-resume`：1 小时内最多 20 次（按用户 ID 限流）
   - `POST /api/upload`：15 分钟内最多 30 次
4. 若部署在 Nginx 后，配置 `trust proxy` 以正确获取客户端 IP

**验收标准**：
- 频繁调用受限接口会收到 `429 Too Many Requests`
- 限流不影响正常用户操作
- 在 Docker 环境中 IP 识别正确

**涉及文件**：
- `server/src/app.ts`
- `server/src/routes/auth.ts`
- `server/src/routes/candidates.ts`
- `server/src/routes/upload.ts`

---

### 4.2 优化 JWT 认证，减少不必要的数据库查询

**问题描述**：
`authenticate` 中间件每次请求都会查询数据库验证用户是否存在，JWT 本身已包含 userId、email、role，这个查询在 99% 场景下是多余的。

**改进方案**：
1. 移除 `authenticate` 中的数据库查询逻辑，直接信任 JWT 解码后的信息
2. 仅在真正需要最新用户状态的敏感操作（如修改权限、删除用户）时做数据库校验
3. 若担心用户被删除后 token 仍有效的问题，可设置较短的 token 过期时间（如 1-2 小时）配合刷新机制（长期规划）

**验收标准**：
- 普通 API 请求不再触发 `prisma.user.findUnique`
- 已登录用户访问各页面功能正常
- 压测显示认证延迟降低

**涉及文件**：
- `server/src/middleware/auth.ts`

---

### 4.3 将文件上传存储从内存改为磁盘

**问题描述**：
Multer 当前使用 `memoryStorage()`，上传文件全部加载到服务器内存，并发上传或异常大文件时存在 OOM 风险。

**改进方案**：
1. 将 multer 配置改为 `diskStorage`，指定上传目录（如 `uploads/temp/`）
2. 确保上传目录在 Docker 中被正确挂载为 volume
3. 在文件处理完成后（如简历解析完成后）清理临时文件，避免磁盘占满
4. 对普通文件上传（如 `/api/upload`）也同步做此改造

**验收标准**：
- 上传 10MB 文件时，服务器内存占用无明显增长
- 简历解析后，临时文件被自动清理
- Docker 部署环境中文件访问正常

**涉及文件**：
- `server/src/routes/candidates.ts`
- `server/src/routes/upload.ts`
- `server/Dockerfile`
- `docker-compose.yml`

---

### 4.4 为富文本输入添加 XSS 防护

**问题描述**：
`Job.description`、`Job.requirements`、`InterviewFeedback.feedbackContent` 等富文本字段没有进行任何 sanitization，存在存储型 XSS 风险。

**改进方案**：
1. 后端：引入 `dompurify` 或 `xss` 库，在写入数据库前对富文本内容进行过滤
2. 前端：Vue 默认会对 `{{ }}` 进行 HTML 转义，但需检查是否存在使用 `v-html` 渲染这些字段的地方，必要时也做前端过滤
3. 对于确实需要保留 HTML 格式的字段，使用白名单标签策略（只允许 `<p>`, `<br>`, `<ul>`, `<li>`, `<strong>` 等安全标签）

**验收标准**：
- 在职位描述中输入 `<script>alert(1)</script>` 后保存，再查看时脚本不会执行
- 正常富文本格式（加粗、换行、列表）保留

**涉及文件**：
- `server/src/services/job.service.ts`
- `server/src/services/candidate.service.ts`
- 前端所有使用 `v-html` 展示富文本的组件

---

## 五、Phase 3：功能完善——简历解析闭环（P1）

### 5.1 在前端候选人表单中增加工作经历编辑区域

**问题描述**：
简历解析功能已经能够提取工作经历，但前端表单 `CandidateForm.vue` 中没有工作经历的展示和编辑入口，导致解析出的工作经历无法被用户确认和修改。

**改进方案**：
1. 在 `CandidateForm.vue` 中新增"工作经历"区块
2. 支持以下操作：
   - 展示已解析/已保存的工作经历列表
   - 添加一条新经历（公司、职位、起止时间、描述）
   - 编辑现有经历
   - 删除某条经历
3. 将工作经历数据作为 `workHistory` 数组随表单一起提交
4. 编辑模式下，从后端获取并展示该候选人的现有工作经历

**验收标准**：
- 新增候选人时，可以手动添加/修改工作经历
- 简历解析结果中的工作经历自动填充到表单，且可编辑
- 编辑候选人时，可以增删改工作经历并保存
- 保存后数据库中工作经历数据正确

**涉及文件**：
- `client/src/views/candidates/CandidateForm.vue`
- `client/src/views/candidates/WorkHistoryList.vue`（如需要新建）
- `server/src/services/candidate.service.ts`（更新逻辑需支持工作经历同步）
- `server/src/controllers/candidate.controller.ts`

---

### 5.2 重构简历解析结果的数据传递方式

**问题描述**：
当前通过 `sessionStorage` 传递解析结果，缺乏类型安全，刷新页面后行为不可预期，且与 Vue 的响应式哲学不符。

**改进方案**：
1. 在 Pinia Store 中新增一个 `resumeParser` store（或扩展现有 store）
2. 将解析结果存储在 store 的 state 中
3. `CandidateForm.vue` 从 store 中读取预填充数据
4. 表单提交成功或取消后，清空 store 中的临时数据
5. 若用户刷新页面导致 store 数据丢失，则放弃预填充（比 sessionStorage 更干净、可预期）

**验收标准**：
- 简历解析后跳转到表单，数据正常填充
- 不依赖 `sessionStorage`
- 提交成功后临时数据被清除

**涉及文件**：
- `client/src/stores/`（新增或修改）
- `client/src/views/candidates/ResumeUpload.vue`
- `client/src/views/candidates/CandidateForm.vue`

---

### 5.3 支持编辑候选人时重新解析并更新工作经历

**问题描述**：
目前简历解析只支持"新增候选人"场景，对于已存在的候选人无法通过上传新简历来更新信息。

**改进方案**：
1. 在候选人详情页或编辑页增加"重新上传简历"按钮
2. 解析后弹出对比/确认窗口，显示新解析的信息与当前数据的差异
3. 用户确认后更新候选人基础信息和工作经历

**验收标准**：
- 编辑模式下支持上传新简历并更新信息
- 用户确认后才写入数据库
- 原有工作经历可以选择覆盖或追加

**涉及文件**：
- `client/src/views/candidates/CandidateDetail.vue`
- `client/src/views/candidates/CandidateForm.vue`
- `server/src/routes/candidates.ts`

---

## 六、Phase 4：工程化与可维护性提升（P2）

### 6.1 提取共享常量配置

**问题描述**：
招聘阶段顺序、枚举值等魔法字符串在前后端多个文件中硬编码，修改成本高。

**改进方案**：
1. 后端：在 `server/src/constants/` 下创建 `stages.ts`，导出 `STAGE_ORDER`、`CANDIDATE_STAGES` 等常量
2. 路由的 Zod schema、service 层、测试用例统一引用该常量文件
3. 前端：在 `client/src/constants/` 下创建对应文件，供组件和 API 层引用
4. 对于性别、学历、来源渠道等枚举也做同样处理

**验收标准**：
- 修改阶段名称只需改动一个文件
- 所有引用处编译通过
- 测试通过

**涉及文件**：
- 新增 `server/src/constants/` 目录
- 新增 `client/src/constants/` 目录
- `server/src/services/candidate.service.ts`
- `server/src/routes/candidates.ts`
- `client/src/views/candidates/*.vue`
- 所有相关测试文件

---

### 6.2 抽象查重逻辑为独立服务/工具函数

**问题描述**：
`createCandidate` 和 `updateCandidate` 中都包含手机号/邮箱查重逻辑，但实现方式不一致，存在代码重复。

**改进方案**：
1. 在 `server/src/services/` 下创建 `duplicate-checker.service.ts`
2. 提供 `checkDuplicate(phone?, email?, excludeId?)` 方法
3. `createCandidate` 和 `updateCandidate` 统一调用该方法
4. 返回结构化的重复信息列表

**验收标准**：
- `createCandidate` 和 `updateCandidate` 中不再包含内联查重逻辑
- 查重功能的行为与改造前完全一致
- 为查重逻辑编写独立单元测试

**涉及文件**：
- 新增 `server/src/services/duplicate-checker.service.ts`
- `server/src/services/candidate.service.ts`

---

### 6.3 为后端接口添加 Swagger/OpenAPI 文档

**问题描述**：
当前 API 文档仅存在于 README 表格中，没有自动生成和交互式测试的能力。

**改进方案**：
1. 引入 `swagger-ui-express` 和 `swagger-jsdoc`
2. 为各路由文件添加 JSDoc 注释，描述接口参数和响应
3. 在 `app.ts` 中挂载 Swagger UI，访问路径为 `/api/docs`
4. 确保 Swagger 文档只在开发环境或非生产环境显示（可通过环境变量控制）

**验收标准**：
- 访问 `/api/docs` 可看到完整的 API 文档
- 所有主要接口（Auth、Jobs、Candidates、Offers、Stats）均有文档
- 文档中包含请求参数、响应示例和错误码说明

**涉及文件**：
- `server/package.json`
- `server/src/app.ts`
- `server/src/routes/*.ts`

---

### 6.4 改进测试策略——使用内存数据库或更稳定的 Mock

**问题描述**：
集成测试当前依赖外部 PostgreSQL，环境缺失时测试失败率高达 27%，无法稳定运行 CI。

**改进方案**：
1. **短期方案**：为集成测试引入 `testcontainers` 或 SQLite（若 Prisma 支持）作为测试数据库
2. **中期方案**：将集成测试改为完全基于 supertest + mock service 的 API 契约测试（已部分实现，但仍有依赖真实数据库的用例）
3. 确保测试数据库在每个测试用例前自动迁移、用例后自动清理
4. 更新 CI 配置（如有），确保测试不依赖外部 PostgreSQL

**验收标准**：
- 运行 `pnpm test` 时不需要手动启动本地 PostgreSQL
- 集成测试通过率稳定在 95% 以上
- 测试执行时间不超过 2 分钟

**涉及文件**：
- `server/tests/utils/setup.ts`
- `server/tests/integration/*.test.ts`
- `server/package.json`
- `server/vitest.config.ts`（如需要）

---

### 6.5 补充前端单元测试

**问题描述**：
前端没有单元测试覆盖，表单逻辑、简历上传、状态管理等核心功能缺乏回归保障。

**改进方案**：
1. 在前端引入 `@vue/test-utils` 和 `vitest`（或 `happy-dom`）
2. 优先为以下逻辑编写测试：
   - `auth store` 的登录/登出/状态恢复
   - `CandidateForm.vue` 的表单验证规则
   - `ResumeUpload.vue` 的文件类型和大小校验
   - 简历解析结果到表单数据的映射逻辑
3. 配置前端测试命令 `pnpm test`（client 目录下）

**验收标准**：
- 前端核心组件和 store 有基础测试覆盖
- 测试可以在无浏览器环境下运行（headless）
- 纳入 CI 流程

**涉及文件**：
- `client/package.json`
- `client/vitest.config.ts`（新增）
- `client/src/stores/auth.ts`
- `client/src/views/candidates/*.vue`

---

## 七、Phase 5：业务增强（P3）

### 7.1 候选人列表增加批量操作

**改进方案**：
1. 候选人列表页支持多选（复选框）
2. 实现批量删除（仅管理员或创建者）
3. 实现批量推进阶段（如批量"初筛通过"）
4. 实现批量关联/取消关联职位

**验收标准**：
- 选中多条记录后可执行批量操作
- 操作结果通过 Toast 提示成功/失败条数
- 刷新列表后状态正确

**涉及文件**：
- `client/src/views/candidates/index.vue`
- `server/src/services/candidate.service.ts`
- `server/src/controllers/candidate.controller.ts`
- `server/src/routes/candidates.ts`

---

### 7.2 增加数据导出功能

**改进方案**：
1. 候选人列表导出 Excel（按当前筛选条件）
2. 职位列表导出 Excel
3. Offer 列表导出 Excel
4. 导出文件命名规范：`模块名_YYYYMMDD.xlsx`

**验收标准**：
- 各列表页均有导出按钮
- 导出内容包含列表当前显示的所有字段
- 大数量导出（如 > 5000 条）不导致服务器超时

**涉及文件**：
- `client/src/views/*/index.vue`
- `server/src/services/*.service.ts`
- `server/src/controllers/*.controller.ts`

---

### 7.3 增强筛选和搜索能力

**改进方案**：
1. 候选人列表增加时间范围筛选（创建时间）
2. 增加按当前公司/职位筛选
3. 增加按技能标签筛选（需先将简历解析出的 skills 持久化到数据库）
4. 职位列表增加按状态、部门、创建人筛选

**验收标准**：
- 各筛选条件可以组合使用
- 筛选后分页数据正确
- 筛选条件可重置

**涉及文件**：
- `client/src/views/candidates/index.vue`
- `client/src/views/jobs/index.vue`
- `server/src/services/candidate.service.ts`
- `server/src/services/job.service.ts`
- `prisma/schema.prisma`（如需增加 skills 字段）

---

## 八、实施路线图

### 8.1 第一周
- [ ] Phase 1.1：修复候选人列表分页 bug
- [ ] Phase 1.2：统一错误处理中间件
- [ ] Phase 1.3：规范化简历解析日志
- [ ] Phase 2.1：添加速率限制

### 8.2 第二周
- [ ] Phase 2.2：优化 JWT 认证
- [ ] Phase 2.3：文件上传改为磁盘存储
- [ ] Phase 2.4：富文本 XSS 防护
- [ ] Phase 3.1：候选人表单增加工作经历编辑

### 8.3 第三周
- [ ] Phase 3.2：重构简历解析数据传递
- [ ] Phase 3.3：支持编辑时重新解析简历
- [ ] Phase 4.1：提取共享常量
- [ ] Phase 4.2：抽象查重逻辑

### 8.4 第四周
- [ ] Phase 4.3：添加 Swagger 文档
- [ ] Phase 4.4：改进集成测试策略
- [ ] Phase 4.5：补充前端单元测试
- [ ] Phase 5.x：根据业务优先级选择 1-2 个增强功能实施

---

## 九、风险与应对

| 风险 | 可能性 | 影响 | 应对措施 |
|------|--------|------|----------|
| 重构分页逻辑引入新的查询 bug | 中 | 高 | 充分编写集成测试，先在测试环境验证 |
| JWT 优化后用户被删除仍可使用系统 | 低 | 中 | 配合短 token 有效期，敏感操作做二次校验 |
| 前端工作经历编辑导致表单复杂度上升 | 中 | 中 | 抽离独立组件，保持表单主结构清晰 |
| 测试数据库改造耗时超预期 | 中 | 中 | 先采用 mock 方案保底，再逐步引入 testcontainers |
| LLM 解析接口限流影响正常高频使用 | 低 | 中 | 按用户 ID 而非 IP 限流，设置合理的白名单机制 |

---

## 十、附录：快速检查清单

在启动每个 Phase 前，确认以下事项：
- [ ] 当前 `main` 分支代码已通过现有测试
- [ ] 已创建功能分支，命名规范：`improve/phaseX-short-desc`
- [ ] 改动的核心文件已通知相关开发者
- [ ] 每项改动都有对应的测试覆盖或手动回归清单
- [ ] 部署到预发布环境后进行了核心流程验证

---

*本计划将根据实际开发进度和反馈动态调整。*
