import { describe, it, expect, vi, beforeEach } from 'vitest';

const cronEnv = vi.hoisted(() => ({
  HIRING_DIGEST_CRON: '0 9 * * *' as string | null,
  INTERVIEWER_REMINDER_CRON: '0 * * * *' as string | null,
}));

vi.mock('../../src/lib/env', () => ({
  env: cronEnv,
}));

vi.mock('../../src/lib/logger', () => ({
  logger: { info: vi.fn(), error: vi.fn() },
}));

const schedule = vi.hoisted(() => vi.fn());
vi.mock('node-cron', () => ({
  default: { schedule },
}));

vi.mock('../../src/services/anonymize.service', () => ({
  anonymizeExpiredCandidates: vi.fn(),
}));
vi.mock('../../src/services/interview-evaluation.service', () => ({
  interviewEvaluationService: { sendEvaluationReminders: vi.fn() },
}));
vi.mock('../../src/services/reminder.service', () => ({
  runReminderScan: vi.fn(),
}));
vi.mock('../../src/services/hiring-manager-digest.service', () => ({
  sendHiringManagerDailyDigest: vi.fn(),
}));
vi.mock('../../src/services/interviewer-reminder.service', () => ({
  sendInterviewer24hReminder: vi.fn(),
}));

import {
  registerHiringDigestCron,
  registerInterviewerReminderCron,
} from '../../src/lib/cron';

describe('P-4 cron 注册', () => {
  beforeEach(() => {
    schedule.mockClear();
    cronEnv.HIRING_DIGEST_CRON = '0 9 * * *';
    cronEnv.INTERVIEWER_REMINDER_CRON = '0 * * * *';
  });

  it('HIRING_DIGEST_CRON 为 false 时 registerHiringDigestCron 不注册', () => {
    cronEnv.HIRING_DIGEST_CRON = null;
    registerHiringDigestCron();
    expect(schedule).not.toHaveBeenCalled();
  });

  it('INTERVIEWER_REMINDER_CRON 为 false 时 registerInterviewerReminderCron 不注册', () => {
    cronEnv.INTERVIEWER_REMINDER_CRON = null;
    registerInterviewerReminderCron();
    expect(schedule).not.toHaveBeenCalled();
  });

  it('正常配置时两个 cron 都能注册成功', () => {
    registerHiringDigestCron();
    registerInterviewerReminderCron();
    expect(schedule).toHaveBeenCalledTimes(2);
    expect(schedule).toHaveBeenCalledWith('0 9 * * *', expect.any(Function));
    expect(schedule).toHaveBeenCalledWith('0 * * * *', expect.any(Function));
  });
});
