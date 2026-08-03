import { Router, type Router as RouterType } from 'express';
import { z } from 'zod';
import { asyncHandler } from '../middleware/errorHandler';
import { authenticateFlexible } from '../middleware/auth';
import { validate } from '../middleware/validate';
import {
  assertCanAccessFile,
  getFileAbsolutePath,
} from '../services/file.service';

const router: RouterType = Router();

const filenameSchema = z.object({
  filename: z
    .string()
    .min(1)
    .max(200)
    .regex(/^[a-zA-Z0-9-]+\.[a-zA-Z0-9]+$/, '非法文件名'),
});

/**
 * GET /api/files/:filename
 * 鉴权下载（支持 Authorization 或 ?token= JWT，供飞书预览等场景）
 */
router.get(
  '/:filename',
  validate(filenameSchema, 'params'),
  authenticateFlexible,
  asyncHandler(async (req, res) => {
    const { filename } = req.params;
    await assertCanAccessFile(filename, req.user!);
    const filePath = await getFileAbsolutePath(filename);
    res.sendFile(filePath);
  })
);

export default router;
