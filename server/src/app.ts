import { randomUUID } from 'node:crypto';

import compression from 'compression';
import cors from 'cors';
import express, { type Application } from 'express';
import rateLimit from 'express-rate-limit';
import helmet from 'helmet';
import pinoHttp from 'pino-http';

import { env } from './lib/env';
import { logger } from './lib/logger';
import { setupSwagger } from './lib/swagger';
import { errorHandler, notFoundHandler } from './middleware/errorHandler';
import routes from './routes';

// 创建 Express 应用
const app: Application = express();

// 安全中间件
app.use(helmet({
  crossOriginResourcePolicy: { policy: 'cross-origin' },
}));

// CORS 配置（支持逗号分隔的多 origin）
const corsOrigins = env.CORS_ORIGIN.split(',').map((s) => s.trim());
app.use(cors({
  origin: corsOrigins,
  credentials: true,
}));

// 请求日志（替代 morgan）：自带 requestId，响应结束时如有 user 则带 userId
app.use(pinoHttp({
  logger,
  genReqId: (req, res) => {
    const existing = req.headers['x-request-id'];
    if (typeof existing === 'string' && existing) {
      return existing;
    }
    const id = randomUUID();
    res.setHeader('X-Request-Id', id);
    return id;
  },
  customProps: (req) => {
    const { userId } = req.user ?? {};
    return userId ? { userId } : {};
  },
}));

// 解析 JSON 请求体
app.use(express.json({ limit: '10mb' }));

// 解析 URL 编码请求体
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// 响应压缩
app.use(compression());

// 部署在 Nginx 反向代理之后：信任第一层代理，
// 使 req.ip 取 X-Forwarded-For 中的真实客户端 IP（限流按真实 IP 聚桶）
app.set('trust proxy', 1);

// 全局限流：15 分钟内最多 1000 次请求
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 1000,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    error: '请求过于频繁，请稍后再试',
  },
});
app.use(limiter);

// 挂载 API 路由（上传文件改走 /api/files/:filename 鉴权下载）
app.use('/api', routes);

// Swagger 文档（仅在非生产环境显示）
if (env.NODE_ENV !== 'production') {
  setupSwagger(app);
}

// 404 处理
app.use(notFoundHandler);

// 全局错误处理
app.use(errorHandler);

export default app;
