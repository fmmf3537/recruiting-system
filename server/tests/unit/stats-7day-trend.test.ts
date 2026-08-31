import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockPrisma = vi.hoisted(() => ({
  $queryRaw: vi.fn(),
  candidate: {
    count: vi.fn(),
    findMany: vi.fn(),
  },
  interviewFeedback: {
    findMany: vi.fn(),
  },
  offer: {
    count: vi.fn(),
  },
  hCRequest: {
    count: vi.fn(),
  },
}));

const mockLogger = vi.hoisted(() => ({
  error: vi.fn(),
  info: vi.fn(),
  warn: vi.fn(),
  debug: vi.fn(),
}));

vi.mock('../../src/lib/prisma', () => ({
  default: mockPrisma,
}));

vi.mock('../../src/lib/redis', () => ({
  redis: {
    get: vi.fn().mockResolvedValue(null),
    setex: vi.fn().mockResolvedValue('OK'),
  },
  connectRedis: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../../src/lib/logger', () => ({
  logger: mockLogger,
}));

import { StatsService } from '../../src/services/stats.service';
import type { CandidateVisibilityScope } from '../../src/services/candidate-visibility.service';

function daysAgo(offset: number): Date {
  const d = new Date();
  d.setDate(d.getDate() - offset);
  d.setHours(0, 0, 0, 0);
  return d;
}

function mmdd(d: Date): string {
  return `${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function stubDashboardKpi(): void {
  vi.mocked(mockPrisma.candidate.count).mockResolvedValue(0);
  vi.mocked(mockPrisma.interviewFeedback.findMany).mockResolvedValue([]);
  vi.mocked(mockPrisma.offer.count).mockResolvedValue(0);
  vi.mocked(mockPrisma.hCRequest.count).mockResolvedValue(0);
  vi.mocked(mockPrisma.candidate.findMany).mockResolvedValue([]);
}

describe('StatsService - 近 7 天趋势单次 SQL', () => {
  let service: StatsService;

  beforeEach(() => {
    service = new StatsService();
    vi.clearAllMocks();
    stubDashboardKpi();
    vi.mocked(mockPrisma.$queryRaw).mockResolvedValue([]);
  });

  it('7 天内的 candidate → 每天分别有数据', async () => {
    vi.mocked(mockPrisma.$queryRaw).mockResolvedValue(
      [6, 5, 4, 3, 2, 1, 0].map((offset, idx) => ({
        day: daysAgo(offset),
        cnt: BigInt(idx + 1),
      }))
    );

    const result = await service.getDashboardStats();

    expect(mockPrisma.$queryRaw).toHaveBeenCalledTimes(1);
    expect(mockPrisma.candidate.count).toHaveBeenCalledTimes(1);
    expect(result.trend).toHaveLength(7);
    expect(result.trend.map((t) => t.date)).toEqual(
      [6, 5, 4, 3, 2, 1, 0].map((offset) => mmdd(daysAgo(offset)))
    );
    expect(result.trend.map((t) => t.count)).toEqual([1, 2, 3, 4, 5, 6, 7]);
  });

  it('部分日期有数据，部分没有 → 缺失日期填 0', async () => {
    vi.mocked(mockPrisma.$queryRaw).mockResolvedValue([
      { day: daysAgo(6), cnt: BigInt(5) },
      { day: daysAgo(0), cnt: BigInt(2) },
    ]);

    const result = await service.getDashboardStats();

    expect(result.trend).toHaveLength(7);
    expect(result.trend[0]).toEqual({ date: mmdd(daysAgo(6)), count: 5 });
    expect(result.trend[6]).toEqual({ date: mmdd(daysAgo(0)), count: 2 });
    expect(result.trend.slice(1, 6).every((t) => t.count === 0)).toBe(true);
  });

  it('visibleIds 过滤生效（admin 看全部，member 看自己范围）', async () => {
    const admin: CandidateVisibilityScope = {
      userId: 'admin-1',
      isAdmin: true,
      department: null,
      role: 'admin',
    };
    await service.getDashboardStats(admin);
    expect(mockPrisma.candidate.findMany).not.toHaveBeenCalled();
    expect(mockPrisma.$queryRaw).toHaveBeenCalledTimes(1);

    vi.clearAllMocks();
    stubDashboardKpi();
    vi.mocked(mockPrisma.candidate.findMany).mockResolvedValue([{ id: 'c-visible' }] as never);
    vi.mocked(mockPrisma.$queryRaw).mockResolvedValue([]);

    const member: CandidateVisibilityScope = {
      userId: 'hr-1',
      isAdmin: false,
      department: '技术部',
      role: 'hr',
    };
    await service.getDashboardStats(member);
    expect(mockPrisma.candidate.findMany).toHaveBeenCalledTimes(1);
    expect(mockPrisma.$queryRaw).toHaveBeenCalledTimes(1);
  });

  it('SQL 失败时返回 7 个 0（兜底）', async () => {
    vi.mocked(mockPrisma.$queryRaw).mockRejectedValue(new Error('db down'));

    const result = await service.getDashboardStats();

    expect(result.trend).toHaveLength(7);
    expect(result.trend.every((t) => t.count === 0)).toBe(true);
    expect(result.kpi).toBeDefined();
    expect(mockLogger.error).toHaveBeenCalled();
  });
});
