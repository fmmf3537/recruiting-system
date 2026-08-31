# 阶段 4 体验打磨提示词集（v1.0 - 自包含可直接粘贴版）

> **使用方式**：打开 Cursor Composer 新会话，从上到下按顺序复制粘贴。每个 prompt 都是自包含的，**复制下面 ```markdown ... ``` 代码块里的全部内容**粘贴即可。
> **基于**：阶段 0/1/2/3 全部实战反馈 + 阶段 4 审计
> **范围**：1 个 prompt（PROMPT-S1 前端骨架屏 / Loading 状态）
> **风格**：自包含可直接粘贴 + v1.1 元规则 + 实施备注模板

---

# 第 1 个：PROMPT-S1 前端骨架屏 / Loading 状态（3 天）

复制下面 ```markdown 到下一个 ``` 之间的全部内容粘贴到 Cursor：

```markdown
# 任务：前端骨架屏 / Loading 状态

## Context
- 项目前端：Vue 3 + TypeScript + Element Plus + Pinia
- 已有 loading 实现：每个页面用 `loading.value` + `v-loading="loading"`
- 问题：loading 期间页面是空白，用户体验差
- 目标：用骨架屏（skeleton）替代 loading 占位，让用户感觉"快"

## 设计原则
1. **不破坏现有功能**：骨架屏只在 loading 时显示，数据到了就消失
2. **Element Plus 优先**：用 el-skeleton / el-skeleton-item，少造轮子
3. **3 种粒度**：列表骨架屏 / 卡片骨架屏 / 详情骨架屏
4. **状态从 loading 派生**：不引入额外 state，复用现有的 `loading.value`
5. **错误不显示骨架屏**：错误仍走 `el-empty` + 错误提示

## Phase 1：通用骨架屏组件

**新建** `client/src/components/Skeleton/TableSkeleton.vue`：

```vue
<template>
  <el-skeleton :rows="rows" :animated="true" v-bind="$attrs">
    <template #template>
      <el-skeleton-item variant="text" style="width: 50%" />
      <el-skeleton-item variant="text" style="width: 60%; margin-bottom: 16px" />
      <el-skeleton-item v-for="i in rowCount" :key="i" variant="h3" style="margin-bottom: 12px">
        <div style="display: flex; gap: 12px; align-items: center;">
          <el-skeleton-item variant="circle" style="width: 32px; height: 32px" />
          <div style="flex: 1;">
            <el-skeleton-item variant="text" style="width: 40%; margin-bottom: 8px" />
            <el-skeleton-item variant="text" style="width: 70%" />
          </div>
        </div>
      </el-skeleton-item>
    </template>
  </el-skeleton>
</template>

<script setup lang="ts">
withDefaults(defineProps<{
  rowCount?: number;
  rows?: number;
}>(), {
  rowCount: 5,
  rows: 6,
});
</script>
```

**新建** `client/src/components/Skeleton/CardSkeleton.vue`：

```vue
<template>
  <div class="card-skeleton">
    <el-skeleton :rows="3" :animated="true" v-bind="$attrs">
      <template #template>
        <el-skeleton-item variant="h1" style="width: 30%; margin-bottom: 16px" />
        <div style="display: grid; grid-template-columns: repeat(4, 1fr); gap: 16px;">
          <el-skeleton-item v-for="i in 4" :key="i" variant="card" style="height: 80px" />
        </div>
        <el-skeleton-item variant="text" style="margin-top: 16px" />
        <el-skeleton-item variant="text" style="width: 80%; margin-bottom: 16px" />
      </template>
    </el-skeleton>
  </div>
</template>
```

**新建** `client/src/components/Skeleton/DetailSkeleton.vue`：

```vue
<template>
  <el-skeleton :rows="8" :animated="true" v-bind="$attrs">
    <template #template>
      <el-skeleton-item variant="h1" style="width: 50%; margin-bottom: 16px" />
      <el-skeleton-item variant="text" style="width: 60%; margin-bottom: 24px" />
      <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 16px;">
        <el-skeleton-item v-for="i in 8" :key="i" variant="text" style="width: 100%" />
      </div>
      <el-skeleton-item variant="text" style="margin-top: 24px; width: 40%" />
      <el-skeleton-item variant="text" style="width: 90%" />
    </template>
  </el-skeleton>
</template>
```

**新建** `client/src/components/Skeleton/index.ts`（统一导出）：

```ts
export { default as TableSkeleton } from './TableSkeleton.vue';
export { default as CardSkeleton } from './CardSkeleton.vue';
export { default as DetailSkeleton } from './DetailSkeleton.vue';
```

## Phase 2：6 个关键页面改造

### 1. 候选人列表（client/src/views/candidates/index.vue）

找到 loading 部分，**替换为**：

```vue
<!-- 替换前 -->
<el-card v-if="!error" class="table-card" shadow="never" v-loading="loading">

<!-- 替换后 -->
<el-card v-if="!error" class="table-card" shadow="never">
  <TableSkeleton v-if="loading" :row-count="10" />
  <el-table v-else :data="candidateList" ...>
    <!-- 现有 table 列 -->
  </el-table>
