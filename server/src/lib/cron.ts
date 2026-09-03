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

/**
 * 注册 HR 考核过程分 + 日快照
 * 由 HR_SCORE_CRON 控制：cron 表达式（如 0 2 * * *）；false/留空则关闭。
 * 过程分与日快照各自 try/catch，单类失败不阻塞主进程，也不互相影响。
 */
export function registerHrScoreCron(): void {
  if (!env.HR_SCORE_CRON) {
    return;
  }

  cron.schedule(env.HR_SCORE_CRON, async () => {
    // 动态导入：聚合 service 加载失败也不阻断 cron 注册 / 主进程
    let calculateProcessScoresForWeek: typeof import('../services/hr-score-process.service')['calculateProcessScoresForWeek'];
    let generateDailySnapshot: typeof import('../services/hr-score-snapshot.service')['generateDailySnapshot'];
    let startOfDay: typeof import('../services/hr-score-snapshot.service')['startOfDay'];
    let startOfWeek: typeof import('../services/hr-score-snapshot.service')['startOfWeek'];
    try {
      const processMod = await import('../services/hr-score-process.service');
      const snapshotMod = await import('../services/hr-score-snapshot.service');
      calculateProcessScoresForWeek = processMod.calculateProcessScoresForWeek;
      generateDailySnapshot = snapshotMod.generateDailySnapshot;
      startOfDay = snapshotMod.startOfDay;
      startOfWeek = snapshotMod.startOfWeek;
    } catch (e) {
      logger.error({ err: e }, '[HR 考核] 任务模块加载失败');
      return;
    }

    const today = startOfDay(new Date());
    const weekStart = startOfWeek(today);
    // 1. 过程分计算（4 维度，单类失败不阻塞）
    try {
      const result = await calculateProcessScoresForWeek(weekStart);
      logger.info({ count: result.length }, '[过程分] 计算完成');
    } catch (e) {
      logger.error({ err: e }, '[过程分] 计算失败');
    }
    // 2. 今日日快照（业务分）
    try {
      await generateDailySnapshot(today);
      logger.info('[日快照] 生成完成');
    } catch (e) {
      logger.error({ err: e }, '[日快照] 生成失败');
    }
    // 3. 过程分写入周一 bizDate，需回刷周一快照，避免周聚合漏过程分
    if (weekStart.getTime() !== today.getTime()) {
      try {
        await generateDailySnapshot(weekStart);
        logger.info('[日快照] 周一过程分回刷完成');
      } catch (e) {
        logger.error({ err: e }, '[日快照] 周一过程分回刷失败');
      }
    }
  });

  logger.info({ expr: env.HR_SCORE_CRON }, '[HR 考核] 已注册');
}
