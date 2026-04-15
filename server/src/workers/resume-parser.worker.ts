import { Worker } from 'bullmq';
import { redis } from '../lib/redis';
import { parseResume } from '../services/resume-parser.service';

export const resumeParseWorker = new Worker(
  'resume-parse',
  async (job) => {
    const { buffer, mimetype } = job.data;
    const buf = Buffer.isBuffer(buffer) ? buffer : Buffer.from(buffer.data);
    return parseResume(buf, mimetype);
  },
  { connection: redis }
);

resumeParseWorker.on('completed', (job) => {
  console.log(`Resume parse job ${job.id} completed`);
});

resumeParseWorker.on('failed', (job, err) => {
  console.error(`Resume parse job ${job?.id} failed:`, err);
});
