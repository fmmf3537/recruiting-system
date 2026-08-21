import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock prisma before importing the service
vi.mock('../../src/lib/prisma', () => ({
  default: {
    interviewEvaluation: {
      findUnique: vi.fn(),
      findMany: vi.fn(),
      createMany: vi.fn(),
      update: vi.fn(),
      count: vi.fn(),
    },
  },
}));

// Mock 通知服务，验证催收通知的发送
vi.mock('../../src/services/notification.service', () => ({
  createNotification: vi.fn().mockResolvedValue({}),
}));

import { InterviewEvaluationService } from '../../src/services/interview-evaluation.service';
import { AppError } from '../../src/middleware/errorHandler';
import * as notificationService from '../../src/services/notification.service';
import prisma from '../../src/lib/prisma';

describe('InterviewEvaluationService - 面试评估服务单元测试', () => {
  let service: InterviewEvaluationService;

  beforeEach(() => {
    service = new InterviewEvaluationService();
    vi.clearAllMocks();
  });

  describe('createPendingEvaluations - 生成待填评估', () => {
    it('应为每位面试官生成一条待填评估记录', async () => {
      vi.mocked(prisma.interviewEvaluation.createMany).mockResolvedValue({ count: 2 });

      await service.createPendingEvaluations('interview-1', [
        { id: 'user-1', name: '张三' },
        { id: 'user-2', name: '李四' },
      ]);

      expect(prisma.interviewEvaluation.createMany).toHaveBeenCalledWith({
        data: [
          { interviewId: 'interview-1', interviewerId: 'user-1' },
          { interviewId: 'interview-1', interviewerId: 'user-2' },
        ],
      });
    });
  });

  describe('submitEvaluation - 提交/修改评估', () => {
    const submitData = {
      dimensions: [{ name: '专业能力', score: 4, comment: '基础扎实' }],
      overallScore: 4,
      conclusion: 'pass',
    };

    it('面试官本人可成功提交评估', async () => {
      vi.mocked(prisma.interviewEvaluation.findUnique).mockResolvedValue({
        id: 'eval-1',
        interviewerId: 'user-1',
      } as any);
      vi.mocked(prisma.interviewEvaluation.update).mockResolvedValue({
        id: 'eval-1',
        interviewerId: 'user-1',
        ...submitData,
        submittedAt: new Date(),
      } as any);

      const result = await service.submitEvaluation('eval-1', 'user-1', submitData);

      expect(result.conclusion).toBe('pass');
      expect(prisma.interviewEvaluation.update).toHaveBeenCalledWith({
        where: { id: 'eval-1' },
        data: expect.objectContaining({
          dimensions: submitData.dimensions,
          overallScore: 4,
          conclusion: 'pass',
          submittedAt: expect.any(Date),
        }),
      });
    });

    it('评估记录不存在时应抛出 404', async () => {
      vi.mocked(prisma.interviewEvaluation.findUnique).mockResolvedValue(null);

      await expect(service.submitEvaluation('eval-x', 'user-1', submitData)).rejects.toThrow(
        AppError
      );
      await expect(service.submitEvaluation('eval-x', 'user-1', submitData)).rejects.toMatchObject(
        { statusCode: 404 }
      );
    });

    it('非本人的评估应抛出 403', async () => {
      vi.mocked(prisma.interviewEvaluation.findUnique).mockResolvedValue({
        id: 'eval-1',
        interviewerId: 'user-2',
      } as any);

      await expect(service.submitEvaluation('eval-1', 'user-1', submitData)).rejects.toMatchObject(
        { statusCode: 403 }
      );
      expect(prisma.interviewEvaluation.update).not.toHaveBeenCalled();
    });
  });

  describe('getMyEvaluations - 我的评估列表', () => {
    it('待评估列表应只查询本人未提交的评估', async () => {
      vi.mocked(prisma.interviewEvaluation.findMany).mockResolvedValue([]);
      vi.mocked(prisma.interviewEvaluation.count).mockResolvedValue(0);

      await service.getMyEvaluations('user-1', { status: 'pending', page: 1, pageSize: 10 });

      expect(prisma.interviewEvaluation.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { interviewerId: 'user-1', submittedAt: null },
        })
      );
    });

    it('已提交列表应只查询本人已提交的评估', async () => {
      vi.mocked(prisma.interviewEvaluation.findMany).mockResolvedValue([]);
      vi.mocked(prisma.interviewEvaluation.count).mockResolvedValue(0);

      await service.getMyEvaluations('user-1', { status: 'submitted' });

      expect(prisma.interviewEvaluation.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { interviewerId: 'user-1', submittedAt: { not: null } },
        })
      );
    });
  });

  describe('sendEvaluationReminders - 催收扫描（mock 时间）', () => {
    // 固定当前时间：2026-08-20 12:00
    const now = new Date('2026-08-20T12:00:00Z');

    const buildEvaluation = (overrides: {
      id: string;
      scheduledAt: Date;
      duration?: number;
      status?: string;
    }) => ({
      id: overrides.id,
      interviewerId: 'user-1',
      interviewId: `interview-${overrides.id}`,
      interview: {
        id: `interview-${overrides.id}`,
        round: '初试',
        status: overrides.status || 'scheduled',
        scheduledAt: overrides.scheduledAt,
        duration: overrides.duration ?? 60,
        candidate: { name: '张三' },
      },
    });

    it('面试结束超过 24 小时未提交评估时应发送催收通知', async () => {
      // 面试 2026-08-18 10:00 开始，时长 60 分钟 → 结束已超过 24 小时
      vi.mocked(prisma.interviewEvaluation.findMany).mockResolvedValue([
        buildEvaluation({ id: 'eval-1', scheduledAt: new Date('2026-08-18T10:00:00Z') }),
      ] as any);
      vi.mocked(prisma.interviewEvaluation.update).mockResolvedValue({} as any);

      const count = await service.sendEvaluationReminders(now);

      expect(count).toBe(1);
      expect(notificationService.createNotification).toHaveBeenCalledWith(
        expect.objectContaining({
          recipientId: 'user-1',
          type: 'evaluation_reminder',
          businessId: 'interview-eval-1',
          businessType: 'interview',
        })
      );
      // 催收后应标记 remindedAt，避免重复催收
      expect(prisma.interviewEvaluation.update).toHaveBeenCalledWith({
        where: { id: 'eval-1' },
        data: { remindedAt: now },
      });
    });

    it('面试结束未满 24 小时（长时长面试）不应催收', async () => {
      // 面试 2026-08-19 10:00 开始（26 小时前），时长 180 分钟 → 结束仅 23 小时前
      vi.mocked(prisma.interviewEvaluation.findMany).mockResolvedValue([
        buildEvaluation({
          id: 'eval-2',
          scheduledAt: new Date('2026-08-19T10:00:00Z'),
          duration: 180,
        }),
      ] as any);

      const count = await service.sendEvaluationReminders(now);

      expect(count).toBe(0);
      expect(notificationService.createNotification).not.toHaveBeenCalled();
      expect(prisma.interviewEvaluation.update).not.toHaveBeenCalled();
    });

    it('粗筛条件应只扫描未提交且未催收过的评估', async () => {
      vi.mocked(prisma.interviewEvaluation.findMany).mockResolvedValue([]);

      const count = await service.sendEvaluationReminders(now);

      expect(count).toBe(0);
      expect(prisma.interviewEvaluation.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            submittedAt: null,
            remindedAt: null,
            interview: expect.objectContaining({
              status: { in: ['scheduled', 'completed'] },
              scheduledAt: { lt: new Date(now.getTime() - 24 * 60 * 60 * 1000) },
            }),
          }),
        })
      );
    });
  });
});
