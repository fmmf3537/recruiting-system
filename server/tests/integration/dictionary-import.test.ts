process.env.DATABASE_URL =
  process.env.DATABASE_URL || 'postgresql://test:test@localhost:5432/test_db';
process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret-key-for-testing-only-32ch';

import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import express from 'express';
import * as XLSX from 'xlsx';
import { MAX_DICTIONARY_IMPORT_ROWS } from '../../src/utils/xlsx-import';

const mockPrisma = vi.hoisted(() => ({
  dictionary: {
    findMany: vi.fn(),
    findFirst: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    count: vi.fn(),
  },
  operationLog: { create: vi.fn() },
}));

vi.mock('../../src/lib/prisma', () => ({ default: mockPrisma }));

vi.mock('../../src/lib/logger', () => ({
  logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn() },
}));

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
      department: role === 'admin' ? null : '人力资源部',
    };
    next();
  },
  authorize:
    (...roles: string[]) =>
    (req: express.Request, res: express.Response, next: express.NextFunction) => {
      if (!req.user) {
        res.status(401).json({ success: false, error: '未认证' });
        return;
      }
      if (!roles.includes(req.user.role)) {
        res.status(403).json({ success: false, error: '没有权限执行此操作', code: 403 });
        return;
      }
      next();
    },
}));

import dictionaryRoutes from '../../src/routes/dictionaries';
import { errorHandler } from '../../src/middleware/errorHandler';
import { DEFAULT_DICTIONARIES } from '../../src/services/dictionary.service';

function makeApp() {
  const app = express();
  app.use(express.json());
  app.use('/api/dictionaries', dictionaryRoutes);
  app.use(errorHandler);
  return app;
}

function buildXlsx(aoa: unknown[][]): Buffer {
  const ws = XLSX.utils.aoa_to_sheet(aoa);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Sheet1');
  return Buffer.from(XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }) as Buffer);
}

describe('dictionary import 接口集成测试', () => {
  let app: express.Application;

  beforeEach(() => {
    vi.clearAllMocks();
    app = makeApp();
    mockPrisma.dictionary.findMany.mockResolvedValue([]);
    mockPrisma.dictionary.findFirst.mockResolvedValue(null);
    mockPrisma.dictionary.create.mockResolvedValue({ id: 'd1' });
    mockPrisma.operationLog.create.mockResolvedValue({});
  });

  it('无 token → 401', async () => {
    const res = await request(app)
      .post('/api/dictionaries/import')
      .set('x-test-role', 'none');
    expect(res.status).toBe(401);
  });

  it('非 admin → 403', async () => {
    const buf = buildXlsx([
      ['分类', '编码', '名称', '排序', '状态', '备注'],
      ['department', 'tech', '技术部', '1', '启用', ''],
    ]);
    const res = await request(app)
      .post('/api/dictionaries/import')
      .set('x-test-role', 'hr')
      .attach('file', buf, 'dict.xlsx');
    expect(res.status).toBe(403);
    expect(res.body.success).toBe(false);
  });

  it('admin 上传合法 xlsx → 200 + 统计', async () => {
    const buf = buildXlsx([
      ['分类', '编码', '名称', '排序', '状态', '备注'],
      ['# 说明行', '', '', '', '', ''],
      ['department', 'tech', '技术部', '1', '启用', ''],
      ['department', '例：示例编码', '示例', '0', '启用', ''],
    ]);
    const res = await request(app)
      .post('/api/dictionaries/import')
      .set('x-test-role', 'admin')
      .attach('file', buf, 'dict.xlsx');
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.success).toBe(1);
    expect(res.body.data.failed).toBe(0);
    expect(mockPrisma.dictionary.create).toHaveBeenCalledTimes(1);
    expect(mockPrisma.dictionary.count).not.toHaveBeenCalled();
  });

  it('上传非 xlsx → 400 不支持的文件类型', async () => {
    const res = await request(app)
      .post('/api/dictionaries/import')
      .set('x-test-role', 'admin')
      .attach('file', Buffer.from('not-an-excel-file'), 'dict.xlsx');
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/不支持的文件类型/);
  });

  it('超过 1000 行 → 400', async () => {
    const aoa: unknown[][] = [['分类', '编码', '名称', '排序', '状态', '备注']];
    for (let i = 0; i < MAX_DICTIONARY_IMPORT_ROWS + 1; i += 1) {
      aoa.push(['department', `code_${i}`, `名称${i}`, '0', '启用', '']);
    }
    const buf = buildXlsx(aoa);
    const res = await request(app)
      .post('/api/dictionaries/import')
      .set('x-test-role', 'admin')
      .attach('file', buf, 'dict.xlsx');
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('单次导入最多 1000 行');
  });

  it('文件缺失 → 400', async () => {
    const res = await request(app)
      .post('/api/dictionaries/import')
      .set('x-test-role', 'admin');
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/文件缺失/);
  });

  it('GET /categories → 200 返回 string[]', async () => {
    mockPrisma.dictionary.findMany.mockResolvedValue([{ category: 'hr_score_rule' }]);
    const res = await request(app)
      .get('/api/dictionaries/categories')
      .set('x-test-role', 'hr');
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(Array.isArray(res.body.data)).toBe(true);
    expect(res.body.data).toEqual([...res.body.data].sort());
    expect(res.body.data).toContain('department');
    expect(res.body.data).toContain('hr_score_rule');
    expect(res.body.data).toContain('interview_focus_type');
    for (const key of Object.keys(DEFAULT_DICTIONARIES)) {
      expect(res.body.data).toContain(key);
    }
  });
});
