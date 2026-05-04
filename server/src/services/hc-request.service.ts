import prisma from '../lib/prisma';
import { AppError } from '../middleware/errorHandler';
import * as notificationService from './notification.service';
import { jobService } from './job.service';

/**
 * HC编制需求服务
 */

export interface HCRequestListQuery {
  page?: number;
  pageSize?: number;
  status?: string;
  department?: string;
  keyword?: string;
  userId?: string;
  isAdmin?: boolean;
}

export interface CreateHCRequestInput {
  title: string;
  department: string;
  level: string;
  headcount: number;
  urgency: string;
  expectedDate?: string;
  salaryMin?: string;
  salaryMax?: string;
  reason: string;
  reasonNote?: string;
}

export interface UpdateHCRequestInput {
  title?: string;
  department?: string;
  level?: string;
  headcount?: number;
  urgency?: string;
  expectedDate?: string;
  salaryMin?: string;
  salaryMax?: string;
  reason?: string;
  reasonNote?: string;
}

/**
 * 获取编制列表
 */
export async function getHCRequests(query: HCRequestListQuery) {
  const { page = 1, pageSize = 10, status, department, keyword, userId, isAdmin } = query;
  const skip = (page - 1) * pageSize;

  const where: any = {};

  // 非管理员只能看自己的申请
  if (!isAdmin && userId) {
    where.requesterId = userId;
  }

  if (status) where.status = status;
  if (department) where.department = department;
  if (keyword) {
    where.OR = [
      { title: { contains: keyword } },
      { department: { contains: keyword } },
    ];
  }

  const [data, total] = await Promise.all([
    prisma.hCRequest.findMany({
      where,
      include: {
        requester: { select: { id: true, name: true } },
        approver: { select: { id: true, name: true } },
      },
      orderBy: { createdAt: 'desc' },
      skip,
      take: pageSize,
    }),
    prisma.hCRequest.count({ where }),
  ]);

  return { data, total, page, pageSize, totalPages: Math.ceil(total / pageSize) };
}

/**
 * 获取编制详情
 */
export async function getHCRequestById(id: string) {
  const hc = await prisma.hCRequest.findUnique({
    where: { id },
    include: {
      requester: { select: { id: true, name: true } },
      approver: { select: { id: true, name: true } },
    },
  });
  if (!hc) throw new AppError('编制申请不存在', 404);
  return hc;
}

/**
 * 创建编制申请
 */
export async function createHCRequest(data: CreateHCRequestInput, userId: string) {
  return prisma.hCRequest.create({
    data: {
      title: data.title,
      department: data.department,
      level: data.level,
      headcount: data.headcount,
      urgency: data.urgency,
      expectedDate: data.expectedDate ? new Date(data.expectedDate) : null,
      salaryMin: data.salaryMin || null,
      salaryMax: data.salaryMax || null,
      reason: data.reason,
      reasonNote: data.reasonNote || null,
      requesterId: userId,
    },
    include: {
      requester: { select: { id: true, name: true } },
    },
  });
}

/**
 * 更新编制申请（仅 draft/rejected 状态）
 */
export async function updateHCRequest(id: string, data: UpdateHCRequestInput, userId: string) {
  const hc = await getHCRequestById(id);
  if (hc.status !== 'draft' && hc.status !== 'rejected') {
    throw new AppError('仅草稿或已驳回的申请可以编辑', 400);
  }
  if (hc.requesterId !== userId) {
    throw new AppError('仅申请人可以编辑', 403);
  }

  return prisma.hCRequest.update({
    where: { id },
    data: {
      ...(data.title !== undefined && { title: data.title }),
      ...(data.department !== undefined && { department: data.department }),
      ...(data.level !== undefined && { level: data.level }),
      ...(data.headcount !== undefined && { headcount: data.headcount }),
      ...(data.urgency !== undefined && { urgency: data.urgency }),
      ...(data.expectedDate !== undefined && { expectedDate: data.expectedDate ? new Date(data.expectedDate) : null }),
      ...(data.salaryMin !== undefined && { salaryMin: data.salaryMin }),
      ...(data.salaryMax !== undefined && { salaryMax: data.salaryMax }),
      ...(data.reason !== undefined && { reason: data.reason }),
      ...(data.reasonNote !== undefined && { reasonNote: data.reasonNote }),
    },
  });
}

/**
 * 提交审批
 */
