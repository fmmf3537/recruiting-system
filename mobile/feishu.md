# 飞书 H5 微应用接入教程

> 本教程面向开发者和运维人员，手把手教你将 `mobile/` 移动端接入飞书工作台，实现员工点击应用图标即可免登进入系统。

---

## 一、前置条件

1. 你是某个**飞书企业组织**的管理员，或拥有创建「企业自建应用」的权限。
2. 移动端项目已完成 Phase 1~4 开发，并能在浏览器正常访问。
3. 后端服务已部署且域名可通过外网访问（飞书需要回调你的服务器）。

---

## 二、飞书开放平台配置

### 2.1 创建企业自建应用

1. 用管理员账号登录 [飞书开放平台](https://open.feishu.cn/)
2. 点击右上角 **「开发者后台」**
3. 选择你的企业组织 → 点击 **「创建企业自建应用」**
4. 填写应用名称（如：「招聘管理」），上传图标，点击「确定创建」

### 2.2 开启网页应用能力

进入刚创建的应用 → 点击左侧 **「网页应用」**

1. 打开「启用网页应用」开关
2. 配置以下地址（将 `https://your-domain.com` 替换为你的实际域名）：

   | 字段 | 填写内容 |
   |------|---------|
   | 桌面端首页 | `https://your-domain.com/m/` |
   | 移动端首页 | `https://your-domain.com/m/` |

3. 点击「保存」

### 2.3 获取应用凭证

点击左侧 **「凭证与基础信息」**，记录以下两个值：

- **App ID**（如：`cli_xxxxxxxxxxxx`）
- **App Secret**（点击「查看」复制）

这两个值后续会分别配置到前端 `.env` 和后端环境变量中。

### 2.4 配置安全域名

点击左侧 **「安全设置」**

1. 找到「H5 安全域名」
2. 添加你的域名：
   ```
   https://your-domain.com
   ```
3. 保存

> 如果不配置安全域名，飞书内置浏览器会拦截 JSAPI 调用。

### 2.5 申请权限

点击左侧 **「权限管理」**，搜索并开通以下权限：

- `contact:user.id:readonly` — 获取用户 user_id
- `contact:user.employee_id:readonly` — 获取用户 employee_id（用于匹配本地账号）

申请后一般需要 1~3 分钟自动通过（企业自建应用审批很快）。

### 2.6 发布应用

点击左侧 **「版本管理与发布」**

1. 点击「创建版本」
2. 填写版本号（如 `1.0.0`）和更新说明
3. 点击「保存」→「申请发布」
4. 在企业管理员后台审批通过后，员工即可在**飞书工作台**看到该应用图标

---

## 三、前端配置

### 3.1 配置环境变量

在 `mobile/` 目录下创建/修改 `.env.production`：

```bash
VITE_API_BASE_URL=/api
VITE_FEISHU_APP_ID=cli_xxxxxxxxxxxx
```

> 开发环境可在 `.env` 中配置相同的 `VITE_FEISHU_APP_ID`，方便本地测试。

### 3.2 引入飞书 SDK（生产环境必需）

当前项目由于 `@larksuite/jsapi-sdk` 未发布到公开 npm，我们使用 CDN 方式接入。打开 `mobile/index.html`，在 `<head>` 中加入：

```html
<script src="https://lf1-cdn-tos.bytegoofy.com/goofy/lark/op/h5-js-sdk-1.5.28.js"></script>
```

完整示例：

```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <link rel="icon" type="image/svg+xml" href="/favicon.svg" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>招聘管理</title>
    <script src="https://lf1-cdn-tos.bytegoofy.com/goofy/lark/op/h5-js-sdk-1.5.28.js"></script>
  </head>
  <body>
    <div id="app"></div>
    <script type="module" src="/src/main.ts"></script>
  </body>
</html>
```

### 3.3 前端免登逻辑（已完成）

`mobile/src/views/login/index.vue` 中已集成以下逻辑：

```ts
onMounted(() => {
  if (isFeishu()) {
    tryFeishuLogin();  // 自动获取 authCode 并调后端接口
  }
});
```

你无需修改前端代码，只需确保环境变量中的 `VITE_FEISHU_APP_ID` 正确即可。

---

## 四、后端接口实现

### 4.1 添加环境变量

在 `server/.env` 中增加：

```bash
FEISHU_APP_ID=cli_xxxxxxxxxxxx
FEISHU_APP_SECRET=your-app-secret
```

同时更新 `server/.env.example`，增加上述两项作为模板。

### 4.2 新增飞书登录接口

我们需要在 `server/src/routes/auth.ts` 中新增一个接口：

```ts
router.post('/feishu/login', async (req, res, next) => {
  try {
    const { authCode } = req.body;
    if (!authCode) {
      return res.status(400).json({ success: false, error: '缺少 authCode' });
    }

    // 1. 用 authCode 换取 access_token 和 user_info
    const appAccessTokenRes = await fetch(
      'https://open.feishu.cn/open-apis/auth/v3/app_access_token/internal',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          app_id: process.env.FEISHU_APP_ID,
          app_secret: process.env.FEISHU_APP_SECRET,
        }),
      }
    ).then((r) => r.json());

    if (appAccessTokenRes.code !== 0) {
      return res.status(400).json({
        success: false,
        error: appAccessTokenRes.msg || '获取飞书应用凭证失败',
      });
    }

    const appAccessToken = appAccessTokenRes.app_access_token;

    // 2. 用 authCode 获取用户信息
    const userInfoRes = await fetch(
      'https://open.feishu.cn/open-apis/authen/v1/access_token',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${appAccessToken}`,
        },
        body: JSON.stringify({
          grant_type: 'authorization_code',
          code: authCode,
        }),
      }
    ).then((r) => r.json());

    if (userInfoRes.code !== 0) {
      return res.status(400).json({
        success: false,
        error: userInfoRes.msg || '飞书授权码无效或已过期',
      });
    }

    const feishuEmployeeId = userInfoRes.data.employee_no || userInfoRes.data.employee_id;
    const feishuUserId = userInfoRes.data.user_id;
    const feishuName = userInfoRes.data.name;

    // 3. 匹配本地用户（建议先给 User 表增加 feishuEmployeeId 字段）
    let user = await prisma.user.findFirst({
      where: { feishuEmployeeId },
    });

    if (!user) {
      // 策略 A：自动注册（推荐内部系统）
      user = await prisma.user.create({
        data: {
          email: `${feishuUserId}@feishu.local`,  // 临时邮箱，后续可引导修改
          password: '',  // 空密码，禁止密码登录
          name: feishuName || '飞书用户',
          role: 'member',
          feishuEmployeeId,
        },
      });
      // 策略 B：返回错误，提示联系管理员绑定（更严格）
      // return res.status(404).json({ success: false, error: '账号未绑定，请联系管理员' });
    }

    // 4. 签发 JWT
    const token = jwt.sign(
      { userId: user.id, role: user.role },
      process.env.JWT_SECRET!,
      { expiresIn: process.env.JWT_EXPIRES_IN || '7d' }
    );

    res.json({
      success: true,
      data: {
        token,
        user: {
          id: user.id,
          email: user.email,
          name: user.name,
          role: user.role,
        },
      },
    });
  } catch (error) {
    next(error);
  }
});
```

### 4.3 数据库字段扩展（可选但推荐）

如果你希望用 employee_id 精确匹配，需要给 `User` 表增加一个可选字段：

```prisma
// server/prisma/schema.prisma
model User {
  // ... 现有字段
  feishuEmployeeId String? @unique
}
```

然后执行：

```bash
cd server
npx prisma migrate dev --name add_feishu_employee_id
npx prisma generate
```

> 这是一个完全向后兼容的可选字段，对现有 PC 端零影响。

### 4.4 CORS 配置检查

确保 `server/src/app.ts` 中的 CORS 白名单包含移动端域名：

```ts
app.use(cors({
  origin: [
    'http://localhost:5174',
    'https://your-domain.com',
    'https://your-domain.com/m',
  ],
}));
```

---

## 五、联调测试

### 5.1 本地模拟测试

开发阶段无需真机，用浏览器 DevTools 即可模拟：

1. 打开 `http://localhost:5174/login`
2. F12 → `Ctrl + Shift + M` 进入手机模拟模式
3. 点击右上角 `⋮` → More tools → Network conditions
4. 取消勾选 "Use browser default"
5. 填入飞书 UA：
   ```
   Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Lark/6.0.0
   ```
