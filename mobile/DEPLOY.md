# 移动端部署指南

> 本文档说明如何将 mobile/ 构建并部署到生产环境。

---

## 1. 部署方式概览

移动端以 **静态 H5** 形式部署，通过 Nginx 提供 `/m/` 子路径访问：

```
https://your-domain.com/     → PC 端 (client/dist)
https://your-domain.com/m/   → 移动端 (mobile/dist)
https://your-domain.com/api/ → 后端 API (server:3001)
```

---

## 2. 构建步骤

### 2.1 本地构建

```bash
# 进入 mobile 目录
cd recruiting-system/mobile

# 安装依赖
pnpm install

# 生产构建
pnpm build
```

构建产物输出到 `mobile/dist/` 目录。

### 2.2 根目录快捷构建

```bash
cd recruiting-system

# 构建全部（server + client + mobile）
pnpm build

# 仅构建移动端
pnpm build:mobile
```

---

## 3. Nginx 配置

`nginx/nginx.conf` 中已增加移动端路由：

```nginx
# 移动端静态资源
location /m/ {
    alias /usr/share/nginx/html/mobile/;
    try_files $uri $uri/ /m/index.html;
    index index.html;
    add_header Cache-Control "no-cache";

    location ~* \.(js|css|png|jpg|jpeg|gif|ico|svg|woff|woff2|ttf|eot)$ {
        expires 1y;
        add_header Cache-Control "public, immutable";
    }
}
```

> `alias` 末尾的 `/` 必须保留，否则子路径映射会出错。

---

## 4. Docker Compose 部署

### 4.1 开发环境（docker-compose.yml）

```bash
# 1. 构建移动端
docker-compose --profile build run --rm mobile-build

# 2. 启动服务
docker-compose up -d
```

`docker-compose.yml` 中已配置：
- `mobile-build` service：构建 mobile 产物到 `mobile_dist` volume
- `nginx` service：挂载 `mobile_dist` 到 `/usr/share/nginx/html/mobile`

### 4.2 生产环境（docker-compose.prod.yml）

```bash
# 1. 本地预先构建
cd mobile && pnpm build
cd ../client && pnpm build
cd ../server && pnpm build

# 2. 生产部署
cd ..
docker-compose -f docker-compose.prod.yml up -d
```

`docker-compose.prod.yml` 中已配置：
- Nginx 直接挂载 `./mobile/dist`（要求提前本地构建好）

---

## 5. 后端 CORS 检查

确保 `server/src/lib/env.ts` 或 `app.ts` 中的 CORS 白名单包含移动端生产域名：

```ts
// 示例
app.use(cors({
  origin: [
    'https://your-domain.com',
    'https://m.your-domain.com',
  ],
}));
```

---

## 6. 飞书应用配置

### 6.1 创建企业自建应用

1. 登录 [飞书开放平台](https://open.feishu.cn/)
2. 创建「企业自建应用」→「网页应用」
3. 配置移动端首页地址：`https://your-domain.com/m/`
4. 开启相关权限：
   - `contact:user.id:readonly`（获取用户 ID）
   - `auth:user.user:readonly`（获取用户基本信息）

### 6.2 前端配置

在 `mobile/.env.production` 中配置：

```bash
VITE_FEISHU_APP_ID=cli_xxxxxxxx
```

### 6.3 后端配置

在 `server/.env` 中配置飞书应用凭证：

```bash
FEISHU_APP_ID=cli_xxxxxxxx
FEISHU_APP_SECRET=xxxxxxxx
```

后端需实现 `POST /api/auth/feishu/login`：
- 接收前端传来的 `authCode`
- 调用飞书 OpenAPI 换取 `employee_id`
- 匹配本地 `User` 表后签发 JWT

---

## 7. 验证清单

部署完成后，请按以下清单验证：

- [ ] `https://your-domain.com/m/` 能正常打开登录页
- [ ] 登录后能进入首页，底部 TabBar 显示正常
- [ ] `/m/` 子路径刷新不 404（Nginx try_files 生效）
- [ ] 数据看板 `/m/stats` 图表正常渲染
- [ ] 候选人列表下拉刷新、上拉加载正常
- [ ] 飞书 App 内打开应用，分享按钮能弹出原生分享面板
- [ ] 上传简历（5MB+ PDF）不超时

---

## 8. 常见问题

### Q1: 移动端页面刷新后 404
**原因**：Nginx 未正确配置 `try_files`。
**解决**：检查 `nginx.conf` 中 `/m/` 的 `try_files $uri $uri/ /m/index.html;` 是否生效。

### Q2: 飞书 JSAPI 提示"未就绪"
**原因**：`index.html` 未引入飞书 SDK CDN。
**解决**：生产环境在 `index.html` 的 `<head>` 中加入：
```html
<script src="https://lf1-cdn-tos.bytegoofy.com/goofy/lark/op/h5-js-sdk-1.5.28.js"></script>
```

### Q3: 构建产物体积过大
**原因**：ECharts 全量打包。
**解决**：已在 `stats/index.vue` 中按需引入 `echarts/core`、`echarts/renderers`、`echarts/charts`、`echarts/components`，体积可控。
