import { Router, type Router as RouterType } from 'express';
import { z } from 'zod';
import { asyncHandler } from '../middleware/errorHandler';
import { authenticateFlexible } from '../middleware/auth';
import { validate } from '../middleware/validate';
import { env } from '../lib/env';
import {
  assertCanAccessFile,
  getFileAbsolutePath,
  getUploadRecordOrThrow,
  logResumeDownload,
} from '../services/file.service';

const router: RouterType = Router();

// 文件名白名单：上传文件统一以 {uuid}{ext} 命名，仅允许 UUID 格式 + 扩展名白名单，
// 天然杜绝 ../ 等路径遍历字符
const filenameSchema = z.object({
  filename: z
    .string()
    .min(1)
    .max(200)
    .regex(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(pdf|doc|docx|jpg|png)$/i,
      '非法文件名'
    ),
});

/**
 * GET /api/files/:filename
 * 鉴权下载（支持 Authorization 或 ?token= JWT，供飞书预览等场景）
 * - 生产（Nginx）环境：返回 X-Accel-Redirect 由 Nginx 内部跳转直接吐文件
 * - 本地开发（无 Nginx）：由 Express 直接 sendFile
 */
router.get(
  '/:filename',
  validate(filenameSchema, 'params'),
  authenticateFlexible,
  asyncHandler(async (req, res) => {
    const { filename } = req.params;
    // 文件记录必须存在，再校验访问权限
    const record = await getUploadRecordOrThrow(filename);
    await assertCanAccessFile(filename, req.user!);
    // 下载行为写入操作日志（action: resume_download）
    await logResumeDownload(req.user!, record);

    if (env.X_ACCEL_REDIRECT) {
      // Nginx internal location（/internal/uploads/）仅响应 X-Accel-Redirect 内部跳转
      res.setHeader('X-Accel-Redirect', `/internal/uploads/${filename}`);
      res.end();
      return;
    }

    const filePath = await getFileAbsolutePath(filename);
    res.sendFile(filePath);
  })
);

export default router;
