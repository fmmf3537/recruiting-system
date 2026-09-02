import { Worker } from 'bullmq';
import fs from 'fs/promises';
import { getBullMQConnection } from '../lib/redis';
import prisma from '../lib/prisma';
import { parseResume } from '../services/resume-parser.service';

// 简历解析 worker
// job.data 形状：
// - 存量预解析流程：{ filePath, mimetype, userId } —— 解析后删除临时文件
// - F5-S 猎头推荐流程：{ filePath, mimetype, userId, candidateId? } —— 文件是正式存储简历，**禁止删除**；
//   解析成功后将空字段回填到候选人（skills / education / workYears / school / currentCompany / currentPosition）
export const resumeParseWorker = new Worker(
  'resume-parse',
  async (job) => {
    const { filePath, mimetype, candidateId } = job.data as {
      filePath: string;
      mimetype: string;
      userId?: string;
      candidateId?: string;
    };

    const buf = await fs.readFile(filePath);
    const result = await parseResume(buf, mimetype);

    // F5-S 模式：候选人入库后回填简历解析结果，**不删除**已落库的简历文件
    if (candidateId) {
      try {
        const existing = await prisma.candidate.findUnique({
          where: { id: candidateId },
          select: {
            skills: true,
            education: true,
            workYears: true,
            school: true,
            currentCompany: true,
            currentPosition: true,
          },
        });
        if (existing) {
          // 仅回填为空的字段，不覆盖已有值（猎头表单字段优先于解析结果）
          const patch: Record<string, unknown> = {};
          const isEmpty = (v: unknown): boolean =>
            v === null || v === undefined || v === '' || (Array.isArray(v) && v.length === 0);
          if (isEmpty(existing.education) && result.education) patch.education = result.education;
          if (isEmpty(existing.school) && result.school) patch.school = result.school;
          if (
            (existing.workYears === null || existing.workYears === undefined)
            && typeof result.workYears === 'number'
          ) {
            patch.workYears = result.workYears;
          }
          if (isEmpty(existing.currentCompany) && result.currentCompany) {
            patch.currentCompany = result.currentCompany;
          }
          if (isEmpty(existing.currentPosition) && result.currentPosition) {
            patch.currentPosition = result.currentPosition;
          }
          if (isEmpty(existing.skills) && Array.isArray(result.skills) && result.skills.length > 0) {
            patch.skills = result.skills;
          }
          if (Object.keys(patch).length > 0) {
            await prisma.candidate.update({ where: { id: candidateId }, data: patch });
          }
        }
      } catch (e) {
        // 容错：解析回填失败不影响解析任务本身的结果返回
        console.error('[resume-parser] candidate 回填失败', candidateId, e);
      }
      return result;
    }

    // 存量预解析流程：解析后删除临时文件（与既有行为保持一致）
    await fs.unlink(filePath).catch((err) => {
      console.error(`删除临时简历文件失败: ${filePath}`, err);
    });
    return result;
  },
  { connection: getBullMQConnection() }
);

resumeParseWorker.on('completed', (job) => {
  console.log(`Resume parse job ${job.id} completed`);
});

resumeParseWorker.on('failed', (job, err) => {
  console.error(`Resume parse job ${job?.id} failed:`, err);
});