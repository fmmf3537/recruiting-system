# 招聘管理系统 - 移动端

> 基于 Vue 3 + Vant 4 的独立 H5 应用，支持飞书 H5 微应用接入。

---

## 技术栈

- **框架**：Vue 3.5 + TypeScript 5.x + `<script setup>`
- **构建**：Vite 8.x
- **组件库**：Vant 4.x
- **状态管理**：Pinia 2.x
- **路由**：Vue Router 4.x
- **HTTP**：Axios
- **图表**：ECharts 6 + vue-echarts
- **适配**：postcss-px-to-viewport（设计稿 375px）
- **测试**：Vitest + @vue/test-utils + jsdom

---

## 目录结构

```
mobile/
├── src/
│   ├── api/           # API 接口封装
│   ├── assets/        # 静态资源
│   ├── components/    # 公共组件
│   ├── lib/           # axios 封装、飞书 SDK 封装
│   ├── router/        # 路由配置
│   ├── stores/        # Pinia stores
│   ├── views/         # 页面视图
│   ├── main.ts        # 应用入口
│   └── App.vue        # 根组件
├── dist/              # 构建产物
├── index.html
├── package.json
├── vite.config.ts
├── postcss.config.js
└── tsconfig.json
```

---

## 启动命令

```bash
# 安装依赖
cd mobile && pnpm install

# 开发服务（端口 5174）
pnpm dev

# 生产构建（输出到 dist/，base 为 /m/）
pnpm build

# 代码检查与格式化
pnpm lint
pnpm format

# 类型检查
pnpm type-check

# 单元测试
pnpm test:unit
```

---

## 核心模块

| 模块 | 路径 | 说明 |
|------|------|------|
| 登录 | `/login` | 账号密码登录，支持飞书免登降级 |
| 首页 | `/` | 快捷入口 + 今日待办（真实数据） |
| 候选人 | `/candidates` | 列表、详情、创建/编辑、阶段推进、简历上传 |
| 面试 | `/interviews` | 面试列表、反馈填写 |
| Offer | `/offers` | Offer 列表、详情、创建/编辑、状态变更 |
| 职位 | `/jobs` | 职位列表、详情、分享 |
| 数据看板 | `/stats` | KPI 卡片 + 近 7 天新增候选人趋势图 |
| 个人中心 | `/profile` | 用户信息、退出登录 |

---

## 飞书集成

- **环境检测**：`src/lib/feishu.ts` 中 `isFeishu()` 通过 UA 判断
- **免登**：登录页自动检测飞书环境，获取 `authCode` 后调用后端接口
- **分享**：职位详情页优先调用飞书原生分享，降级为 Web Share API / 复制链接
- **文档预览**：简历链接在飞书内调用 `openDocument`
- **标题同步**：路由切换时自动调用 `setNavigationBarTitle`

> 注意：`@larksuite/jsapi-sdk` 未在公开 npm 发布，生产环境需在 `index.html` 中通过 CDN 引入飞书 SDK。

---

## 环境变量

```bash
# .env 示例
VITE_API_BASE_URL=/api
VITE_FEISHU_APP_ID=your_feishu_app_id
```

---

## 兼容性

- iOS Safari 14+
- Android Chrome 90+
- 飞书 App 内置浏览器（iOS/Android）
