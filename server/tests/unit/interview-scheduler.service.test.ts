import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockCreatePendingEvaluations = vi.hoisted(() => vi.fn().mockResolvedValue(undefined));

vi.mock('../../src/lib/prisma', () => ({
  default: {
    interview: {
      findUnique: vi.fn(),
      findMany: vi.fn(),
      update: vi.fn(),
      create: vi.fn(),
      count: vi.fn(),
    },
    interviewEvaluation: {
      findMany: vi.fn(),
      createMany: vi.fn(),
      deleteMany: vi.fn(),
    },
    candidate: {
      findUnique: vi.fn(),
      count: vi.fn(),
    },
    operationLog: {
      create: vi.fn(),
    },
    job: { findUnique: vi.fn() },
  },
}));

vi.mock('../../src/lib/redis', () => ({
  getFromCache: vi.fn().mockResolvedValue(null),
  setCache: vi.fn(),
  clearListCache: vi.fn(),
}));

vi.mock('../../src/services/notification.service', () => ({
  createNotification: vi.fn().mockResolvedValue({}),
}));

vi.mock('../../src/services/interview-evaluation.service', () => ({
  interviewEvaluationService: {
    createPendingEvaluations: mockCreatePendingEvaluations,
  },
}));

vi.mock('../../src/services/interview-outline.service', () => ({
  assertFocusTypeValid: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../../src/services/hr-score-event.service', () => ({
  emitScoreEvent: vi.fn(),
}));

import { InterviewSchedulerService } from '../../src/services/interview-scheduler.service';
import prisma from '../../src/lib/prisma';
import * as notificationService from '../../src/services/notification.service';

const ADMIN_SCOPE = {
  userId: 'user-admin',
  isAdmin: true,
  department: null,
  role: 'admin',
};

const INTERVIEW_ID = 'interview-1';
const CANDIDATE_ID = 'candidate-1';
const SCHEDULED_AT = new Date('2026-09-20T02:00:00.000Z');

function scheduledInterview(overrides: Record<string, unknown> = {}) {
  return {
    id: INTERVIEW_ID,
    candidateId: CANDIDATE_ID,
    jobId: null,
    round: '初试',
    type: '现场',
    interviewers: [{ id: 'u-a', name: '甲' }, { id: 'u-b', name: '乙' }],
    scheduledAt: SCHEDULED_AT,
    duration: 60,
    location: '会议室A',
    notes: null,
    status: 'scheduled',
    focusType: null,
    createdById: 'user-hr',
    candidate: { id: CANDIDATE_ID, name: '张三', createdById: 'user-hr' },
    ...overrides,
  };
}

