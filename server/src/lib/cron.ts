import cron from 'node-cron';
import { env } from '../lib/env';
import { logger } from '../lib/logger';
import { anonymizeExpiredCandidates } from '../services/anonymize.service';
import { interviewEvaluationService } from '../services/interview-evaluation.service';
import { runReminderScan } from '../services/reminder.service';
import { sendHiringManagerDailyDigest } from '../services/hiring-manager-digest.service';
import { sendInterviewer24hReminder } from '../services/interviewer-reminder.service';

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

/**
 * 注册面试评估催收定时任务
 * 由 EVALUATION_REMINDER_CRON 环境变量控制：cron 表达式（如 0 * * * * 每小时）；false/留空则关闭
 */
export function registerEvaluationReminderCron(): void {
  if (!env.EVALUATION_REMINDER_CRON) {
    return;
  }

  cron.schedule(env.EVALUATION_REMINDER_CRON, async () => {
    try {
      const count = await interviewEvaluationService.sendEvaluationReminders();
      if (count > 0) {
        console.log(`[评估催收任务] 执行完成，本次催收 ${count} 条面试评估`);
      }
    } catch (error) {
      console.error('[评估催收任务] 执行失败:', error);
    }
  });

  console.log(`[评估催收任务] 已注册定时任务：${env.EVALUATION_REMINDER_CRON}`);
}

/**
 * 注册统一提醒定时任务（跟进到期 / 面试前提醒 / 阶段停留超时）
 * 由 REMINDER_CRON_ENABLED 环境变量控制开关（true 开启），固定每小时扫描一次（0 * * * *）
 */
export function registerReminderCron(): void {
  if (!env.REMINDER_CRON_ENABLED) {
    return;
  }

  cron.schedule('0 * * * *', async () => {
    try {
      const result = await runReminderScan();
      console.log(
        `[提醒任务] 执行完成：跟进提醒 ${result.followUp} 条，` +
          `面试提醒 ${result.interview} 条，阶段超时提醒 ${result.stageOverdue} 条`
      );
    } catch (error) {
      // 扫描失败仅记录日志，不拖垮主进程
      console.error('[提醒任务] 执行失败:', error);
    }
  });

  console.log('[提醒任务] 已注册定时任务：每小时扫描（0 * * * *）');
}

/**
 * 注册 hiring_manager 日报
 * 由 HIRING_DIGEST_CRON 控制：cron 表达式（如 0 9 * * *）；false/留空则关闭
 */
export function registerHiringDigestCron(): void {
  if (!env.HIRING_DIGEST_CRON) {
    return;
  }

  cron.schedule(env.HIRING_DIGEST_CRON, async () => {
    try {
      const count = await sendHiringManagerDailyDigest();
      logger.info({ sent: count }, '[招聘日报] 执行完成');
    } catch (e) {
      logger.error({ err: e }, '[招聘日报] 执行失败');
    }
  });

  logger.info({ expr: env.HIRING_DIGEST_CRON }, '[招聘日报] 已注册定时任务');
}

/**
 * 注册 interviewer 面试前 24h 提醒
 * 由 INTERVIEWER_REMINDER_CRON 控制：cron 表达式（如 0 * * * *）；false/留空则关闭
 */
export function registerInterviewerReminderCron(): void {
  if (!env.INTERVIEWER_REMINDER_CRON) {
    return;
  }

  cron.schedule(env.INTERVIEWER_REMINDER_CRON, async () => {
    try {
      const count = await sendInterviewer24hReminder();
      logger.info({ sent: count }, '[面试前 24h 提醒] 执行完成');
    } catch (e) {
      logger.error({ err: e }, '[面试前 24h 提醒] 执行失败');
    }
  });

  logger.info({ expr: env.INTERVIEWER_REMINDER_CRON }, '[面试前 24h 提醒] 已注册定时任务');
}
