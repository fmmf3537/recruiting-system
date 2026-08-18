import path from 'path';
import fs from 'fs/promises';
import type { UploadRecord } from '@prisma/client';
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

/**
 * 校验文件记录存在（下载前强制校验，防止绕过数据库直接猜测磁盘文件名）
 */
export async function getUploadRecordOrThrow(filename: string): Promise<UploadRecord> {
  const record = await prisma.uploadRecord.findUnique({ where: { filename } });
  if (!record) {
    throw new AppError('文件不存在', 404);
  }
  return record;
}

/**
 * 记录简历/附件下载操作日志（写日志失败不阻断下载，仅打印错误）
 */
export async function logResumeDownload(user: JwtPayload, record: UploadRecord): Promise<void> {
  try {
    await prisma.operationLog.create({
      data: {
        userId: user.userId,
        targetType: 'UploadRecord',
        targetId: record.id,
        action: 'resume_download',
        detail: {
          filename: record.filename,
          originalName: record.originalName,
        },
      },
    });
  } catch (error) {
    console.error('[文件下载日志] 写入 OperationLog 失败:', error);
  }
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