6. 强制刷新页面（`Ctrl + Shift + R`）

**预期结果**：页面显示「正在尝试飞书免登…」，随后自动登录跳转首页。

### 5.2 真机飞书 App 测试

1. 确保手机能访问你的部署域名（内网穿透或已部署到公网）
2. 在飞书工作台点击应用图标
3. 应直接进入首页，无需输入账号密码
4. 点击职位详情 → 分享，应弹出飞书原生分享面板
5. 点击候选人简历 → 预览，应调用飞书文档阅读器

---

## 六、常见问题

### Q1: 提示"飞书免登失败，请使用账号密码登录"
**原因**：
- `VITE_FEISHU_APP_ID` 未配置或错误
- `index.html` 未引入飞书 SDK CDN
- 后端 `/api/auth/feishu/login` 未实现或返回 404

**解决**：按第 3、4 步检查配置。

### Q2: 飞书内点击分享没反应
**原因**：安全域名未配置，或 `tt.shareAppMessage` 不在安全域名白名单内。

**解决**：在飞书开放平台 → 安全设置 → H5 安全域名中添加你的域名。

### Q3: 飞书内页面底部被系统导航条遮挡
**原因**：移动端未适配安全区。

**解决**：已在本项目中统一使用 `padding-bottom: env(safe-area-inset-bottom)`，一般无需额外处理。若仍有问题，检查具体机型是否需要额外 `padding`。

### Q4: 后端报错"获取飞书应用凭证失败"
**原因**：`FEISHU_APP_ID` 或 `FEISHU_APP_SECRET` 不正确。

**解决**：重新到飞书开放平台 → 凭证与基础信息中核对。

---

## 七、接入检查清单

- [ ] 飞书开放平台已创建企业自建应用
- [ ] 已开启网页应用，并配置移动端首页地址
- [ ] 已添加 H5 安全域名
- [ ] 已申请 `contact:user.id:readonly` 等权限
- [ ] 已记录 App ID 和 App Secret
- [ ] `mobile/.env.production` 已配置 `VITE_FEISHU_APP_ID`
- [ ] `mobile/index.html` 已引入飞书 SDK CDN
- [ ] 后端 `server/.env` 已配置 `FEISHU_APP_ID` 和 `FEISHU_APP_SECRET`
- [ ] 后端已实现 `POST /api/auth/feishu/login`
- [ ] （推荐）已执行 Prisma migration 增加 `feishuEmployeeId` 字段
- [ ] CORS 白名单已包含移动端域名
- [ ] 应用已发布并在飞书工作台可见
- [ ] 真机测试可正常免登进入系统