</el-card>
```

并在 `<script setup>` 顶部 import：

```ts
import { TableSkeleton } from '@/components/Skeleton';
```

### 2. 职位列表（client/src/views/jobs/index.vue）

同样替换：用 `TableSkeleton :row-count="6"` 替代 loading 期间的空表格。

### 3. Offer 列表（client/src/views/offers/index.vue）

同样：`TableSkeleton :row-count="8"`。

### 4. Dashboard（client/src/views/dashboard/index.vue）

Dashboard 有统计卡片 + 漏斗图 + 近期活动，loading 用 `CardSkeleton`：

```vue
<el-card v-loading="activityLoading">
  <CardSkeleton v-if="activityLoading && recentActivities.length === 0" />
  <div v-else class="activity-list">
    <!-- 现有列表 -->
  </div>
</el-card>
```

### 5. 业务工作台（client/src/views/hiring/index.vue）

```vue
<el-tabs v-model="activeTab">
  <el-tab-pane label="总览" name="overview">
    <div v-if="overviewLoading && !overview.openJobs">
      <CardSkeleton :row-count="3" />
    </div>
    <el-row v-else>...</el-row>
  </el-tab-pane>
  <el-tab-pane label="待审批" name="approvals">
    <TableSkeleton v-if="approvalsLoading" :row-count="5" />
    <el-table v-else :data="approvals">...</el-table>
  </el-tab-pane>
  <!-- 其他 Tab 类似 -->
</el-tabs>
```

### 6. 面试官工作台（client/src/views/interview/index.vue）

```vue
<el-tab-pane label="今日面试" name="today">
  <TableSkeleton v-if="todayLoading" :row-count="5" />
  <el-table v-else :data="todayInterviews">...</el-table>
</el-tab-pane>
```

## Phase 3：测试

**新建** `client/tests/components/Skeleton.test.ts`：

```ts
import { mount } from '@vue/test-utils';
import { describe, it, expect } from 'vitest';
import TableSkeleton from '@/components/Skeleton/TableSkeleton.vue';
import CardSkeleton from '@/components/Skeleton/CardSkeleton.vue';

describe('Skeleton 组件', () => {
  it('TableSkeleton 默认渲染 5 行', () => {
    const wrapper = mount(TableSkeleton);
    expect(wrapper.findAll('.el-skeleton-item').length).toBeGreaterThan(0);
  });

  it('TableSkeleton 接受 rowCount prop', () => {
    const wrapper = mount(TableSkeleton, { props: { rowCount: 10 } });
    expect(wrapper.exists()).toBe(true);
  });

  it('CardSkeleton 渲染统计卡片占位', () => {
    const wrapper = mount(CardSkeleton);
    expect(wrapper.findAll('.el-skeleton-item').length).toBeGreaterThan(4);
  });
});
```

## 禁止事项

- ❌ 不改后端任何代码
- ❌ 不改业务逻辑（loading → data 的判断逻辑保持不变）
- ❌ 不改路由 / store / api
- ❌ 不引入新 UI 库（用 Element Plus）
- ❌ 不重写已有页面（仅替换 loading 部分）
- ❌ 不删除 `v-loading` 指令（保留作为 fallback）
- ❌ 不在骨架屏中加业务逻辑
- ❌ 不动 mobile 端

## 必须新增的测试

文件 1：`client/tests/components/Skeleton.test.ts`（3 用例）
- TableSkeleton 默认渲染
- TableSkeleton 接受 rowCount prop
- CardSkeleton 渲染多卡片

文件 2：`client/tests/components/skeleton-integration.test.ts`（3 用例）
- 模拟 loading=true 时骨架屏可见
- 数据到达后骨架屏消失
- 错误时仍显示 el-empty（不显示骨架屏）

## 完成后请按这个格式输出实施备注

```
## 实施备注

- 实际改动：[3 新 Skeleton 组件 + 1 index.ts + 6 页面替换 + 2 测试]
- 推荐方案预估：[3 新组件 + 6 页面替换 + 2 测试]
- 偏差原因：[无 / 解释]
- 是否属于"标准做法的合理膨胀"：[是 / 否]
- 禁止事项勾选：
  - [✅/❌] 不改后端
  - [✅/❌] 不改业务逻辑
  - [✅/❌] 不改路由 / store / api
  - [✅/❌] 不引入新 UI 库
  - [✅/❌] 不重写已有页面
  - [✅/❌] 不删除 v-loading 指令
  - [✅/❌] 不动 mobile 端
```

## 验收条件

1. ✅ `pnpm test` 全部通过（420 + 6 ≈ 426）
2. ✅ 候选人 / 职位 / Offer 列表 loading 时显示表格骨架屏
3. ✅ Dashboard loading 时显示卡片骨架屏
4. ✅ 工作台各 Tab loading 时显示对应骨架屏
5. ✅ 数据到达后骨架屏消失（切换流畅）
6. ✅ 浏览器手动测试 6 个页面 loading 体验

## 回滚预案

```bash
git revert HEAD
# 骨架屏是纯前端，revert 不影响后端
```
```

---

## 📊 阶段 4 进度

- ✅ PROMPT-S1 v1.0 已写
- ⏳ PROMPT-S2~S5（暗色模式 / 移动端 PWA / i18n / a11y）暂不写

## 🎯 下一步

你实战 S1（骨架屏）后告诉我反馈。
