import rateLimit from 'express-rate-limit';

/** 飞书登录：15 分钟内最多 20 次 */
export const feishuLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    error: '飞书登录尝试过于频繁，请稍后再试',
    code: 429,
  },
});

/** 飞书绑定：15 分钟内最多 10 次 */
export const bindFeishuLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    error: '绑定尝试过于频繁，请稍后再试',
    code: 429,
  },
});
