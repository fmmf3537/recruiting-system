import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import express from 'express';

vi.mock('express-rate-limit', () => ({
  default: () => (_req: unknown, _res: unknown, next: () => void) => next(),
}));

vi.mock('../../src/middleware/auth', () => ({
  authenticate: (req: any, _res: any, next: any) => {
    req.user = { userId: 'user-1', email: 'test@test.com', role: 'admin', department: null };
    next();
  },
  authorize: () => (_req: any, _res: any, next: any) => next(),
  getUserDepartment: () => undefined,
}));

vi.mock('../../src/services/candidate.service', () => ({
  candidateService: {
    createCandidate: vi.fn().mockResolvedValue({
      candidate: { id: 'candidate-1', name: 'ok' },
    }),
    getCandidates: vi.fn().mockResolvedValue({
      candidates: [],
      total: 0,
      page: 1,
      pageSize: 10,
      totalPages: 0,
    }),
  },
}));

vi.mock('../../src/services/job.service', () => ({
  jobService: {
    createJob: vi.fn().mockResolvedValue({
      id: 'job-1',
      title: 'ok',
      status: 'open',
      createdById: 'user-1',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }),
  },
}));

vi.mock('../../src/lib/prisma', () => ({
  default: {
    user: { findUnique: vi.fn().mockResolvedValue(null) },
  },
}));

import authRoutes from '../../src/routes/auth';
import candidateRoutes from '../../src/routes/candidates';
import jobRoutes from '../../src/routes/jobs';
import { errorHandler } from '../../src/middleware/errorHandler';
import { candidateService } from '../../src/services/candidate.service';
import { jobService } from '../../src/services/job.service';

function tooLong(n: number): string {
  return 'x'.repeat(n);
}

function expectLengthError(res: request.Response) {
  expect(res.status).toBe(400);
  const msg = JSON.stringify(res.body);
  expect(msg).toMatch(/最大长度|最多|at most|Too big|too_big/i);
}

const validJob = {
  title: '前端工程师',
  departments: ['技术部'],
  level: 'P5',
  skills: ['Vue'],
  location: '北京',
  type: '社招',
  description: '<p>描述</p>',
  requirements: '<p>要求</p>',
};

describe('Zod 字段长度限制', () => {
  let app: express.Application;

  beforeEach(() => {
    app = express();
    app.use(express.json({ limit: '2mb' }));
    app.use('/api/auth', authRoutes);
    app.use('/api/candidates', candidateRoutes);
    app.use('/api/jobs', jobRoutes);
    app.use(errorHandler);
    vi.clearAllMocks();
  });

  it('POST /api/auth/login password 长度 101 → 400', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: 'a@b.com', password: tooLong(101) });
    expectLengthError(res);
  });

  it('POST /api/candidates name 长度 51 → 400', async () => {
    const res = await request(app)
      .post('/api/candidates')
      .send({ name: tooLong(51), phone: '13800138000', email: 'a@b.com' });
    expectLengthError(res);
    expect(candidateService.createCandidate).not.toHaveBeenCalled();
  });

  it('GET /api/candidates keyword 长度 101 → 400', async () => {
    const res = await request(app)
      .get('/api/candidates')
      .query({ keyword: tooLong(101) });
    expectLengthError(res);
    expect(candidateService.getCandidates).not.toHaveBeenCalled();
  });

  it('POST /api/jobs title 长度 201 → 400', async () => {
    const res = await request(app)
      .post('/api/jobs')
      .send({ ...validJob, title: tooLong(201) });
    expectLengthError(res);
    expect(jobService.createJob).not.toHaveBeenCalled();
  });

  it('正常长度（边界值）仍然通过', async () => {
    const loginRes = await request(app)
      .post('/api/auth/login')
      .send({ email: 'a@b.com', password: tooLong(100) });
    expect(loginRes.status).not.toBe(400);

    const nameRes = await request(app)
      .post('/api/candidates')
      .send({ name: tooLong(50), phone: '13800138000' });
    expect(nameRes.status).toBe(201);

    const keywordRes = await request(app)
      .get('/api/candidates')
      .query({ keyword: tooLong(100) });
    expect(keywordRes.status).not.toBe(400);

    const titleRes = await request(app)
      .post('/api/jobs')
      .send({ ...validJob, title: tooLong(200) });
    expect(titleRes.status).toBe(201);

    const local = 'a'.repeat(64);
    const domain = `${'b'.repeat(186)}.co`;
    const email254 = `${local}@${domain}`;
    expect(email254.length).toBe(254);
    const emailOk = await request(app)
      .post('/api/auth/login')
      .send({ email: email254, password: 'abcdef' });
    expect(emailOk.status).not.toBe(400);

    const email255 = `${email254}x`;
    expect(email255.length).toBe(255);
    const emailBad = await request(app)
      .post('/api/auth/login')
      .send({ email: email255, password: 'abcdef' });
    expectLengthError(emailBad);
  });
});
