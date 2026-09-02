import { Prisma } from '@prisma/client';
import { describe, it, expect, vi, beforeEach } from 'vitest';

// F4-S1：考核积分发射器单测（mock prisma + logger，不触库）
const mockPrisma = vi.hoisted(() => ({
  user: { findUnique: vi.fn() },
  dictionary: { findFirst: vi.fn() },
  hrScoreEvent: { create: vi.fn() },
}));

vi.mock('../../src/lib/prisma', () => ({
  default: mockPrisma,
}));

vi.mock('../../src/lib/logger', () => ({
  logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn() },
}));

import { DEFAULT_POINTS, RULE_CODE } from '../../src/constants/hr-score-rules';
import {
  emitFirstAdvance,
  emitProbationOut,
  emitScoreEvent,
} from '../../src/services/hr-score-event.service';

/** 构造 Prisma 唯一约束冲突错误 */
function p2002(): Prisma.PrismaClientKnownRequestError {
  return new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
    code: 'P2002',
    clientVersion: '5.22.0',
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  mockPrisma.user.findUnique.mockResolvedValue({ role: 'hr' });
  mockPrisma.dictionary.findFirst.mockResolvedValue({ description: '2' });
  mockPrisma.hrScoreEvent.create.mockResolvedValue({ id: 'evt-1' });
});

describe('emitScoreEvent', () => {
  it('role=hr 时正常发射，分值取字典 description', async () => {
    mockPrisma.dictionary.findFirst.mockResolvedValue({ description: '7' });

    await emitScoreEvent({
      ruleCode: RULE_CODE.resume_upload,
      userId: 'u-1',
      targetType: 'Candidate',
      targetId: 'c-1',
      remark: '简历上传入库',
    });

    expect(mockPrisma.hrScoreEvent.create).toHaveBeenCalledTimes(1);
    const arg = mockPrisma.hrScoreEvent.create.mock.calls[0][0];
    expect(arg.data).toMatchObject({
      userId: 'u-1',
      ruleCode: RULE_CODE.resume_upload,
      category: 'business',
      points: 7,
      targetType: 'Candidate',
      targetId: 'c-1',
      remark: '简历上传入库',
    });
    expect(arg.data.bizDate).toBeInstanceOf(Date);
  });

  it('存量 member 角色归一为 hr，同样记分', async () => {
    mockPrisma.user.findUnique.mockResolvedValue({ role: 'member' });

    await emitScoreEvent({ ruleCode: RULE_CODE.resume_upload, userId: 'u-1' });

    expect(mockPrisma.hrScoreEvent.create).toHaveBeenCalledTimes(1);
  });

  it('role=admin 不产生积分事件', async () => {
    mockPrisma.user.findUnique.mockResolvedValue({ role: 'admin' });

    await emitScoreEvent({ ruleCode: RULE_CODE.resume_upload, userId: 'u-admin' });

    expect(mockPrisma.hrScoreEvent.create).not.toHaveBeenCalled();
  });

  it('role=hiring_manager / interviewer 不产生积分事件', async () => {
    mockPrisma.user.findUnique.mockResolvedValue({ role: 'hiring_manager' });
    await emitScoreEvent({ ruleCode: RULE_CODE.resume_upload, userId: 'u-hm' });

    mockPrisma.user.findUnique.mockResolvedValue({ role: 'interviewer' });
    await emitScoreEvent({ ruleCode: RULE_CODE.resume_upload, userId: 'u-iv' });

    expect(mockPrisma.hrScoreEvent.create).not.toHaveBeenCalled();
  });

  it('用户不存在时静默跳过', async () => {
    mockPrisma.user.findUnique.mockResolvedValue(null);

    await emitScoreEvent({ ruleCode: RULE_CODE.resume_upload, userId: 'u-none' });

    expect(mockPrisma.hrScoreEvent.create).not.toHaveBeenCalled();
  });

  it('P2002 唯一约束冲突视为已记分，静默幂等不抛错', async () => {
    mockPrisma.hrScoreEvent.create
      .mockResolvedValueOnce({ id: 'evt-1' })
      .mockRejectedValueOnce(p2002());

    await emitScoreEvent({
      ruleCode: RULE_CODE.candidate_joined,
      userId: 'u-1',
      targetType: 'Candidate',
      targetId: 'c-1',
    });
    await expect(
      emitScoreEvent({
        ruleCode: RULE_CODE.candidate_joined,
        userId: 'u-1',
        targetType: 'Candidate',
        targetId: 'c-1',
      })
    ).resolves.toBeUndefined();

    expect(mockPrisma.hrScoreEvent.create).toHaveBeenCalledTimes(2);
  });

  it('其他异常仅记日志，不抛到调用方', async () => {
    mockPrisma.hrScoreEvent.create.mockRejectedValue(new Error('db down'));

    await expect(
      emitScoreEvent({ ruleCode: RULE_CODE.resume_upload, userId: 'u-1' })
    ).resolves.toBeUndefined();
  });

  it('字典缺失时回退 DEFAULT_POINTS', async () => {
    mockPrisma.dictionary.findFirst.mockResolvedValue(null);

    await emitScoreEvent({ ruleCode: RULE_CODE.offer_sent, userId: 'u-1' });

    expect(mockPrisma.hrScoreEvent.create.mock.calls[0][0].data.points).toBe(
      DEFAULT_POINTS[RULE_CODE.offer_sent]
    );
  });

  it('字典 description 非数字时回退 DEFAULT_POINTS', async () => {
    mockPrisma.dictionary.findFirst.mockResolvedValue({ description: 'abc' });

    await emitScoreEvent({ ruleCode: RULE_CODE.candidate_joined, userId: 'u-1' });

    expect(mockPrisma.hrScoreEvent.create.mock.calls[0][0].data.points).toBe(
      DEFAULT_POINTS[RULE_CODE.candidate_joined]
    );
  });

  it('负分规则正常写入（字典存 -10）', async () => {
    mockPrisma.dictionary.findFirst.mockResolvedValue({ description: '-10' });

    await emitScoreEvent({
      ruleCode: RULE_CODE.offer_rejected,
      userId: 'u-1',
      targetType: 'Offer',
      targetId: 'o-1',
    });

    expect(mockPrisma.hrScoreEvent.create.mock.calls[0][0].data.points).toBe(-10);
  });

  it('未知规则（字典与常量都没有）不记分', async () => {
    mockPrisma.dictionary.findFirst.mockResolvedValue(null);

    await emitScoreEvent({ ruleCode: 'not_a_rule', userId: 'u-1' });

    expect(mockPrisma.hrScoreEvent.create).not.toHaveBeenCalled();
  });
});

