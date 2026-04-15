import { Queue } from 'bullmq';
import { redis } from './redis';

export const resumeParseQueue = new Queue('resume-parse', {
  connection: redis,
});
