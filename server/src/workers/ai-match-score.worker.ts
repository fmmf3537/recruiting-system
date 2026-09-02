import { Worker } from 'bullmq';

import { getBullMQConnection } from '../lib/redis';
import { scoreCandidateForJob } from '../services/match-score.service';

/**
 * 简历自动打分 worker（F2-S）：
 * 监听 ai-match-score 队列；调用 scoreCandidateForJob 写库。
 * 失败仅 console.error + OperationLog，绝不抛出影响其他任务（打分失败不阻塞主流程）。
 */
export const aiMatchScoreWorker = new Worker(
  'ai-match-score',
  async (job) => {
    const { candidateId, jobId, userId } = job.data as {
      candidateId: string;
      jobId: string;
      userId?: string;
    };
    if (!candidateId || !jobId) {
      throw new Error('ai-match-score job 缺少 candidateId/jobId');
    }
    const result = await scoreCandidateForJob(candidateId, jobId, {
      triggeredBy: 'auto',
      createdById: userId,
    });
    return { id: result.id, overallScore: result.overallScore, grade: result.grade };
  },
  { connection: getBullMQConnection() },
);

aiMatchScoreWorker.on('completed', (job) => {
  if (process.env.NODE_ENV !== 'production') {
    console.log(`[ai-match-score] job ${job.id} completed`);
  }
});

aiMatchScoreWorker.on('failed', (job, err) => {
  // 不再抛：确保 BullMQ 不重试无限循环；OperationLog 由 service 路径写入
  console.error(`[ai-match-score] job ${job?.id} failed:`, err);
});
