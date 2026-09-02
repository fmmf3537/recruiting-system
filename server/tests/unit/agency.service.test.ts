import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('../../src/lib/prisma', () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const mock: any = {
    agency: {
      findUnique: vi.fn(),
      findMany: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
    },
    agencyLink: {
      findUnique: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
    },
    job: {
      findUnique: vi.fn(),
    },
    candidate: {
      count: vi.fn(),
      findMany: vi.fn(),
    },
    operationLog: {
      create: vi.fn(),
    },
    $queryRaw: vi.fn(),
  };
  return { default: mock };
});

import prisma from '../../src/lib/prisma';
import {
  createAgency,
  updateAgency,
  listAgencies,
  createAgencyLink,
  disableAgencyLink,
  getAgencyStats,
  DEFAULT_LINK_EXPIRES_DAYS,
} from '../../src/services/agency.service';

const AGENCY_ID = 'clf5stest0000000000000001';
const LINK_ID = 'clf5stest0000000000000002';
const USER_ID = 'user-hr-1';
const JOB_ID = 'clf5stest0000000000000003';
const CAND_ID_A = 'clf5stest0000000000000004';
const CAND_ID_B = 'clf5stest0000000000000005';

describe('agency.service - 猎头机构 / 链接 / 漏斗单元测试', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(prisma.operationLog.create).mockResolvedValue({} as any);
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  // ============ createAgency ============

  it('createAgency 正常：去空格后查重 + 写 OperationLog', async () => {
    vi.mocked(prisma.agency.findUnique).mockResolvedValue(null);
    vi.mocked(prisma.agency.create).mockImplementation(async (args: any) => ({
      id: AGENCY_ID,
      name: args.data.name,
      contact: null,
      phone: null,
      enabled: true,
      remark: null,
      createdById: USER_ID,
      createdAt: new Date(),
      updatedAt: new Date(),
    }));

    const result = await createAgency({ name: '  ACME猎头  ' }, USER_ID);

    expect(result.name).toBe('ACME猎头'); // 去空格
    expect(prisma.agency.findUnique).toHaveBeenCalledWith({ where: { name: 'ACME猎头' } });
    expect(prisma.operationLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          action: 'agency_create',
          targetType: 'Agency',
        }),
      })
    );
  });

  it('createAgency 名称重复 → 400', async () => {
    vi.mocked(prisma.agency.findUnique).mockResolvedValue({ id: 'dup' } as any);
    await expect(createAgency({ name: 'ACME' }, USER_ID)).rejects.toMatchObject({
      statusCode: 400,
      message: '机构名称已存在',
    });
  });

  it('createAgency name 全空格 → 400', async () => {
    await expect(createAgency({ name: '   ' }, USER_ID)).rejects.toMatchObject({
      statusCode: 400,
    });
  });

  // ============ updateAgency ============

  it('updateAgency 部分更新 + name 变重复 → 400', async () => {
    vi.mocked(prisma.agency.findUnique)
      .mockResolvedValueOnce({ id: AGENCY_ID, name: 'OLD' } as any) // 查存在
      .mockResolvedValueOnce({ id: 'dup' } as any); // 查重
    await expect(updateAgency(AGENCY_ID, { name: 'NEW' })).rejects.toMatchObject({
      statusCode: 400,
      message: '机构名称已存在',
    });
  });

  // ============ listAgencies ============

  it('listAgencies 返回每机构 linkCount + referralCount（按 source 计数）', async () => {
    vi.mocked(prisma.agency.findMany).mockResolvedValue([
      {
        id: AGENCY_ID,
        name: 'ACME',
        enabled: true,
        _count: { links: 3 },
      } as any,
    ]);
    vi.mocked(prisma.candidate.count).mockResolvedValueOnce(7);

    const list = await listAgencies();
    expect(list).toHaveLength(1);
    expect(list[0].linkCount).toBe(3);
    expect(list[0].referralCount).toBe(7);
    expect(prisma.candidate.count).toHaveBeenCalledWith({
      where: { source: '猎头:ACME' },
    });
  });

  // ============ createAgencyLink ============

  it('createAgencyLink 机构停用 → 400', async () => {
    vi.mocked(prisma.agency.findUnique).mockResolvedValue({
      id: AGENCY_ID,
      name: 'ACME',
      enabled: false,
    } as any);
    await expect(createAgencyLink(AGENCY_ID, {}, USER_ID)).rejects.toMatchObject({
      statusCode: 400,
    });
  });

  it('createAgencyLink 机构不存在 → 404', async () => {
    vi.mocked(prisma.agency.findUnique).mockResolvedValue(null);
    await expect(createAgencyLink(AGENCY_ID, {}, USER_ID)).rejects.toMatchObject({
      statusCode: 404,
    });
  });

  it('createAgencyLink jobId 不存在 → 404', async () => {
    vi.mocked(prisma.agency.findUnique).mockResolvedValue({
      id: AGENCY_ID,
      name: 'ACME',
      enabled: true,
    } as any);
    vi.mocked(prisma.job.findUnique).mockResolvedValue(null);
    await expect(
      createAgencyLink(AGENCY_ID, { jobId: JOB_ID }, USER_ID)
    ).rejects.toMatchObject({ statusCode: 404 });
  });

  it('createAgencyLink 默认 90 天有效期', async () => {
    vi.mocked(prisma.agency.findUnique).mockResolvedValue({
      id: AGENCY_ID,
      name: 'ACME',
      enabled: true,
    } as any);
    vi.mocked(prisma.agencyLink.create).mockImplementation(async (args: any) => ({
      id: LINK_ID,
      agencyId: args.data.agencyId,
      token: args.data.token,
      jobId: args.data.jobId,
      expiresAt: args.data.expiresAt,
      disabledAt: null,
      createdById: args.data.createdById,
      createdAt: new Date(),
    }));

    const before = Date.now();
    const result = await createAgencyLink(AGENCY_ID, {}, USER_ID);
    const after = Date.now();

    expect(result.token).toMatch(/^[a-f0-9]{32}$/);
    expect(result.referralUrl).toBe(`/referral/${result.token}`);
    expect(result.expiresAt).toBeInstanceOf(Date);

    const expectedMin = before + DEFAULT_LINK_EXPIRES_DAYS * 24 * 60 * 60 * 1000 - 100;
    const expectedMax = after + DEFAULT_LINK_EXPIRES_DAYS * 24 * 60 * 60 * 1000 + 100;
    expect(result.expiresAt!.getTime()).toBeGreaterThanOrEqual(expectedMin);
    expect(result.expiresAt!.getTime()).toBeLessThanOrEqual(expectedMax);
  });

  it('createAgencyLink 显式 null = 长期有效', async () => {
    vi.mocked(prisma.agency.findUnique).mockResolvedValue({
      id: AGENCY_ID,
      name: 'ACME',
      enabled: true,
    } as any);
    vi.mocked(prisma.agencyLink.create).mockImplementation(async (args: any) => ({
      id: LINK_ID,
      agencyId: args.data.agencyId,
      token: args.data.token,
      jobId: args.data.jobId,
      expiresAt: args.data.expiresAt,
      disabledAt: null,
      createdById: args.data.createdById,
      createdAt: new Date(),
    }));

    const result = await createAgencyLink(AGENCY_ID, { expiresAt: null }, USER_ID);
    expect(result.expiresAt).toBeNull();
  });

  // ============ disableAgencyLink ============

  it('disableAgencyLink 幂等：已停用直接返回，不重复写 OperationLog', async () => {
    vi.mocked(prisma.agencyLink.findUnique).mockResolvedValue({
      id: LINK_ID,
      agencyId: AGENCY_ID,
      disabledAt: new Date(),
    } as any);

    await disableAgencyLink(LINK_ID, USER_ID);

    expect(prisma.agencyLink.update).not.toHaveBeenCalled();
    expect(prisma.operationLog.create).not.toHaveBeenCalled();
  });

  it('disableAgencyLink 未停用 → 写 disabledAt + OperationLog', async () => {
    vi.mocked(prisma.agencyLink.findUnique).mockResolvedValue({
      id: LINK_ID,
      agencyId: AGENCY_ID,
      token: 'a'.repeat(32),
      disabledAt: null,
    } as any);
    vi.mocked(prisma.agencyLink.update).mockImplementation(async (args: any) => ({
      id: args.where.id,
      disabledAt: args.data.disabledAt,
    } as any));

    await disableAgencyLink(LINK_ID, USER_ID);

    expect(prisma.agencyLink.update).toHaveBeenCalledWith({
      where: { id: LINK_ID },
      data: { disabledAt: expect.any(Date) },
    });
    expect(prisma.operationLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ action: 'agency_link_disable' }),
      })
    );
  });

  // ============ getAgencyStats ============

  it('getAgencyStats 机构不存在 → 404', async () => {
    vi.mocked(prisma.agency.findUnique).mockResolvedValue(null);
    await expect(getAgencyStats(AGENCY_ID)).rejects.toMatchObject({ statusCode: 404 });
  });

  it('getAgencyStats 聚合 total / stages / offers / joined', async () => {
    vi.mocked(prisma.agency.findUnique).mockResolvedValue({
      id: AGENCY_ID,
      name: 'ACME',
    } as any);
    vi.mocked(prisma.candidate.findMany).mockResolvedValue([
      { id: CAND_ID_A, offer: { joined: true, id: 'o1' } } as any,
      { id: CAND_ID_B, offer: null } as any,
    ] as any);
    vi.mocked(prisma.$queryRaw).mockResolvedValue([
      { candidateId: CAND_ID_A, stage: '初筛' },
      { candidateId: CAND_ID_B, stage: 'Offer' },
    ]);

    const stats = await getAgencyStats(AGENCY_ID);

    expect(stats.total).toBe(2);
    expect(stats.offers).toBe(1);
    expect(stats.joined).toBe(1);
    expect(stats.stages).toEqual([
      { stage: '初筛', count: 1 },
      { stage: 'Offer', count: 1 },
    ]);
  });

  it('getAgencyStats total=0 时不调 $queryRaw', async () => {
    vi.mocked(prisma.agency.findUnique).mockResolvedValue({
      id: AGENCY_ID,
      name: 'ACME',
    } as any);
    vi.mocked(prisma.candidate.findMany).mockResolvedValue([]);

    const stats = await getAgencyStats(AGENCY_ID);

    expect(stats.total).toBe(0);
    expect(stats.stages).toEqual([]);
    expect(stats.offers).toBe(0);
    expect(stats.joined).toBe(0);
    expect(prisma.$queryRaw).not.toHaveBeenCalled();
  });
});