describe('emitFirstAdvance', () => {
  it('猎头来源发 agency_resume_process', async () => {
    mockPrisma.dictionary.findFirst.mockResolvedValue({ description: '3' });

    await emitFirstAdvance('猎头:XX咨询', 'u-hr', 'c-1');

    expect(mockPrisma.hrScoreEvent.create.mock.calls[0][0].data).toMatchObject({
      userId: 'u-hr',
      ruleCode: RULE_CODE.agency_resume_process,
      points: 3,
      targetType: 'Candidate',
      targetId: 'c-1',
    });
  });

  it('非猎头来源发 dept_recommend', async () => {
    mockPrisma.dictionary.findFirst.mockResolvedValue({ description: '5' });

    await emitFirstAdvance('BOSS直聘', 'u-hr', 'c-2');

    expect(mockPrisma.hrScoreEvent.create.mock.calls[0][0].data).toMatchObject({
      ruleCode: RULE_CODE.dept_recommend,
      points: 5,
      targetId: 'c-2',
    });
  });

  it('source 为 null 时按非猎头处理', async () => {
    mockPrisma.dictionary.findFirst.mockResolvedValue({ description: '5' });

    await emitFirstAdvance(null, 'u-hr', 'c-3');

    expect(mockPrisma.hrScoreEvent.create.mock.calls[0][0].data.ruleCode).toBe(
      RULE_CODE.dept_recommend
    );
  });
});

describe('emitProbationOut', () => {
  it('负分记给候选人创建人', async () => {
    mockPrisma.dictionary.findFirst.mockResolvedValue({ description: '-20' });

    await emitProbationOut('c-1', 'u-owner', '入职阶段淘汰');

    expect(mockPrisma.hrScoreEvent.create.mock.calls[0][0].data).toMatchObject({
      userId: 'u-owner',
      ruleCode: RULE_CODE.probation_out,
      points: -20,
      targetType: 'Candidate',
      targetId: 'c-1',
      remark: '入职阶段淘汰',
    });
  });
});
