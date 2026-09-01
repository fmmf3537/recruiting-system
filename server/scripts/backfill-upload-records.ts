// 一次性回填脚本：为历史简历文件补建 UploadRecord
// 背景：下载接口强制校验 UploadRecord 存在，早期上传的文件没有记录导致 404「文件不存在」
// 用法：cd server && npx tsx scripts/backfill-upload-records.ts [--dry-run]
import path from 'node:path';
import fs from 'node:fs/promises';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const dryRun = process.argv.includes('--dry-run');
const uploadDir = path.resolve(process.cwd(), 'uploads');

const EXT_MIME: Record<string, string> = {
  '.pdf': 'application/pdf',
  '.doc': 'application/msword',
  '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
};

// 提取 resumeUrl 中的文件名（仅处理本站 /uploads/ 或 /api/files/ 路径，跳过外链与空值）
function extractFilename(resumeUrl: string | null): string | null {
  if (!resumeUrl) return null;
  const filename = resumeUrl.split('/').pop() ?? '';
  if (!/^[0-9a-f-]{36}\.[a-z0-9]+$/i.test(filename)) return null;
  return filename;
}

const candidates = await prisma.candidate.findMany({
  where: { resumeUrl: { not: null } },
  select: { id: true, name: true, resumeUrl: true, createdById: true },
});

// 兜底上传人：第一个 admin（文件找不到归属候选人时使用）
const admin = await prisma.user.findFirst({ where: { role: 'admin' }, select: { id: true } });
if (!admin) throw new Error('库中没有 admin 用户，无法兜底 uploadedById');

let created = 0;
let skipped = 0;
let missingOnDisk = 0;

for (const c of candidates) {
  const filename = extractFilename(c.resumeUrl);
  if (!filename) {
    skipped += 1;
    continue;
  }

  const existing = await prisma.uploadRecord.findUnique({ where: { filename } });
  if (existing) {
    skipped += 1;
    continue;
  }

  const filePath = path.join(uploadDir, filename);
  let stat;
  try {
    stat = await fs.stat(filePath);
  } catch {
    console.warn(`[跳过] 磁盘文件缺失: ${filename}（候选人 ${c.name}）`);
    missingOnDisk += 1;
    continue;
  }

  const ext = path.extname(filename).toLowerCase();
  const data = {
    filename,
    originalName: `${c.name}的简历${ext}`,
    mimetype: EXT_MIME[ext] ?? 'application/octet-stream',
    size: stat.size,
    uploadedById: c.createdById ?? admin.id,
  };

  if (dryRun) {
    console.log(`[dry-run] 将创建: ${JSON.stringify(data)}`);
  } else {
    await prisma.uploadRecord.create({ data });
    console.log(`[已创建] ${filename} <- 候选人 ${c.name}`);
  }
  created += 1;
}

console.log(`\n完成: 新建 ${created} 条，跳过 ${skipped} 条，磁盘缺失 ${missingOnDisk} 条${dryRun ? '（dry-run 未写入）' : ''}`);
await prisma.$disconnect();
