import { Router, type Router as RouterType } from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { v4 as uuidv4 } from 'uuid';
import { z } from 'zod';
import { referralController } from '../controllers/referral.controller';
import { asyncHandler, AppError } from '../middleware/errorHandler';
import { referralLimiter, referralPageLimiter } from '../middleware/rate-limit';
import { env } from '../lib/env';

const router: RouterType = Router();

// ===== Multer：临时上传（UUID.tmp）—— 与 routes/upload.ts 范式一致 =====
const uploadDir = path.resolve(process.cwd(), env.UPLOAD_DIR);
const storage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    try {
      fs.mkdirSync(uploadDir, { recursive: true });
      cb(null, uploadDir);
    } catch (err) {
      cb(err as Error, '');
    }
  },
  filename: (_req, _file, cb) => {
    // 临时文件名，后续由 validateAndRenameUpload 按 magic bytes 重命名
    cb(null, `${uuidv4()}.tmp`);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: env.MAX_FILE_SIZE },
});

// ===== zod 校验 schema =====

// 32 位 hex token（与 assertLinkUsable 内部正则对齐）
const tokenParamSchema = z.object({
  token: z.string().regex(/^[a-f0-9]{32}$/i, '链接 token 格式不正确'),
});

// 提交表单字段
// multer 表单里 consent 字段是字符串 'true'/'false'，用 preprocess 归一化为布尔再 literal 校验
const submitBodySchema = z.object({
  name: z.string().trim().min(2, '姓名至少 2 字').max(30, '姓名不超过 30 字'),
  phone: z.string().regex(/^1[3-9]\d{9}$/, '手机号格式不正确'),
  email: z
    .string()
    .trim()
    .email('邮箱格式不正确')
    .max(100)
    .optional()
    .or(z.literal('').transform(() => undefined)),
  reason: z.string().max(1000, '推荐理由不超过 1000 字').optional(),
  consent: z.preprocess((v) => {
    if (v === 'true' || v === true) return true;
    if (v === 'false' || v === false) return false;
    return v;
  }, z.literal(true, { errorMap: () => ({ message: '请确认已获得候选人授权' }) })),
});

// ===== 路由注册 =====
// GET：独立限流器（15min/60），不走 authenticate
router.get(
  '/:token',
  referralPageLimiter,
  asyncHandler(async (req, _res, next) => {
    // 参数校验失败也走 410，避免暴露格式细节（§3.3-2 探测定向一致）
    const parsed = tokenParamSchema.safeParse(req.params);
    if (!parsed.success) {
      next(new AppError('链接已失效', 410));
      return;
    }
    next();
  }),
  referralController.getInfo
);

// POST：限流（15min/10）+ multer 单文件字段 `file` + body 校验
router.post(
  '/:token',
  referralLimiter,
  asyncHandler(async (req, _res, next) => {
    const parsed = tokenParamSchema.safeParse(req.params);
    if (!parsed.success) {
      next(new AppError('链接已失效', 410));
      return;
    }
    next();
  }),
  upload.single('file'),
  asyncHandler(async (req, _res, next) => {
    const parsed = submitBodySchema.safeParse(req.body);
    if (!parsed.success) {
      // 解析第一条错误信息；保持 400 + 文案
      const firstMsg = parsed.error.errors[0]?.message || '提交参数不合法';
      next(new AppError(firstMsg, 400));
      return;
    }
    req.body = parsed.data;
    next();
  }),
  referralController.submit
);

export default router;