# 阶段 4 体验打磨 - 部分完成总结

> **完成时间**：2026-08-31
> **范围**：5 个候选任务中完成 1 个（PROMPT-S1 骨架屏），其余 4 个暂缓
> **决策依据**：按"价值密度"优先做最有用的，单点突破
> **状态**：✅ PROMPT-S1 完成并 commit 到 origin/master

---

## 🎯 阶段范围

审计报告定义的阶段 4 是"持续打磨"，共 5 个候选任务：

```
- 前端骨架屏 / Loading 状态     3 天   ✅ S1 完成
- 暗色模式                   3 天   ⏸️ 暂不写
- 移动端 PWA / 独立 App        10 天  ⏸️ 暂不写
- i18n 国际化                5 天   ⏸️ 暂不写
- 可访问性（a11y）            5 天   ⏸️ 暂不写
```

**为什么只做 S1**：

| 任务 | 价值 | 决策 |
|------|------|------|
| 骨架屏 | 所有页面 UX 受益，立竿见影 | ✅ 做 |
| 暗色模式 | 体验加分，但非痛点 | ⏸️ 暂缓 |
| 移动端 PWA | mobile 项目已独立，新 App 是大工程 | ⏸️ 暂缓 |
| i18n | 国内企业内网一般不需要 | ⏸️ 暂缓 |
| a11y | 合规要求才需要 | ⏸️ 暂缓 |

---

## 📊 PROMPT-S1 完成情况

### 1 个 PROMPT commit 到 origin/master

| Commit | 内容 |
|--------|------|
| `b5c87c3` | docs: 阶段 4 v1.0 设计稿 |
| `429bea9` | feat(client): PROMPT-S1 骨架屏 |

合计 2 个 commit（含 1 个设计稿 + 1 个实战）。

### 累计指标

| 指标 | 数值 |
|------|------|
| 新增 Skeleton 组件 | 3 个（Table / Card / Detail）|
| 改造页面 | 6 个（候选人 / 职位 / Offer / Dashboard / hiring / interview）|
| 新增测试 | 6 个（client 17 passed）|
| 代码增量 | ~290 行（含测试） |
| 涉及范围 | 仅 `client/src/`，**完全不动后端** |

---

## 🎯 实现架构

### Skeleton 组件库

```
client/src/components/Skeleton/
├── TableSkeleton.vue   # 列表骨架屏（头像 + 主副文本行）
├── CardSkeleton.vue    # 卡片骨架屏（4 列统计卡片）
├── DetailSkeleton.vue  # 详情骨架屏（左右两列文本）
└── index.ts            # 统一导出
```

### 使用方式

```vue
<!-- 替换前 -->
<el-card v-loading="loading">
  <el-table v-if="!error" :data="data">...</el-table>
</el-card>

<!-- 替换后 -->
<el-card>
  <TableSkeleton v-if="loading" :row-count="10" />
  <el-table v-else :data="data">...</el-table>
</el-card>
```

### 6 个改造页面

| 页面 | 骨架屏组件 | rowCount |
|------|------------|----------|
| 候选人列表 | TableSkeleton | 10 |
| 职位列表 | TableSkeleton | 6 |
| Offer 列表 | TableSkeleton | 8 |
| Dashboard 近期动态 | CardSkeleton | - |
| 招聘工作台（总览） | CardSkeleton | - |
| 招聘工作台（其他 Tab） | TableSkeleton | 5 |
| 面试官工作台（3 Tab） | TableSkeleton | 5 |

---

## 🏆 工程亮点

### 1. v-loading 下沉到表格层级
v-loading 原本在 el-card 上（loading 时半透明遮罩），会挡住内部骨架屏。
Cursor 主动下沉到 el-table 层级，与骨架屏平级，互不干扰。

### 2. 首屏判断用 `!overview.scope` 而非 `!overview.openJobs`
- 我 prompt 写的 `!overview.openJobs`：openJobs=0 是有效数据（库真的没数据），骨架屏会永远不消失
- Cursor 改成 `!overview.scope`（未加载过）：更准确

### 3. CardSkeleton 用 `rect` variant 不用 `card`
- 我 prompt 写的 `variant="card"`：Element Plus **不支持**
- Cursor 查 EP 文档，改用 `rect` + 样式模拟卡片

### 4. DetailSkeleton 建好但未挂载
- 我 prompt 要求建 3 种骨架屏（Table / Card / Detail）
- 但 6 个改造页面都是列表 / Dashboard / 工作台，**不是详情页**
- Cursor 没硬塞 DetailSkeleton 到任何页面，而是保留组件供未来用

---

## 🧪 实机验证

用浏览器延迟请求核对：

