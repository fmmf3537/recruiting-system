/**
 * 生产库一次性补数脚本：为存量简历文件回填 UploadRecord 记录
 *
 * 背景：生产库旧历史线从未创建 upload_record 表，而文件鉴权下载（1.1 改造）
 * 强制要求 UploadRecord 存在，否则返回 404。升级前需为存量简历补建记录。
 *
 * 特性：幂等（按 filename 唯一约束跳过已存在记录），可重复执行。
 * 运行方式：docker compose run --rm server npx tsx scripts/backfill-upload-records.ts
 */
import path from 'path';
import fs from 'fs/promises';
import prisma from '../src/lib/prisma';
import { env } from '../src/lib/env';

// 扩展名 → MIME 映射（与 upload-file.ts 白名单一致）
const EXT_TO_MIME: Record<string, string> = {
  '.pdf': 'application/pdf',
  '.doc': 'application/msword',
  '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  '.jpg': 'image/jpeg',
  '.png': 'image/png',
};

async function main(): Promise<void> {
  // 找出所有带简历的候选人
  const candidates = await prisma.candidate.findMany({
    where: { resumeUrl: { not: null } },
    select: { id: true, name: true, resumeUrl: true, createdById: true },
  });
  console.log(`共 ${candidates.length} 位候选人带有简历链接`);

  const uploadDir = path.resolve(process.cwd(), env.UPLOAD_DIR);
  let created = 0;
  let skippedExists = 0;
  let skippedNoFile = 0;
  let skippedBadName = 0;

  for (const candidate of candidates) {
    const filename = path.basename(candidate.resumeUrl!.split('?')[0]);
    const ext = path.extname(filename).toLowerCase();

    // 文件名必须是 UUID + 白名单扩展名，否则下载接口本身就会拒绝，跳过
    if (!EXT_TO_MIME[ext]) {
      console.warn(`[跳过] 候选人 ${candidate.id} 简历扩展名不在白名单: ${filename}`);
      skippedBadName += 1;
      continue;
    }

    // 已存在记录则跳过（幂等）
    const existing = await prisma.uploadRecord.findUnique({ where: { filename } });
    if (existing) {
      skippedExists += 1;
      continue;
    }

    // 物理文件必须存在，否则补记录也无意义
    const filePath = path.join(uploadDir, filename);
    let size: number;
    try {
      size = (await fs.stat(filePath)).size;
    } catch {
      console.warn(`[跳过] 候选人 ${candidate.id} 简历文件不存在: ${filename}`);
      skippedNoFile += 1;
      continue;
    }

    await prisma.uploadRecord.create({
      data: {
        filename,
        originalName: `${candidate.name}-简历${ext}`,
        mimetype: EXT_TO_MIME[ext],
        size,
        uploadedById: candidate.createdById, // 归属候选人负责人，保证其可下载
      },
    });
    created += 1;
  }

  console.log('回填完成：');
  console.log(`  新建记录: ${created}`);
  console.log(`  已存在跳过: ${skippedExists}`);
  console.log(`  文件缺失跳过: ${skippedNoFile}`);
  console.log(`  非法文件名跳过: ${skippedBadName}`);
}

main()
  .catch((error) => {
    console.error('回填脚本执行失败:', error);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
