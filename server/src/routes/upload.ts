import { Router, type Router as RouterType } from 'express';
import multer from 'multer';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';
import fs from 'fs/promises';
import { env } from '../lib/env';
import { authenticate } from '../middleware/auth';
import { asyncHandler, AppError } from '../middleware/errorHandler';

const router: RouterType = Router();

// 确保上传目录存在
const uploadDir = path.resolve(process.cwd(), env.UPLOAD_DIR);
await fs.mkdir(uploadDir, { recursive: true });

// 配置 multer 存储
const storage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    cb(null, uploadDir);
  },
  filename: (_req, file, cb) => {
    // 使用 UUID + 原始扩展名
    const uniqueName = `${uuidv4()}${path.extname(file.originalname)}`;
    cb(null, uniqueName);
  },
});

// 文件过滤
const fileFilter = (
  _req: Express.Request,
  file: Express.Multer.File,
  cb: multer.FileFilterCallback
) => {
  // 允许的文件类型
  const allowedTypes = [
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'image/jpeg',
    'image/png',
  ];

  if (allowedTypes.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error('不支持的文件类型，仅支持 PDF、Word、JPG、PNG'));
  }
};

// 创建 multer 实例
const upload = multer({
  storage,
  fileFilter,
  limits: {
    fileSize: env.MAX_FILE_SIZE, // 最大文件大小
  },
});

/**
 * POST /api/upload
 * 上传单个文件
 */
router.post(
  '/',
  authenticate,
  upload.single('file'),
  asyncHandler(async (req, res) => {
    if (!req.file) {
      throw new AppError('没有上传文件', 400);
    }

    const file = req.file;
    const fileUrl = `/uploads/${file.filename}`;

    res.json({
      success: true,
      message: '文件上传成功',
      data: {
        originalName: file.originalname,
        filename: file.filename,
        mimetype: file.mimetype,
        size: file.size,
        url: fileUrl,
      },
    });
  })
);

/**
 * POST /api/upload/batch
 * 批量上传多个文件
 */
router.post(
  '/batch',
  authenticate,
  upload.array('files', 5), // 最多5个文件
  asyncHandler(async (req, res) => {
    if (!req.files || !Array.isArray(req.files) || req.files.length === 0) {
      throw new AppError('没有上传文件', 400);
    }

    const files = req.files.map((file) => ({
      originalName: file.originalname,
      filename: file.filename,
      mimetype: file.mimetype,
      size: file.size,
      url: `/uploads/${file.filename}`,
    }));

    res.json({
      success: true,
      message: `成功上传 ${files.length} 个文件`,
      data: files,
    });
  })
);

/**
 * DELETE /api/upload/:filename
 * 删除上传的文件
 */
router.delete(
  '/:filename',
  authenticate,
  asyncHandler(async (req, res) => {
    const { filename } = req.params;

    // 安全检查：防止目录遍历攻击
    if (filename.includes('..') || filename.includes('/')) {
      throw new AppError('非法文件名', 400);
    }

    const filePath = path.join(uploadDir, filename);

    // 检查文件是否存在并删除
    try {
      await fs.access(filePath);
    } catch {
      throw new AppError('文件不存在', 404);
    }
    await fs.unlink(filePath);

    res.json({
      success: true,
      message: '文件删除成功',
    });
  })
);

export default router;
