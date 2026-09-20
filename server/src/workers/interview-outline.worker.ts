import { Worker } from 'bullmq';

import { getBullMQConnection } from '../lib/redis';
import { executeOutlineGeneration } from '../services/interview-outline.service';

/**
 * AI 面试大纲异步 worker：LLM 即使耗时超过网关超时，也不会影响已返回的创建任务接口。
 */
export const interviewOutlineWorker = new Worker(
  'interview-outline-generation',
  async (job) => {
    const { generationId } = job.data as { generationId?: string };
    if (!generationId) throw new Error('interview-outline-generation job 缺少 generationId');
    const outline = await executeOutlineGeneration(generationId);
    return { id: outline.id, version: outline.version };
  },
  { connection: getBullMQConnection() }
);

interviewOutlineWorker.on('completed', (job) => {
  if (process.env.NODE_ENV !== 'production') {
    console.log(`[interview-outline] job ${job.id} completed`);
  }
});

interviewOutlineWorker.on('failed', (job, err) => {
  console.error(`[interview-outline] job ${job?.id} failed:`, err);
});
