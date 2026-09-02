# F2-S-fix1 修订任务（opencode headless）

F2-S 的代码已写完，审核重跑测试发现 **4 个失败用例**（445 中 441 过 4 挂），请只修复这 4 处，不做任何其他改动：

1. **`server/tests/integration/match-score.test.ts`**：测试里用的假 ID（`'cand-1'`、`'cand-2'` 等）不是合法 cuid，路由的 `candidateIdParamSchema`（`z.string().max(50).cuid()`）直接 400 拦截，导致「无 token 401」「POST 正常路径 200」两个用例挂掉。修法：把该文件里所有候选人/职位假 ID 换成合法 cuid 格式字符串（`c` 开头 + 24 位小写字母数字，共 25 字符，例如 `clf2stest000000000000000a`），并保持同一用例内 ID 与 mock 数据一致。

2. **同文件「无 token 时 /api/candidates/:id/match-scores 应返回 401」**：断言写成了 `expect([200, 401]).toContain(res.status)`，语义错误。路由上 `authenticate` 注册在 `validate` 之前，无 token 必然 401。修法：改为 `expect(res.status).toBe(401)`。

3. **同文件「interviewer 应被 requireMatrixPermission 拦截（403）」**：断言自相矛盾（`expect(res.status).toBe(500)` 却期望权限错误消息）。`requireMatrixPermission` 中间件对无权限角色抛 `AppError('没有权限：ai:match-score', 403)`（见 `server/src/middleware/role.ts` 56-69 行）。修法：断言改为 `expect(res.status).toBe(403)` 且 `expect(res.body.error).toBe('没有权限：ai:match-score')`（若实际响应字段是 `message` 而非 `error`，以 errorHandler 的实际输出字段为准，先读 `server/src/middleware/errorHandler.ts` 确认）。

4. **hash 去重单测**（`server/tests/unit/match-score.service.test.ts` 约 281-315 行）：测试给 existing 记录硬编了 `resumeHash: 'computed-hash'`，但 service 内部用真实 sha256 现算比对，永远不匹配，于是走到 LLM 路径抛「AI 打分失败」。修法两步：
   - `server/src/services/match-score.service.ts`：把 `computeResumeHash`、`computeJdHash` 两个纯函数改为 export（加中文注释「导出仅供测试复用同一算法」），其余逻辑一行不动。
   - 单测文件：import 这两个函数，用**测试内同一份 mock candidate/job 数据**现算 hash 来构造 existing 记录（不再硬编字符串），断言不变。

**编码红线**：只做外科式小编辑，禁止整文件重写（防 BOM/行尾污染）。
**禁止**：修改上述 2 个文件以外的任何文件 / git commit / 运行测试套件（审核方会重跑）。

完成后，最终回复列出：改了哪几个文件、每处改动的 diff 摘要、以及第 3 条中 errorHandler 实际错误字段的确认结果。
