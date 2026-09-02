import type { Request, Response, NextFunction } from 'express';
import { asyncHandler, AppError } from '../middleware/errorHandler';
import {
  getReferralInfo,
  submitReferral,
  getSubmitSuccessResponse,
} from '../services/referral.service';

// F5-S：猎头推荐公开控制器（薄壳）
// 仅做参数取用 → 调 service → 统一响应格式
// GET / POST 都不过 authenticate，由路由层配独立限流器

class ReferralController {
  /** GET /api/referral/:token —— 公开落地页 */
  getInfo = asyncHandler(async (req: Request, res: Response, _next: NextFunction) => {
    const { token } = req.params;
    const info = await getReferralInfo(token);
    res.json({ success: true, data: info });
  });

  /** POST /api/referral/:token —— 公开提交推荐（multer 已处理 file 字段） */
  submit = asyncHandler(async (req: Request, res: Response, _next: NextFunction) => {
    const { token } = req.params;
    if (!req.file) {
      throw new AppError('请上传简历文件', 400);
    }
    // multer 表单字段全部是字符串，zod 在路由层已完成校验，service 内可直接使用
    await submitReferral(token, req.body, req.file);
    // B1 决策：固定文案，不返回 candidateId，不回显是否重复
    res.json(getSubmitSuccessResponse());
  });
}

export const referralController = new ReferralController();