export async function submitHCRequest(id: string, userId: string) {
  const hc = await getHCRequestById(id);
  if (hc.status !== 'draft' && hc.status !== 'rejected') {
    throw new AppError('仅草稿或已驳回的申请可提交', 400);
  }
  if (hc.requesterId !== userId) {
    throw new AppError('仅申请人可以提交', 403);
  }

  const updated = await prisma.hCRequest.update({
    where: { id },
    data: { status: 'submitted', submittedAt: new Date() },
  });

  // 通知所有管理员
  const admins = await prisma.user.findMany({
    where: { role: 'admin' },
    select: { id: true },
  });
  void notificationService.createNotificationForUsers(
    {
      title: `新的HC申请待审批：${hc.title}`,
      content: `部门：${hc.department}，职级：${hc.level}，需求人数：${hc.headcount}`,
      type: 'hc_request',
      businessId: id,
      businessType: 'hc_request',
    },
    admins.map((a) => a.id)
  );

  return updated;
}

/**
 * 审批通过（管理员）
 */
export async function approveHCRequest(id: string, approverId: string, note?: string) {
  const hc = await getHCRequestById(id);
  if (hc.status !== 'submitted') {
    throw new AppError('仅审批中的申请可以审批', 400);
  }

  const updated = await prisma.hCRequest.update({
    where: { id },
    data: {
      status: 'approved',
      approverId,
      approvedAt: new Date(),
      approveNote: note || null,
    },
  });

  // 通知申请人
  void notificationService.createNotification({
    recipientId: hc.requesterId,
    title: `HC申请已通过：${hc.title}`,
    content: `您的编制申请「${hc.title}」已通过审批，可以创建职位了`,
    type: 'hc_request',
    businessId: id,
    businessType: 'hc_request',
  }).catch(() => {});

  return updated;
}

/**
 * 驳回（管理员，需填写意见）
 */
export async function rejectHCRequest(id: string, approverId: string, note: string) {
  if (!note) throw new AppError('驳回必须填写审批意见', 400);

  const hc = await getHCRequestById(id);
  if (hc.status !== 'submitted') {
    throw new AppError('仅审批中的申请可以审批', 400);
  }

  const updated = await prisma.hCRequest.update({
    where: { id },
    data: {
      status: 'rejected',
      approverId,
      rejectedAt: new Date(),
      approveNote: note,
    },
  });

  // 通知申请人
  void notificationService.createNotification({
    recipientId: hc.requesterId,
    title: `HC申请已驳回：${hc.title}`,
    content: `${hc.title} 已被驳回，原因：${note}`,
    type: 'hc_request',
    businessId: id,
    businessType: 'hc_request',
  }).catch(() => {});

  return updated;
}

/**
 * 删除编制申请
 */
export async function deleteHCRequest(id: string, userId: string, isAdmin: boolean) {
  const hc = await getHCRequestById(id);
  // 仅草稿和已驳回状态的申请可删除
  if (hc.status !== 'draft' && hc.status !== 'rejected') {
    throw new AppError('仅草稿或已驳回的申请可删除', 400);
  }
  // 申请人或管理员可删除
  if (hc.requesterId !== userId && !isAdmin) {
    throw new AppError('无权限删除', 403);
  }

  await prisma.hCRequest.delete({ where: { id } });
}

/**
 * 一键创建职位（仅 approved 状态）
 */
export async function createJobFromHCRequest(id: string, userId: string) {
  const hc = await getHCRequestById(id);
  if (hc.status !== 'approved') {
    throw new AppError('仅已通过的申请可以创建职位', 400);
  }
  if (hc.createdJobId) {
    throw new AppError('该编制已创建过职位', 400);
  }

  // 创建职位
  const job = await jobService.createJob(
    {
      title: hc.title,
      departments: [hc.department],
      level: hc.level,
      skills: [],
      location: '',
      type: '社招',
      description: hc.reasonNote || '',
      requirements: '',
      status: 'open',
    },
    userId
  );

  // 关联到编制
  await prisma.hCRequest.update({
    where: { id },
    data: { createdJobId: job.id },
  });

  return { job, hcRequestId: id };
}

/**
 * 获取编制统计
 */
export async function getHCStats() {
  const [totalApproved, totalFilled, openRequests] = await Promise.all([
    prisma.hCRequest.count({ where: { status: { in: ['approved', 'fulfilled'] } } }),
    prisma.hCRequest.count({ where: { status: 'fulfilled' } }),
    prisma.hCRequest.count({ where: { status: 'submitted' } }),
  ]);

  return {
    totalApproved,
    totalFilled,
    fulfillmentRate: totalApproved > 0 ? Math.round((totalFilled / totalApproved) * 100) : 0,
    openRequests,
  };
}
