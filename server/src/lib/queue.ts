import { Queue } from 'bullmq';
import { getBullMQConnection } from './redis';

export const resumeParseQueue = new Queue('resume-parse', {
  connection: getBullMQConnection(),
});