describe('InterviewSchedulerService - 面试修改/取消', () => {
  let service: InterviewSchedulerService;

  beforeEach(() => {
    service = new InterviewSchedulerService();
    vi.clearAllMocks();
    vi.mocked(prisma.candidate.count).mockResolvedValue(1);
    vi.mocked(prisma.interview.findMany).mockResolvedValue([]);
    vi.mocked(prisma.interviewEvaluation.findMany).mockResolvedValue([]);
    vi.mocked(prisma.interviewEvaluation.deleteMany).mockResolvedValue({ count: 0 });
    vi.mocked(prisma.operationLog.create).mockResolvedValue({} as never);
    mockCreatePendingEvaluations.mockResolvedValue(undefined);
    vi.mocked(notificationService.createNotification).mockResolvedValue({} as never);
  });

  describe('updateInterview', () => {
    it('scheduled 面试可修改地点', async () => {
      const existing = scheduledInterview();
      vi.mocked(prisma.interview.findUnique).mockResolvedValue(existing as never);
      vi.mocked(prisma.interview.update).mockResolvedValue({
        ...existing,
        location: '会议室B',
      } as never);

      const result = await service.updateInterview(
        INTERVIEW_ID,
        { location: '会议室B' },
        ADMIN_SCOPE
      );

      expect(result.location).toBe('会议室B');
      expect(prisma.interview.update).toHaveBeenCalledWith({
        where: { id: INTERVIEW_ID },
        data: { location: '会议室B' },
      });
      expect(prisma.interview.findMany).not.toHaveBeenCalled();
      expect(prisma.operationLog.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            userId: 'user-admin',
            targetType: 'Interview',
            targetId: INTERVIEW_ID,
            action: 'interview_updated',
          }),
        })
      );
    });

    it('非 scheduled 面试不可修改', async () => {
      vi.mocked(prisma.interview.findUnique).mockResolvedValue(
        scheduledInterview({ status: 'completed' }) as never
      );

      await expect(
        service.updateInterview(INTERVIEW_ID, { location: 'X' }, ADMIN_SCOPE)
      ).rejects.toMatchObject({ statusCode: 400 });
      expect(prisma.interview.update).not.toHaveBeenCalled();
    });

    it('改面试官应同步评估：新增待填、删除未提交', async () => {
      vi.mocked(prisma.interview.findUnique).mockResolvedValue(
        scheduledInterview() as never
      );
      vi.mocked(prisma.interviewEvaluation.findMany).mockResolvedValue([
        { id: 'e-a', interviewerId: 'u-a', submittedAt: null },
        { id: 'e-b', interviewerId: 'u-b', submittedAt: null },
      ] as never);
      vi.mocked(prisma.interview.update).mockResolvedValue(
        scheduledInterview({
          interviewers: [{ id: 'u-a', name: '甲' }, { id: 'u-c', name: '丙' }],
        }) as never
      );

      await service.updateInterview(
        INTERVIEW_ID,
        { interviewers: [{ id: 'u-a', name: '甲' }, { id: 'u-c', name: '丙' }] },
        ADMIN_SCOPE
      );

      expect(prisma.interviewEvaluation.deleteMany).toHaveBeenCalledWith({
        where: { id: { in: ['e-b'] } },
      });
      expect(mockCreatePendingEvaluations).toHaveBeenCalledWith(INTERVIEW_ID, [
        { id: 'u-c', name: '丙' },
      ]);
    });

    it('改期应通知所有当前面试官，被移除面试官也应收到变更通知', async () => {
      vi.mocked(prisma.interview.findUnique).mockResolvedValue(
        scheduledInterview() as never
      );
      vi.mocked(prisma.interviewEvaluation.findMany).mockResolvedValue([
        { id: 'e-a', interviewerId: 'u-a', submittedAt: null },
        { id: 'e-b', interviewerId: 'u-b', submittedAt: null },
      ] as never);
      vi.mocked(prisma.interview.update).mockResolvedValue(
        scheduledInterview({
          interviewers: [{ id: 'u-a', name: '甲' }, { id: 'u-c', name: '丙' }],
          scheduledAt: new Date('2026-09-21T02:00:00.000Z'),
        }) as never
      );

      await service.updateInterview(
        INTERVIEW_ID,
        {
          interviewers: [{ id: 'u-a', name: '甲' }, { id: 'u-c', name: '丙' }],
          scheduledAt: '2026-09-21T02:00:00.000Z',
        },
        ADMIN_SCOPE
      );

      await new Promise((resolve) => setTimeout(resolve, 0));
      expect(notificationService.createNotification).toHaveBeenCalledWith(
        expect.objectContaining({ recipientId: 'u-a', title: '面试变更：张三' })
      );
      expect(notificationService.createNotification).toHaveBeenCalledWith(
        expect.objectContaining({ recipientId: 'u-c', title: '面试变更：张三' })
      );
      expect(notificationService.createNotification).toHaveBeenCalledWith(
        expect.objectContaining({ recipientId: 'u-b', title: '面试安排变更：张三' })
      );
    });

    it('已提交评估的面试官不可移除', async () => {
      vi.mocked(prisma.interview.findUnique).mockResolvedValue(
        scheduledInterview() as never
      );
      vi.mocked(prisma.interviewEvaluation.findMany).mockResolvedValue([
        { id: 'e-a', interviewerId: 'u-a', submittedAt: null },
        { id: 'e-b', interviewerId: 'u-b', submittedAt: new Date() },
      ] as never);

      await expect(
        service.updateInterview(
          INTERVIEW_ID,
          { interviewers: [{ id: 'u-a', name: '甲' }] },
          ADMIN_SCOPE
        )
      ).rejects.toMatchObject({ statusCode: 400, message: '已提交评估的面试官不可移除' });
      expect(prisma.interview.update).not.toHaveBeenCalled();
      expect(prisma.interviewEvaluation.deleteMany).not.toHaveBeenCalled();
    });

    it('冲突检测应排除当前面试 id', async () => {
      vi.mocked(prisma.interview.findUnique).mockResolvedValue(
        scheduledInterview() as never
      );
      vi.mocked(prisma.interview.update).mockResolvedValue(
        scheduledInterview({ scheduledAt: new Date('2026-09-20T03:00:00.000Z') }) as never
      );

      await service.updateInterview(
        INTERVIEW_ID,
        { scheduledAt: '2026-09-20T03:00:00.000Z' },
        ADMIN_SCOPE
      );

      expect(prisma.interview.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            status: 'scheduled',
            id: { not: INTERVIEW_ID },
          }),
        })
      );
    });

    it('与其他面试时间重叠且面试官相同应 409', async () => {
      vi.mocked(prisma.interview.findUnique).mockResolvedValue(
        scheduledInterview() as never
      );
      vi.mocked(prisma.interview.findMany).mockResolvedValue([
        {
          id: 'other-1',
          interviewers: [{ id: 'u-a', name: '甲' }],
          scheduledAt: new Date('2026-09-20T02:30:00.000Z'),
          duration: 60,
          candidate: { name: '李四' },
        },
      ] as never);

      await expect(
        service.updateInterview(
          INTERVIEW_ID,
          { scheduledAt: '2026-09-20T03:00:00.000Z' },
          ADMIN_SCOPE
        )
      ).rejects.toMatchObject({ statusCode: 409 });
      expect(prisma.interview.update).not.toHaveBeenCalled();
    });
  });

  describe('cancelInterview', () => {
    it('scheduled 可取消并写 OperationLog', async () => {
      vi.mocked(prisma.interview.findUnique).mockResolvedValue(
        scheduledInterview() as never
      );
      vi.mocked(prisma.interview.update).mockResolvedValue(
        scheduledInterview({ status: 'cancelled' }) as never
      );

      const result = await service.cancelInterview(INTERVIEW_ID, '候选人改期', ADMIN_SCOPE);

      expect(result.status).toBe('cancelled');
      expect(prisma.operationLog.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            action: 'interview_cancelled',
            targetType: 'Interview',
            targetId: INTERVIEW_ID,
            detail: expect.objectContaining({ reason: '候选人改期' }),
          }),
        })
      );
    });

    it('completed 不可取消', async () => {
      vi.mocked(prisma.interview.findUnique).mockResolvedValue(
        scheduledInterview({ status: 'completed' }) as never
      );

      await expect(
        service.cancelInterview(INTERVIEW_ID, undefined, ADMIN_SCOPE)
      ).rejects.toMatchObject({ statusCode: 400 });
      expect(prisma.interview.update).not.toHaveBeenCalled();
    });

    it('OperationLog 写入失败不阻断取消主流程', async () => {
      vi.mocked(prisma.interview.findUnique).mockResolvedValue(
        scheduledInterview() as never
      );
      vi.mocked(prisma.interview.update).mockResolvedValue(
        scheduledInterview({ status: 'cancelled' }) as never
      );
      vi.mocked(prisma.operationLog.create).mockRejectedValue(new Error('db down'));
      const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      await expect(
        service.cancelInterview(INTERVIEW_ID, '改期', ADMIN_SCOPE)
      ).resolves.toMatchObject({ status: 'cancelled' });
      expect(errSpy).toHaveBeenCalled();
      errSpy.mockRestore();
    });
  });

  describe('submitHiringRecommendation', () => {
    it('负责职位的用人经理只能在全员反馈已齐后提交建议，且不推进候选人流程', async () => {
      vi.mocked(prisma.interview.findUnique).mockResolvedValue({
        ...scheduledInterview({ status: 'completed', feedbackStatus: 'all_submitted' }),
        job: { hiringManagerId: 'manager-1', collaboratorIds: [] },
      } as never);
      vi.mocked(prisma.interview.update).mockResolvedValue(
        scheduledInterview({ recommendation: 'advance' }) as never
      );

      await service.submitHiringRecommendation(INTERVIEW_ID, 'manager-1', {
        recommendation: 'advance',
        note: '建议进入复试',
      });
      await new Promise((resolve) => setTimeout(resolve, 0));

      expect(prisma.interview.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            recommendation: 'advance',
            recommendationNote: '建议进入复试',
            recommendedById: 'manager-1',
          }),
        })
      );
      expect(notificationService.createNotification).toHaveBeenCalledWith(
        expect.objectContaining({
          recipientId: 'user-hr',
          type: 'interview_recommendation',
        })
      );
    });
  });

  describe('recordCandidateResponse', () => {
    it('记录未到场时应同步将面试标记为 no_show', async () => {
      vi.mocked(prisma.interview.findUnique).mockResolvedValue(
        scheduledInterview() as never
      );
      vi.mocked(prisma.interview.update).mockResolvedValue(
        scheduledInterview({ status: 'no_show', candidateResponse: 'no_show' }) as never
      );

      await service.recordCandidateResponse(
        INTERVIEW_ID,
        'user-admin',
        { response: 'no_show', note: '候选人未到' },
        ADMIN_SCOPE
      );

      expect(prisma.interview.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            candidateResponse: 'no_show',
            candidateResponseNote: '候选人未到',
            status: 'no_show',
          }),
        })
      );
    });
  });
});
