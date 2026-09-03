import { describe, it, expect, vi, beforeEach } from 'vitest';
import { PROCESS_RULE_CODE } from '../../src/constants/hr-score-process';

const mockPrisma = vi.hoisted(() => ({
  user: { findMany: vi.fn() },
  candidate: { findMany: vi.fn() },
  interviewEvaluation: { findMany: vi.fn() },
  stageRecord: { findMany: vi.fn() },
  communicationLog: { findMany: vi.fn() },
  operationLog: { findMany: vi.fn() },
  dictionary: { findFirst: vi.fn() },
  hrScoreEvent: { upsert: vi.fn() },
}));

const mockLogger = vi.hoisted(() => ({
  error: vi.fn(),
  warn: vi.fn(),
  info: vi.fn(),
  debug: vi.fn(),
}));

vi.mock('../../src/lib/prisma', () => ({ default: mockPrisma }));
vi.mock('../../src/lib/logger', () => ({ logger: mockLogger }));
vi.mock('../../src/lib/env', () => ({
  env: {
    HR_SCORE_TALENT_OPS_WEEKLY: 5,
    HR_SCORE_BUSINESS_WEIGHT: 0.7,
    HR_SCORE_PROCESS_WEIGHT: 0.3,
  },
}));

import {
  calculateProcessScoresForWeek,
  scoreByCount,
  scoreByRate,
} from '../../src/services/hr-score-process.service';

const WEEK_START = new Date(2026, 7, 31, 0, 0, 0, 0); // 周一
const HOUR = 60 * 60 * 1000;

function withinSla(createdAt: Date) {
  return { stage: '初筛', enteredAt: new Date(createdAt.getTime() + 24 * HOUR) };
}

function overSla(createdAt: Date) {
  return { stage: '初筛', enteredAt: new Date(createdAt.getTime() + 72 * HOUR) };
}

function cand(id: string, userId: string, hit: boolean) {
  const createdAt = new Date(WEEK_START.getTime() + 2 * HOUR);
  return {
    id,
    createdById: userId,
    createdAt,
    stageRecords: [
      { stage: '入库', enteredAt: createdAt },
      hit ? withinSla(createdAt) : overSla(createdAt),
    ],
  };
}

function upsertedPoints(ruleCode: string): Map<string, number> {
  const map = new Map<string, number>();
  for (const [args] of mockPrisma.hrScoreEvent.upsert.mock.calls) {
    const create = args.create as { userId: string; ruleCode: string; points: number };
    if (create.ruleCode === ruleCode) map.set(create.userId, create.points);
  }
  return map;
}

beforeEach(() => {
  vi.clearAllMocks();
  mockPrisma.hrScoreEvent.upsert.mockResolvedValue({ id: 'evt' });
  mockPrisma.dictionary.findFirst.mockResolvedValue(null);
  mockPrisma.candidate.findMany.mockResolvedValue([]);
  mockPrisma.interviewEvaluation.findMany.mockResolvedValue([]);
  mockPrisma.stageRecord.findMany.mockResolvedValue([]);
  mockPrisma.communicationLog.findMany.mockResolvedValue([]);
  mockPrisma.operationLog.findMany.mockResolvedValue([]);
});

describe('scoreByRate / scoreByCount', () => {
  it('简历时效：100%/90%/50%/0% → 10/10/5/0', () => {
    expect(scoreByRate(1, 0.9)).toBe(10);
    expect(scoreByRate(0.9, 0.9)).toBe(10);
    expect(scoreByRate(0.5, 0.9)).toBe(5);
    expect(scoreByRate(0, 0.9)).toBe(0);
  });

  it('人才库维护：0/2/5/10 次（目标 5）→ 0/4/10/10', () => {
    expect(scoreByCount(0, 5)).toBe(0);
    expect(scoreByCount(2, 5)).toBe(4);
    expect(scoreByCount(5, 5)).toBe(10);
    expect(scoreByCount(10, 5)).toBe(10);
  });
});

