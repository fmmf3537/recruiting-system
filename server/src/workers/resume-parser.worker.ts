import { Worker } from 'bullmq';
import fs from 'fs/promises';
import { redis } from '../lib/redis';
import { parseResume } from '../services/resume-parser.service';

export const resumeParseWorker = new Worker(
  'resume-parse',
  async (job) => {
    const { filePath, mimetype } = job.data;
    const buf = await fs.readFile(filePath);
    const result = await parseResume(buf, mimetype);
    // 解析完成后删除临时文件
    await fs.unlink(filePath).catch((err) => {
      console.error(`删除临时简历文件失败: ${filePath}`, err);
    });
    return result;
  },
  { connection: redis }
);

resumeParseWorker.on('completed', (job) => {
  console.log(`Resume parse job ${job.id} completed`);
});

resumeParseWorker.on('failed', (job, err) => {
  console.error(`Resume parse job ${job?.id} failed:`, err);
});
