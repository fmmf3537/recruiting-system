import { describe, it, expect } from 'vitest';
import request from 'supertest';
import express from 'express';
import { ErrorCode } from '../../src/constants/error-codes';
import { AppError, errorHandler } from '../../src/middleware/errorHandler';

describe('业务错误码', () => {
  const app = express();
  app.use(express.json());

  app.get('/with-code', (_req, _res, next) => {
    next(new AppError('用户不存在', 404, ErrorCode.NOT_FOUND));
  });

  app.get('/prisma-p2002', (_req, _res, next) => {
    const err = Object.assign(new Error('Unique constraint failed'), {
      name: 'PrismaClientKnownRequestError',
      code: 'P2002',
    });
    next(err);
  });

  app.get('/no-code', (_req, _res, next) => {
    next(new AppError('用户不存在', 404));
  });

  app.use(errorHandler);

  it('AppError 抛出时返回正确业务 code（NOT_FOUND）', async () => {
    const res = await request(app).get('/with-code').expect(404);
    expect(res.body.success).toBe(false);
    expect(res.body.error).toBe('用户不存在');
    expect(res.body.code).toBe(ErrorCode.NOT_FOUND);
  });

  it('Prisma P2002 → 409 + code=ALREADY_EXISTS', async () => {
    const res = await request(app).get('/prisma-p2002').expect(409);
    expect(res.body.success).toBe(false);
    expect(res.body.error).toBe('记录已存在');
    expect(res.body.code).toBe(ErrorCode.ALREADY_EXISTS);
  });

  it('未指定 code 时 fallback 到 HTTP statusCode', async () => {
    const res = await request(app).get('/no-code').expect(404);
    expect(res.body.success).toBe(false);
    expect(res.body.error).toBe('用户不存在');
    expect(res.body.code).toBe(404);
  });
});
