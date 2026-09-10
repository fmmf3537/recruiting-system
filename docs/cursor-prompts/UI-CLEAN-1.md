# UI-CLEAN-1：删除死代码布局组件 `client/src/components/layout/`

> 本任务**只有删除操作**，没有任何新增功能。
> 目的：清掉一套从未被线上使用的布局组件，避免后续切片（尤其是 UI-S1-B）再次误改到它。

---

## 1. 背景（已核实，作为执行依据）

- 路由挂载的是 `client/src/layouts/DefaultLayout.vue`（`router/index.ts:41`）
- `client/src/components/layout/` 下 3 个文件（共 187 行）：

| 文件 | 行数 | 引用情况 |
|---|---|---|
| `Sidebar.vue` | 71 | 仅被同目录 `index.vue` 引用 |
| `Navbar.vue` | 73 | 仅被同目录 `index.vue` 引用 |
| `index.vue` | 43 | **`client/src` 内零外部引用** |

- `client/src` 内没有任何模板使用 `<Sidebar>` / `<Navbar>` / `<Breadcrumb>` 全局标签（自动注册插件 `unplugin-vue-components` 会注册它们，但无人使用）
- `client/components.d.ts` 是**自动生成**且已被 `client/.gitignore:41` 忽略的文件，其中含指向上述文件的声明行，删文件后需一并处理（见 §3.2）

---

## 2. 红线

1. **只删下面清单里的文件**，其他任何文件一律不动：
   - `client/src/components/layout/Sidebar.vue`
   - `client/src/components/layout/Navbar.vue`
   - `client/src/components/layout/index.vue`
   - （目录随之为空并被移除）
   - `client/components.d.ts`（gitignored 的自动生成文件，见 §3.2）
2. ❌ **绝对不许动** `client/src/layouts/DefaultLayout.vue`——那是线上真正在用的布局
3. ❌ 不许动 `client/src/router/index.ts`
4. ❌ 不许动 `server/**` `e2e/**` `mobile/**` `client/src/api/**`
5. ❌ 不许新增依赖、不许改 `package.json` / lockfile
6. ❌ 不许跑 `type-check` / `lint` / `test` / `build`（审核方重跑）
7. ❌ 不许 git commit（审核方提交）
8. 编码规范：UTF-8 无 BOM / LF（**本任务基本无新增文件，若有则遵守**）

---

## 3. 执行步骤

### 3.1 删除前先自行复核（**必须真的执行命令，不许照抄本文档结论**）

在项目根目录跑：

```bash
# 1) 确认 client/src 内没有任何地方引用这套组件（排除自身目录）
grep -rn "components/layout" client/src --include=*.ts --include=*.vue | grep -v "^client/src/components/layout/"
# 期望：无输出

# 2) 确认没有模板使用全局标签
grep -rn "<Sidebar\|<Navbar\|<Breadcrumb" client/src --include=*.vue
# 期望：无输出（若步骤 1 已删则此步在删除前执行）

# 3) 确认没有动态/字符串引用
grep -rn "layout/Sidebar\|layout/Navbar" client e2e --include=*.ts --include=*.vue --include=*.js
# 期望：无输出
```

**任何一条有输出 → 停下来报告，不要删。**

### 3.2 删除

```bash
git rm client/src/components/layout/Sidebar.vue client/src/components/layout/Navbar.vue client/src/components/layout/index.vue
```

然后处理自动生成的类型声明：

```bash
rm -f client/components.d.ts
```

> `client/components.d.ts` 已被 gitignore、未入库，是 vite 启动时由 `unplugin-vue-components`（`dts: true`）自动生成的。
> 删掉它会让下次 `pnpm dev` / `pnpm build` **重新生成一份干净的**，避免残留指向已删文件的声明行导致类型报错。
> **不要手改它的内容**，直接删文件。

### 3.3 删除后验证

```bash
# 目录应已不存在
ls client/src/components/layout 2>&1        # 期望：No such file or directory

# 改动范围应只有 3 个删除 + 可能的目录移除
git status --short                           # 期望：3 行 D

# 越界为 0（本任务连 DefaultLayout 都不碰）
git diff --stat -- client/src/layouts client/src/router server e2e mobile client/src/api
# 期望：无输出
```

允许用 `curl -s -o /dev/null -w "%{http_code}" http://localhost:5174/` 确认 dev server 仍返回 200
（**这属于连通性检查，不算跑验收命令**）。若返回非 200，报告出来即可，不要自行修。

---

## 4. 交付报告必须包含

1. §3.1 三条复核命令的**实际输出**（贴原文）
2. 实际删除的文件清单（含行数）
3. `git status --short` 实际输出
4. 越界自检：`git diff --stat -- client/src/layouts client/src/router server e2e mobile client/src/api` 必须为 0 行
5. `client/components.d.ts` 的处理方式（已删除 / 原本就不存在）
6. 回退方式：

```bash
git checkout HEAD -- client/src/components/layout/
```

（若目录已消失，`git checkout` 会一并恢复；`components.d.ts` 无需恢复，下次 vite 启动自动生成）

7. 若发现任何与本文档描述不符的引用 → **立即停止并报告，不要自行折中**

---

## 5. 明确不做的事（留待单独立项）

- 不重构/不迁移 `layouts/DefaultLayout.vue`
- 不改任何页面视觉
- 不处理其他可能的死代码（本次只清这一处）
