import { Queue } from 'bullmq';
import { getBullMQConnection } from './redis';

export const resumeParseQueue = new Queue('resume-parse', {
  connection: getBullMQConnection(),
});

// 简历自动打分队列（F2-S）：候选人关联职位后由 candidate.service 投递，worker 调 LLM 多维打分
export const aiMatchScoreQueue = new Queue('ai-match-score', {
  connection: getBullMQConnection(),
});

// AI 面试大纲生成队列：请求快速返回，由 worker 完成 LLM 调用与落库。
export const interviewOutlineQueue = new Queue('interview-outline-generation', {
  connection: getBullMQConnection(),
});
