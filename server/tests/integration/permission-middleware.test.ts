import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import express from 'express';
import offerRoutes from '../../src/routes/offers';
import { errorHandler } from '../../src/middleware/errorHandler';
import { offerService } from '../../src/services/offer.service';
import { deleteRole } from '../../src/services/rbac.service';

vi.mock('../../src/services/offer.service', () => ({
  offerService: {
    approveOffer: vi.fn(),
  },
}));

const mockPrisma = vi.hoisted(() => ({
  userRoleBinding: {
    findMany: vi.fn(),
  },
  role: {
    findUnique: vi.fn(),
    delete: vi.fn(),
  },
}));

vi.mock('../../src/lib/prisma', () => ({
  default: mockPrisma,
}));

vi.mock('../../src/lib/redis', () => ({
  redis: { del: vi.fn().mockResolvedValue(1) },
  getFromCache: vi.fn().mockResolvedValue(null),
  setCache: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../../src/middleware/auth', () => ({
  authenticate: (req: express.Request, _res: express.Response, next: express.NextFunction) => {
    const header = req.headers.authorization;
    if (!header) {
      next();
      return;
    }
    const role = req.headers['x-test-role'] === 'member' ? 'member' : 'admin';
    req.user = {
      userId: 'user-1',
      email: 'test@test.com',
      role,
      department: role === 'member' ? '技术部' : null,
    };
    next();
  },
}));

describe('permission 中间件', () => {
  let app: express.Application;

  beforeEach(() => {
    app = express();
    app.use(express.json());
    app.use('/api/offers', offerRoutes);
    app.delete(
      '/api/roles/:id',
      (req, res, next) => {
        const header = req.headers.authorization;
        if (!header) {
          next();
          return;
        }
        const role = req.headers['x-test-role'] === 'member' ? 'member' : 'admin';
        req.user = {
          userId: 'user-1',
          email: 'test@test.com',
          role,
          department: null,
        };
        next();
      },
      async (req, res, next) => {
        try {
          await deleteRole(req.params.id);
          res.json({ success: true });
        } catch (err) {
          next(err);
        }
      }
    );
    app.use(errorHandler);
    vi.clearAllMocks();
    mockPrisma.userRoleBinding.findMany.mockResolvedValue([]);
  });

  it('member 用户访问 POST /api/offers/:id/approve 返回 403（没有权限：offer:approve）', async () => {
    const res = await request(app)
      .post('/api/offers/clh12345678901234567890123/approve')
      .set('Authorization', 'Bearer member-token')
      .set('x-test-role', 'member')
      .send({ note: '同意' })
      .expect(403);

    expect(res.body.error).toBe('没有权限：offer:approve');
    expect(offerService.approveOffer).not.toHaveBeenCalled();
  });

  it('admin 用户访问同样接口通过', async () => {
    vi.mocked(offerService.approveOffer).mockResolvedValue({
      id: 'offer-1',
      status: 'approved',
    } as never);

    const res = await request(app)
      .post('/api/offers/clh12345678901234567890123/approve')
      .set('Authorization', 'Bearer admin-token')
      .send({ note: '同意' })
      .expect(200);

    expect(res.body.success).toBe(true);
    expect(offerService.approveOffer).toHaveBeenCalled();
  });

  it('无 token 访问返回 401（未认证）', async () => {
    const res = await request(app)
      .post('/api/offers/clh12345678901234567890123/approve')
      .send({ note: '同意' })
      .expect(401);

    expect(res.body.error).toBe('未认证');
  });

  it('普通权限用户调 deleteRole(/api/roles/admin) 返回 400（系统角色 [admin] 不可删除）', async () => {
    mockPrisma.role.findUnique.mockResolvedValue({
      id: 'admin',
      code: 'admin',
      isSystem: true,
    });

    const res = await request(app)
      .delete('/api/roles/admin')
      .set('Authorization', 'Bearer member-token')
      .set('x-test-role', 'member')
      .expect(400);

    expect(res.body.error).toBe('系统角色 [admin] 不可删除');
    expect(mockPrisma.role.delete).not.toHaveBeenCalled();
  });
});