| 页面 | 骨架显示 | 数据到达后切换 |
|------|---------|---------------|
| 候选人列表 | 10 行表格骨架 | 真实表格 |
| 职位列表 | 6 行表格骨架 | 真实表格 |
| Offer 列表 | 8 行表格骨架 | 真实表格 |
| Dashboard 近期动态 | 卡片骨架 | 真实列表 |
| 招聘工作台 | 卡片 / 表格混合 | 真实数据 |
| 面试官工作台 | 3 Tab 表格骨架 | 真实数据 |

数据到达后骨架屏**无闪烁消失**。

---

## 📋 验收清单

### PROMPT-S1 骨架屏
- ✅ `pnpm test` 17 passed（含新增 6 个 client 测试）
- ✅ 后端 420 个测试未受影响（无后端改动）
- ✅ 候选人 / 职位 / Offer 列表 loading 显示表格骨架屏
- ✅ Dashboard loading 显示卡片骨架屏
- ✅ 工作台各 Tab loading 显示对应骨架屏
- ✅ 数据到达后骨架屏消失（无闪烁）
- ✅ 错误仍走原来的 el-empty / 结果页（骨架屏只在 loading 时显示）
- ✅ 浏览器手动验证 6 个页面 loading 体验

---

## 🔍 遗留与已知问题

### 暂不做的 4 个任务（按需启动）

| 任务 | 启动条件 | 估时 |
|------|---------|------|
| 暗色模式 | 用户反馈"长时间使用眼睛累" | 3 天 |
| 移动端 PWA / App | mobile 端体验需要大改 | 10 天 |
| i18n 国际化 | 服务跨国客户 / 多语言团队 | 5 天 |
| 可访问性 a11y | 合规要求 / 政府项目 | 5 天 |

### 设计权衡（不修复）

1. **DetailSkeleton 建好但未挂载**：6 页都不是详情页，硬塞不合理
2. **v-loading 与骨架屏共存**：v-loading 作为兜底，避免骨架屏组件 bug 时完全无反馈
3. **首屏判断不用数据长度**：用 `!overview.scope` 这种"是否加载过"的标志

---

## 🎓 团队上手指南

### Dev 环境验证骨架屏

```bash
# 1. 启动 dev
cd server && pnpm dev  # 后端
cd client && pnpm dev  # 前端（端口 5174）
# 浏览器打开 http://localhost:5174

# 2. 切换各页面观察 loading 行为
- /candidates  → 候选人列表 10 行骨架
- /jobs        → 职位列表 6 行骨架
- /offers      → Offer 列表 8 行骨架
- /dashboard   → Dashboard 卡片骨架
- /hiring      → 招聘工作台各 Tab
- /interview   → 面试官工作台各 Tab

# 3. 浏览器 Network 面板 throttle 到 Slow 3G 观察骨架
```

### 添加新页面的骨架屏

```vue
<template>
  <el-card>
    <TableSkeleton v-if="loading" :row-count="10" />
    <el-table v-else :data="list">...</el-table>
  </el-card>
</template>

<script setup>
import { TableSkeleton } from '@/components/Skeleton';
// ...
</script>
```

### 自定义骨架屏

如需新的骨架屏类型（如表单骨架屏），按现有 `Skeleton/*.vue` 模式新增：
- 接收 props（行数 / 列数等）
- 用 `el-skeleton` + `el-skeleton-item` 组合
- 在 `index.ts` 导出

---

## 📝 设计参考文档

| 文档 | 用途 |
|------|------|
| `VIBE_CODING_PROMPTS_PHASE4_v1.0.md` | PROMPT-S1 设计稿（自包含可直接粘贴） |
| `AUDIT_REPORT.md` | 阶段 4 候选任务定义 |
| `PHASE3_SUMMARY.md` | 阶段 3 完成总结（参考格式）|

---

## 🎉 阶段 4 总结

阶段 4 是"持续打磨"，按价值密度优先做最有用的：

```
✅ PROMPT-S1 骨架屏         立竿见影的 UX 改善
⏸️ 暗色模式 / PWA / i18n / a11y   等真正需要时再做
```

**17 个 client 测试通过**，**6 个页面 UX 升级**，**零后端改动**。

### 阶段 0 + 1 + 2 + 3 + 4 总成绩

| 阶段 | 完成度 | 关键产出 |
|------|--------|---------|
| 0 | 6/6 PROMPT | 6 个紧急修复（顶层 await / pino / JWT 缓存 / 拆分 / enum / Zod max） |
| 1 | 6/6 PROMPT | 可观测性（OTel / Prometheus / Sentry / 健康检查 / 索引 / CI）|
| 2 | 2/8 PROMPT | 软删除 + RBAC（其余 6 个用户决定不做）|
| 3 | 5/5 PROMPT | 4 角色权限矩阵 + 2 工作台 + 2 cron + 数据迁移 |
| 4 | 1/5 任务 | 骨架屏（其余 4 个按需启动）|

**总计**：24 个生产 PROMPT commit + 5 个文档 commit = 29 个 commit。

**420 后端测试 + 17 前端测试 = 437 个测试通过**。

**这就是这个项目当前的全貌。**
