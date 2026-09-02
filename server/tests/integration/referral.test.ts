import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import express from 'express';

// mock prisma
vi.mock('../../src/lib/prisma', () => ({
  default: {
    agencyLink: { findUnique: vi.fn(), create: vi.fn(), update: vi.fn() },
    agency: { findUnique: vi.fn(), findMany: vi.fn() },
    candidate: { findUnique: vi.fn(), findFirst: vi.fn(), findMany: vi.fn(), create: vi.fn(), count: vi.fn() },
    candidateJob: { create: vi.fn() },
    uploadRecord: { create: vi.fn() },
    operationLog: { create: vi.fn() },
    job: { findUnique: vi.fn() },
    $queryRaw: vi.fn(),
    $transaction: vi.fn(),
  },
}));

vi.mock('../../src/services/file.service', () => ({
  createUploadRecord: vi.fn().mockResolvedValue({ id: 'upload-1' }),
}));

vi.mock('../../src/utils/upload-file', () => ({
  validateAndRenameUpload: vi
    .fn()
    .mockResolvedValue({ filename: 'abc-uuid.pdf', mimetype: 'application/pdf', size: 1024 }),
  buildFileApiPath: vi.fn((filename: string) => `/api/files/${filename}`),
  ALLOWED_UPLOAD_MIMES: {
    'application/pdf': '.pdf',
    'application/msword': '.doc',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document': '.docx',
  },
}));

vi.mock('../../src/services/candidate.service', () => ({
  candidateService: {
    createCandidate: vi.fn().mockResolvedValue({ candidate: { id: 'cand-new' } }),
  },
}));

vi.mock('../../src/services/duplicate-checker.service', () => ({
  checkDuplicate: vi.fn().mockResolvedValue({ duplicates: [], hasHiddenDuplicate: false }),
}));

vi.mock('../../src/services/notification.service', () => ({
  createNotification: vi.fn().mockResolvedValue({ id: 'noti-1' }),
}));

vi.mock('../../src/lib/queue', () => ({
  resumeParseQueue: { add: vi.fn().mockResolvedValue({ id: 'q-1' }) },
}));

vi.mock('../../src/lib/redis', () => ({
  redis: { disconnect: vi.fn() },
  getBullMQConnection: () => ({ host: 'localhost', port: 6379 }),
  getFromCache: vi.fn().mockResolvedValue(null),
  setCache: vi.fn(),
  clearListCache: vi.fn(),
  clearStatsCache: vi.fn(),
  connectRedis: vi.fn(),
}));

// 模拟 auth：x-test-role: 'none' → 401；其余按 role 注入 req.user
// 公开路由根本不过 authenticate（路由层就不挂 authenticate），管理端路由走 authenticate
vi.mock('../../src/middleware/auth', () => ({
  authenticate: (req: express.Request, res: express.Response, next: express.NextFunction) => {
    const header = req.headers['x-test-role'];
    if (header === 'none') {
      res.status(401).json({ success: false, error: '未提供认证令牌' });
      return;
    }
    const role = typeof header === 'string' ? header : 'admin';
    req.user = {
      userId: 'user-1',
      email: 'test@test.com',
      role,
      department: role === 'admin' ? null : '技术部',
    };
    next();
  },
  authorize: () => (_req: express.Request, _res: express.Response, next: express.NextFunction) => next(),
}));

const permissionMockState: { role: string | null } = { role: null };
vi.mock('../../src/middleware/role', () => ({
  requireMatrixPermission: () => (req: express.Request, _res: express.Response, next: express.NextFunction) => {
    const role = permissionMockState.role || (req.headers['x-test-role'] as string) || 'admin';
    // 与实际权限矩阵对齐：interviewer 不给 agency:manage
    if (role === 'interviewer') {
      return next(new AppError(`没有权限：agency:manage`, 403));
    }
    next();
  },
}));

import agencyRoutes from '../../src/routes/agencies';
import referralRoutes from '../../src/routes/referral';
import { AppError, errorHandler } from '../../src/middleware/errorHandler';
import prisma from '../../src/lib/prisma';

const VALID_TOKEN = 'a'.repeat(32);
const FAKE_TOKEN = 'b'.repeat(32);

function makeLink(overrides: Record<string, unknown> = {}) {
  return {
    id: 'link-1',
    agencyId: 'agency-1',
    token: VALID_TOKEN,
    jobId: null,
    expiresAt: null,
    disabledAt: null,
    createdById: 'user-1',
    createdAt: new Date(),
    agency: { id: 'agency-1', name: 'ACME 猎头', enabled: true },
    job: null,
    ...overrides,
  };
}

