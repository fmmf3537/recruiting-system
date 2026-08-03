import path from 'path';
import fs from 'fs/promises';
import { fileTypeFromFile } from 'file-type';
import { v4 as uuidv4 } from 'uuid';
import { AppError } from '../middleware/errorHandler';

/** 允许的上传 MIME → 扩展名白名单 */
export const ALLOWED_UPLOAD_MIMES: Record<string, string> = {
  'application/pdf': '.pdf',
  'application/msword': '.doc',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': '.docx',
  'image/jpeg': '.jpg',
  'image/png': '.png',
};

/**
 * 校验 magic bytes 并重命名为 {uuid}{ext}
 */
export async function validateAndRenameUpload(
  tempPath: string,
  uploadDir: string,
  claimedMime: string
): Promise<{ filename: string; mimetype: string; size: number }> {
  const detected = await fileTypeFromFile(tempPath);
  const mimetype = detected?.mime || claimedMime;
  const ext = detected ? ALLOWED_UPLOAD_MIMES[detected.mime] : ALLOWED_UPLOAD_MIMES[claimedMime];

  if (!ext) {
    await fs.unlink(tempPath).catch(() => undefined);
    throw new AppError('不支持的文件类型，仅支持 PDF、Word、JPG、PNG', 400);
  }

  const filename = `${uuidv4()}${ext}`;
  const targetPath = path.join(uploadDir, filename);
  await fs.rename(tempPath, targetPath);

  const stat = await fs.stat(targetPath);
  return { filename, mimetype, size: stat.size };
}

/** 从 /uploads/xxx 或 /api/files/xxx 提取文件名 */
export function extractFilenameFromUrl(url: string): string {
  const normalized = url.split('?')[0];
  return path.basename(normalized);
}

/** 生成 API 文件访问路径 */
export function buildFileApiPath(filename: string): string {
  return `/api/files/${filename}`;
}
