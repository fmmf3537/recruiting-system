# F3-C-fix1 修订任务（opencode headless）

F3-C 的代码已写完，审核方重跑 `client pnpm lint:check` 发现 ** lint 增量 4 errors / 6 warnings（基线 137e/231w 必须持平）**，全部出自本切片新增/修改的代码。请只修复这 10 处，不做任何其他改动。

## 问题清单与修法

### A. `no-use-before-define` 4 个 error（函数声明位置后移即可，函数体一字不改）

1. `client/src/components/interviews/QuestionOutlineCard.vue` 第 245 行：`focusTypeName` 与 `formatShortDateTime` 在 `versionOptions` computed 中被使用，但它们定义在文件后部的「辅助」区（约 368-389 行）—— 2 个 error。
   **修法**：把 `focusTypeName`、`formatShortDateTime`、`formatDateTime` 三个函数定义整块**移动**到 `versionOptions` computed 之前（例如紧跟 `focusTypeMap` computed 之后），保持「// ============ 辅助 ============」注释随行。只移动，不改实现。
2. `client/src/views/interview/index.vue` 第 275 行：`loadLatestOutline` 在 `openEvaluationDialog` 中调用，定义在其后 —— 1 个 error。
   **修法**：把 `loadLatestOutline` 函数定义**移动**到 `openEvaluationDialog` 之前。
3. `client/src/views/interviews/index.vue` 第 565 行：`loadFocusTypeDict` 在 `handleSchedule` 中调用，定义在其后 —— 1 个 error。
   **修法**：把 `loadFocusTypeDict` 函数定义**移动**到 `handleSchedule` 之前。

### B. `@typescript-eslint/no-explicit-any` 6 个 warning（根源是 API 函数返回类型缺失，补类型后删掉全部 `as any`）

4. `client/src/api/interview.ts`：给 F3-C 新增的三个 API 函数补返回类型（后端实读确认：`POST/GET/PATCH question-outline(s)` 均返回 `{ success: true, data: <版本对象|版本数组> }`，PATCH 另有 message 字段可忽略）：

   ```ts
   export function generateQuestionOutline(
     interviewId: string,
     data: { focusType: string; adjustNote?: string }
   ): Promise<{ success: boolean; data: QuestionOutlineVersion }> {
     return request.post(`/interviews/${interviewId}/question-outline`, data);
   }

   export function getQuestionOutlines(
     interviewId: string
   ): Promise<{ success: boolean; data: QuestionOutlineVersion[] }> {
     return request.get(`/interviews/${interviewId}/question-outlines`);
   }

   export function finalizeQuestionOutline(
     interviewId: string,
     version: number,
     outline: QuestionOutline
   ): Promise<{ success: boolean; data: QuestionOutlineVersion }> {
     return request.patch(`/interviews/${interviewId}/question-outline/${version}`, { outline });
   }
   ```

   （若 `request.post/get/patch` 的泛型签名导致直接 return 类型不匹配，参照本文件既有函数的写法处理，保持最简；目标是调用方不再需要 `as any`。）

5. 删除以下 6 处调用点的 `as any`（类型补齐后它们都是多余的），其余代码不动：
   - `client/src/components/interviews/QuestionOutlineCard.vue`：约 260 行（`getQuestionOutlines(...) as any`）、约 280 行（`getDictionaries(...) as any`）、约 310 行（`generateQuestionOutline(...) as any`）、约 354 行（`finalizeQuestionOutline(...) as any`）
   - `client/src/views/interview/index.vue`：约 282 行（`getQuestionOutlines(...) as any`）
   - `client/src/views/interviews/index.vue`：约 571 行（`getDictionaries(...) as any`）

   注意：`getDictionaries` 本身已有返回类型 `Promise<DictionaryListData>`（含 `success`/`data`），删掉 `as any` 即可，无需改 dictionary.ts。

## 编码红线

- 只做外科式小编辑，禁止整文件重写（防 BOM/行尾污染）。
- 只许碰这 4 个文件：`client/src/api/interview.ts`、`client/src/components/interviews/QuestionOutlineCard.vue`、`client/src/views/interview/index.vue`、`client/src/views/interviews/index.vue`。
- 禁止修改其他任何文件 / git commit / 运行测试套件与 lint（审核方会重跑）。

完成后，最终回复列出：改了哪几个文件、每处改动的 diff 摘要。
