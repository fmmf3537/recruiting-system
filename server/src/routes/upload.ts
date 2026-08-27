import { Router, type Router as RouterType } from 'express';
import multer from 'multer';
import rateLimit from 'express-rate-limit';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';
import { mkdirSync } from 'fs';
import fs from 'fs/promises';
import { env } from '../lib/env';
import { authenticate } from '../middleware/auth';
import { asyncHandler, AppError } from '../middleware/errorHandler';
import { validateAndRenameUpload, buildFileApiPath } from '../utils/upload-file';
import { createUploadRecord, deleteUploadRecordIfOwner } from '../services/file.service';

const router: RouterType = Router();

const uploadLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    error: '上传次数过于频繁，请稍后再试',
    code: 429,
  },
});

const uploadDir = path.resolve(process.cwd(), env.UPLOAD_DIR);

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    try {
      mkdirSync(uploadDir, { recursive: true });
      cb(null, uploadDir);
    } catch (err) {
      cb(err as Error);
    }
  },
  filename: (_req, _file, cb) => {
    // 临时文件名，后续按 magic bytes 重命名
    cb(null, `${uuidv4()}.tmp`);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: env.MAX_FILE_SIZE },
});

async function processUploadedFile(
  file: Express.Multer.File,
  userId: string
) {
  const { filename, mimetype, size } = await validateAndRenameUpload(
    file.path,
    uploadDir,
    file.mimetype
  );

  await createUploadRecord({
    filename,
    originalName: file.originalname,
    mimetype,
    size,
    uploadedById: userId,
  });

  return {
    originalName: file.originalname,
    filename,
    mimetype,
    size,
    url: buildFileApiPath(filename),
  };
}

router.post(
  '/',
  authenticate,
  uploadLimiter,
  upload.single('file'),
  asyncHandler(async (req, res) => {
    if (!req.file) {
      throw new AppError('没有上传文件', 400);
    }

    const data = await processUploadedFile(req.file, req.user!.userId);

    res.json({
      success: true,
      message: '文件上传成功',
      data,
    });
  })
);

router.post(
  '/batch',
  authenticate,
  uploadLimiter,
  upload.array('files', 5),
  asyncHandler(async (req, res) => {
    if (!req.files || !Array.isArray(req.files) || req.files.length === 0) {
      throw new AppError('没有上传文件', 400);
    }

    const files = await Promise.all(
      req.files.map((file) => processUploadedFile(file, req.user!.userId))
    );

    res.json({
      success: true,
      message: `成功上传 ${files.length} 个文件`,
      data: files,
    });
  })
);

router.delete(
  '/:filename',
  authenticate,
  asyncHandler(async (req, res) => {
    const { filename } = req.params;

    if (filename.includes('..') || filename.includes('/')) {
      throw new AppError('非法文件名', 400);
    }

    await deleteUploadRecordIfOwner(
      filename,
      req.user!.userId,
      req.user!.role === 'admin'
    );

    const filePath = path.join(uploadDir, filename);
    await fs.unlink(filePath).catch(() => undefined);

    res.json({
      success: true,
      message: '文件删除成功',
    });
  })
);

export default router;
