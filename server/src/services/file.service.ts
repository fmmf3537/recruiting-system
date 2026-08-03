import path from 'path';
import fs from 'fs/promises';
import prisma from '../lib/prisma';
import { env } from '../lib/env';
import { AppError } from '../middleware/errorHandler';
import type { JwtPayload } from '../middleware/auth';

/**
 * 校验用户是否有权访问文件
 */
export async function assertCanAccessFile(
  filename: string,
  user: JwtPayload
): Promise<void> {
  if (filename.includes('..') || filename.includes('/') || filename.includes('\\')) {
    throw new AppError('非法文件名', 400);
  }

  if (user.role === 'admin') {
    return;
  }

  const record = await prisma.uploadRecord.findUnique({
    where: { filename },
  });

  if (record?.uploadedById === user.userId) {
    return;
  }

  // 关联候选人的简历：仅创建者可访问
  const candidate = await prisma.candidate.findFirst({
    where: {
      OR: [
        { resumeUrl: { endsWith: filename } },
        { resumeUrl: { contains: `/uploads/${filename}` } },
        { resumeUrl: { contains: `/api/files/${filename}` } },
      ],
    },
    select: { createdById: true },
  });

  if (candidate?.createdById === user.userId) {
    return;
  }

  throw new AppError('没有权限访问此文件', 403);
}

export async function getFileAbsolutePath(filename: string): Promise<string> {
  const filePath = path.join(path.resolve(process.cwd(), env.UPLOAD_DIR), filename);
  try {
    await fs.access(filePath);
  } catch {
    throw new AppError('文件不存在', 404);
  }
  return filePath;
}

export async function createUploadRecord(data: {
  filename: string;
  originalName?: string;
  mimetype: string;
  size: number;
  uploadedById: string;
}) {
  return prisma.uploadRecord.create({ data });
}

export async function deleteUploadRecordIfOwner(
  filename: string,
  userId: string,
  isAdmin: boolean
): Promise<void> {
  const record = await prisma.uploadRecord.findUnique({ where: { filename } });
  if (!record) {
    throw new AppError('文件不存在', 404);
  }
  if (!isAdmin && record.uploadedById !== userId) {
    throw new AppError('没有权限删除此文件', 403);
  }
  await prisma.uploadRecord.delete({ where: { filename } });
}