describe('referral 接口集成测试（F5-S 公开侧 + 管理侧鉴权）', () => {
  let app: express.Application;

  beforeEach(() => {
    vi.clearAllMocks();
    permissionMockState.role = null;
    vi.mocked(prisma.operationLog.create).mockResolvedValue({} as any);
    vi.mocked(prisma.candidateJob.create).mockResolvedValue({ id: 'cj-1' } as any);

    app = express();
    app.use(express.json());
    app.use('/api/agencies', agencyRoutes);
    app.use('/api/referral', referralRoutes);
    app.use(errorHandler);
  });

  // ============ GET 公开接口 ============

  it('GET /api/referral/:token 正常：仅返回 { agencyName, jobTitle }', async () => {
    vi.mocked(prisma.agencyLink.findUnique).mockResolvedValue(
      makeLink({
        jobId: 'job-1',
        job: { id: 'job-1', title: '高级前端' },
      }) as any
    );

    const res = await request(app).get(`/api/referral/${VALID_TOKEN}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data).toEqual({ agencyName: 'ACME 猎头', jobTitle: '高级前端' });
    // 字段收敛：仅两个字段
    expect(Object.keys(res.body.data).sort()).toEqual(['agencyName', 'jobTitle']);
  });

  it('GET 伪造 token（合法 32 位 hex 但不存在）→ 410', async () => {
    vi.mocked(prisma.agencyLink.findUnique).mockResolvedValue(null);
    const res = await request(app).get(`/api/referral/${FAKE_TOKEN}`);
    expect(res.status).toBe(410);
    expect(res.body).toMatchObject({ success: false, error: '链接已失效' });
  });

  it('GET 非 hex 格式 token → 410（不走 400，防探测）', async () => {
    const res = await request(app).get('/api/referral/not-a-valid-token');
    expect(res.status).toBe(410);
    expect(res.body).toMatchObject({ success: false, error: '链接已失效' });
  });

  it('GET 机构停用 → 410', async () => {
    vi.mocked(prisma.agencyLink.findUnique).mockResolvedValue(
      makeLink({ agency: { id: 'agency-1', name: 'X', enabled: false } }) as any
    );
    const res = await request(app).get(`/api/referral/${VALID_TOKEN}`);
    expect(res.status).toBe(410);
  });

  // ============ POST 公开接口 ============

  it('POST 未勾授权 → 400', async () => {
    const res = await request(app)
      .post(`/api/referral/${VALID_TOKEN}`)
      .field('name', '张三')
      .field('phone', '13800138000')
      .field('consent', 'false'); // 未勾
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/授权/);
  });

  it('POST 文件缺失 → 400', async () => {
    vi.mocked(prisma.agencyLink.findUnique).mockResolvedValue(makeLink() as any);
    const res = await request(app)
      .post(`/api/referral/${VALID_TOKEN}`)
      .field('name', '张三')
      .field('phone', '13800138000')
      .field('consent', 'true');
    expect(res.status).toBe(400);
    expect(res.body.error).toContain('简历文件');
  });

  it('POST 正常提交：固定文案 + 不含 candidateId', async () => {
    vi.mocked(prisma.agencyLink.findUnique).mockResolvedValue(makeLink() as any);

    const res = await request(app)
      .post(`/api/referral/${VALID_TOKEN}`)
      .field('name', '张三')
      .field('phone', '13800138000')
      .field('consent', 'true')
      .attach('file', Buffer.from('%PDF-1.4 fake content'), {
        filename: 'resume.pdf',
        contentType: 'application/pdf',
      });

    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      success: true,
      message: '已提交，将由 HR 联系候选人',
    });
    expect(res.body).not.toHaveProperty('candidateId');
    expect(res.body).not.toHaveProperty('data');
  });

  it('POST 伪造 token（32 位 hex 但不存在）→ 410', async () => {
    vi.mocked(prisma.agencyLink.findUnique).mockResolvedValue(null);
    const res = await request(app)
      .post(`/api/referral/${FAKE_TOKEN}`)
      .field('name', '张三')
      .field('phone', '13800138000')
      .field('consent', 'true')
      .attach('file', Buffer.from('fake'), {
        filename: 'resume.pdf',
        contentType: 'application/pdf',
      });
    expect(res.status).toBe(410);
  });

  // ============ 管理端鉴权 ============

  it('管理端无 token → 401', async () => {
    const res = await request(app).get('/api/agencies').set('x-test-role', 'none');
    expect(res.status).toBe(401);
  });

  it('管理端 interviewer 角色 → 403（agency:manage 不授权 interviewer）', async () => {
    const res = await request(app).get('/api/agencies').set('x-test-role', 'interviewer');
    expect(res.status).toBe(403);
    expect(res.body.error).toContain('agency:manage');
  });

  it('管理端 hr 角色 → 放行', async () => {
    vi.mocked(prisma.agency.findMany).mockResolvedValue([]);
    const res = await request(app).get('/api/agencies').set('x-test-role', 'hr');
    expect(res.status).toBe(200);
  });
});