describe('calculateProcessScoresForWeek', () => {
  it('简历处理时效：4 种比例映射 10/10/5/0', async () => {
    mockPrisma.user.findMany.mockResolvedValue([
      { id: 'u-100' }, { id: 'u-90' }, { id: 'u-50' }, { id: 'u-0' },
    ]);
    const list = [
      cand('c1', 'u-100', true),
      cand('c2', 'u-100', true),
      ...Array.from({ length: 9 }, (_, i) => cand(`c90h${i}`, 'u-90', true)),
      cand('c90m', 'u-90', false),
      ...Array.from({ length: 5 }, (_, i) => cand(`c50h${i}`, 'u-50', true)),
      ...Array.from({ length: 5 }, (_, i) => cand(`c50m${i}`, 'u-50', false)),
      cand('c0a', 'u-0', false),
      cand('c0b', 'u-0', false),
    ];
    mockPrisma.candidate.findMany.mockResolvedValue(list);

    const result = await calculateProcessScoresForWeek(WEEK_START);
    const pts = upsertedPoints(PROCESS_RULE_CODE.resume_sla);

    expect(pts.get('u-100')).toBe(10);
    expect(pts.get('u-90')).toBe(10);
    expect(pts.get('u-50')).toBe(5);
    expect(pts.get('u-0')).toBe(0);
    expect(result.some((r) => r.dimension === PROCESS_RULE_CODE.resume_sla)).toBe(true);
  });

  it('面试反馈催收响应：100%/75%/50%/0% → 10/8/5/0', async () => {
    mockPrisma.user.findMany.mockResolvedValue([
      { id: 'u-100' }, { id: 'u-75' }, { id: 'u-50' }, { id: 'u-0' },
    ]);
    const remindedAt = new Date(WEEK_START.getTime() + HOUR);
    const inTime = new Date(remindedAt.getTime() + 2 * HOUR);
    const late = new Date(remindedAt.getTime() + 30 * HOUR);
    const ev = (userId: string, submittedAt: Date | null) => ({
      remindedAt,
      submittedAt,
      interview: { createdById: userId },
    });
    mockPrisma.interviewEvaluation.findMany.mockResolvedValue([
      ev('u-100', inTime), ev('u-100', inTime),
      ev('u-75', inTime), ev('u-75', inTime), ev('u-75', inTime), ev('u-75', late),
      ev('u-50', inTime), ev('u-50', late),
      ev('u-0', null), ev('u-0', late),
    ]);

    await calculateProcessScoresForWeek(WEEK_START);
    const pts = upsertedPoints(PROCESS_RULE_CODE.interview_response);
    expect(pts.get('u-100')).toBe(10);
    expect(pts.get('u-75')).toBe(8);
    expect(pts.get('u-50')).toBe(5);
    expect(pts.get('u-0')).toBe(0);
  });

  it('跟进记录完整度：100%/80%/50%/0% → 10/10/5/0', async () => {
    mockPrisma.user.findMany.mockResolvedValue([
      { id: 'u-100' }, { id: 'u-80' }, { id: 'u-50' }, { id: 'u-0' },
    ]);
    const stage = (userId: string, candidateId: string) => ({
      candidateId,
      candidate: { createdById: userId },
    });
    const comm = (userId: string, candidateId: string) => ({
      candidateId,
      candidate: { createdById: userId },
    });
    mockPrisma.stageRecord.findMany.mockResolvedValue([
      stage('u-100', 'a1'), stage('u-100', 'a2'),
      stage('u-80', 'b1'), stage('u-80', 'b2'), stage('u-80', 'b3'),
      stage('u-80', 'b4'), stage('u-80', 'b5'),
      stage('u-50', 'c1'), stage('u-50', 'c2'), stage('u-50', 'c3'), stage('u-50', 'c4'),
      stage('u-0', 'd1'), stage('u-0', 'd2'),
    ]);
    mockPrisma.communicationLog.findMany.mockResolvedValue([
      comm('u-100', 'a1'), comm('u-100', 'a2'),
      comm('u-80', 'b1'), comm('u-80', 'b2'), comm('u-80', 'b3'), comm('u-80', 'b4'),
      comm('u-50', 'c1'), comm('u-50', 'c2'),
    ]);

    await calculateProcessScoresForWeek(WEEK_START);
    const pts = upsertedPoints(PROCESS_RULE_CODE.followup_coverage);
    expect(pts.get('u-100')).toBe(10);
    expect(pts.get('u-80')).toBe(10);
    expect(pts.get('u-50')).toBe(5);
    expect(pts.get('u-0')).toBe(0);
  });

  it('人才库维护：0/2/5/10 次 → 0/4/10/10', async () => {
    mockPrisma.user.findMany.mockResolvedValue([
      { id: 'u-0' }, { id: 'u-2' }, { id: 'u-5' }, { id: 'u-10' },
    ]);
    const log = (userId: string, n: number) => Array.from({ length: n }, (_, i) => ({
      userId,
      action: 'tag_create',
      targetId: `${userId}-t${i}`,
    }));
    mockPrisma.operationLog.findMany.mockResolvedValue([
      ...log('u-2', 2),
      ...log('u-5', 5),
      ...log('u-10', 10),
    ]);

    await calculateProcessScoresForWeek(WEEK_START);
    const pts = upsertedPoints(PROCESS_RULE_CODE.talent_ops);
    expect(pts.get('u-0')).toBe(0);
    expect(pts.get('u-2')).toBe(4);
    expect(pts.get('u-5')).toBe(10);
    expect(pts.get('u-10')).toBe(10);
  });

  it('单维度失败不影响其他维度', async () => {
    mockPrisma.user.findMany.mockResolvedValue([{ id: 'u-1' }]);
    mockPrisma.candidate.findMany.mockRejectedValue(new Error('db down'));
    mockPrisma.operationLog.findMany.mockResolvedValue([
      { userId: 'u-1', action: 'tag_create', targetId: 't1' },
      { userId: 'u-1', action: 'tag_update', targetId: 't2' },
      { userId: 'u-1', action: 'candidate_update', targetId: 't3' },
      { userId: 'u-1', action: 'candidate_duplicate_resolved', targetId: 't4' },
      { userId: 'u-1', action: 'tag_create', targetId: 't5' },
    ]);

    const result = await calculateProcessScoresForWeek(WEEK_START);

    expect(mockLogger.error).toHaveBeenCalled();
    expect(result.some((r) => r.dimension === PROCESS_RULE_CODE.resume_sla)).toBe(false);
    expect(result.some((r) => r.dimension === PROCESS_RULE_CODE.talent_ops && r.points === 10)).toBe(true);
    const pts = upsertedPoints(PROCESS_RULE_CODE.talent_ops);
    expect(pts.get('u-1')).toBe(10);
  });
});
