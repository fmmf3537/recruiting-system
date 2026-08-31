import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import express from 'express';
import hiringRoutes from '../../src/routes/hiring';
import { errorHandler } from '../../src/middleware/errorHandler';

const mockPrisma = vi.hoisted(() => ({
  job: { count: vi.fn() },
  candidateJob: { count: vi.fn(), findMany: vi.fn() },
  offer: { count: vi.fn(), findMany: vi.fn(), findUnique: vi.fn(), update: vi.fn() },
  interview: { count: vi.fn(), findMany: vi.fn() },
}));

vi.mock('../../src/lib/prisma', () => ({
  default: mockPrisma,
}));

vi.mock('../../src/middleware/auth', () => ({
  authenticate: (req: express.Request, _res: express.Response, next: express.NextFunction) => {
    const roleHeader = req.headers['x-test-role'];
    const role = typeof roleHeader === 'string' ? roleHeader : 'admin';
    const deptHeader = req.headers['x-test-department'];
    let department: string | null;
    if (deptHeader === 'none') department = null;
    else if (typeof deptHeader === 'string') department = deptHeader;
    else department = role === 'admin' ? null : '技术部';
    req.user = {
      userId: 'user-1',
      email: 'test@test.com',
      role,
      department,
    };
    next();
  },
}));

const OFFER_ID = 'clhoffer00000000000000001';
const HIRING_PATHS = [
  '/api/hiring/overview',
  '/api/hiring/approvals',
  '/api/hiring/candidates',
  '/api/hiring/interviews',
];

const deptJobFilter = { departments: { array_contains: ['技术部'] } };
const emptyJobFilter = { id: { in: [] } };

describe('hiring 工作台', () => {
  let app: express.Application;

  beforeEach(() => {
    app = express();
    app.use(express.json());
    app.use('/api/hiring', hiringRoutes);
    app.use(errorHandler);

    vi.clearAllMocks();
    mockPrisma.job.count.mockResolvedValue(0);
    mockPrisma.candidateJob.count.mockResolvedValue(0);
    mockPrisma.candidateJob.findMany.mockResolvedValue([]);
    mockPrisma.offer.count.mockResolvedValue(0);
    mockPrisma.offer.findMany.mockResolvedValue([]);
    mockPrisma.interview.count.mockResolvedValue(0);
    mockPrisma.interview.findMany.mockResolvedValue([]);
    mockPrisma.offer.findUnique.mockResolvedValue({
      id: OFFER_ID,
      status: 'pending_approval',
      candidateId: 'cand-1',
      candidate: {
        candidateJobs: [{ job: { departments: ['技术部'] } }],
      },
    });
    mockPrisma.offer.update.mockResolvedValue({
      id: OFFER_ID,
      status: 'approved',
      approverId: 'user-1',
    });
  });

  it('admin 访问 5 个端点都返回 200', async () => {
    for (const path of HIRING_PATHS) {
      const res = await request(app).get(path).expect(200);
      expect(res.body.success).toBe(true);
    }
    const approveRes = await request(app)
      .post(`/api/hiring/approvals/${OFFER_ID}/approve`)
      .expect(200);
    expect(approveRes.body.success).toBe(true);
  });

  it('hiring_manager 有 department 时只看到本部门数据', async () => {
    await request(app)
      .get('/api/hiring/overview')
      .set('x-test-role', 'hiring_manager')
      .expect(200);

    expect(mockPrisma.job.count).toHaveBeenCalledWith({
      where: { ...deptJobFilter, status: 'open' },
    });
    expect(mockPrisma.candidateJob.count).toHaveBeenCalledWith({
      where: {
        job: deptJobFilter,
        candidate: { deletedAt: null },
      },
    });
    expect(mockPrisma.offer.count).toHaveBeenCalledWith({
      where: {
        status: 'pending_approval',
        candidate: {
          deletedAt: null,
          candidateJobs: { some: { job: deptJobFilter } },
        },
      },
    });
    expect(mockPrisma.interview.count).toHaveBeenCalledWith({
      where: expect.objectContaining({
        status: 'scheduled',
        job: deptJobFilter,
      }),
    });
  });

  it('hiring_manager 无 department（null）时返回空数据', async () => {
    mockPrisma.job.count.mockResolvedValue(0);
    mockPrisma.candidateJob.count.mockResolvedValue(0);
    mockPrisma.offer.count.mockResolvedValue(0);
    mockPrisma.interview.count.mockResolvedValue(0);

    const res = await request(app)
      .get('/api/hiring/overview')
      .set('x-test-role', 'hiring_manager')
      .set('x-test-department', 'none')
      .expect(200);

    expect(res.body.data.openJobs).toBe(0);
    expect(res.body.data.activeCandidates).toBe(0);
    expect(res.body.data.pendingOffers).toBe(0);
    expect(res.body.data.scheduledInterviews).toBe(0);
    expect(mockPrisma.job.count).toHaveBeenCalledWith({
      where: { ...emptyJobFilter, status: 'open' },
    });
    expect(mockPrisma.offer.count).toHaveBeenCalledWith({
      where: {
        status: 'pending_approval',
        candidate: {
          deletedAt: null,
          candidateJobs: { some: { job: emptyJobFilter } },
        },
      },
    });
  });

  it('hr / interviewer 访问 /api/hiring/* 返回 403', async () => {
    for (const role of ['hr', 'interviewer']) {
      for (const path of HIRING_PATHS) {
        const res = await request(app).get(path).set('x-test-role', role).expect(403);
        expect(res.body.success).toBe(false);
      }
      await request(app)
        .post(`/api/hiring/approvals/${OFFER_ID}/approve`)
        .set('x-test-role', role)
        .expect(403);
    }
  });

  it('hiring_manager 审批 Offer 后 status = approved', async () => {
    const res = await request(app)
      .post(`/api/hiring/approvals/${OFFER_ID}/approve`)
      .set('x-test-role', 'hiring_manager')
      .expect(200);

    expect(res.body.success).toBe(true);
    expect(res.body.data.status).toBe('approved');
    expect(mockPrisma.offer.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: OFFER_ID },
        data: expect.objectContaining({
          status: 'approved',
          approverId: 'user-1',
        }),
      })
    );
  });
});
