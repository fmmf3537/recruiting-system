import cron from 'node-cron';
import { env } from '../lib/env';
import { anonymizeExpiredCandidates } from '../services/anonymize.service';

/**
 * 注册候选人匿名化定时任务（个保法合规）
 * 由 ANONYMIZE_CRON 环境变量控制：cron 表达式（如 0 3 * * * 每日凌晨 3 点）；false/留空则关闭
 */
export function registerAnonymizeCron(): void {
  if (!env.ANONYMIZE_CRON) {
    return;
  }

  cron.schedule(env.ANONYMIZE_CRON, async () => {
    try {
      const count = await anonymizeExpiredCandidates();
      console.log(`[匿名化任务] 执行完成，本次匿名化 ${count} 位候选人`);
    } catch (error) {
      console.error('[匿名化任务] 执行失败:', error);
    }
  });

  console.log(`[匿名化任务] 已注册定时任务：${env.ANONYMIZE_CRON}`);
}
