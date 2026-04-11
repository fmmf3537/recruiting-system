import type { Candidate, Prisma } from '@prisma/client';
import prisma from '../lib/prisma';
import { AppError } from '../middleware/errorHandler';

// 阶段顺序定义
const STAGE_ORDER = ['入库', '初筛', '复试', '终面', '拟录用', 'Offer', '入职'] as const;
type Stage = (typeof STAGE_ORDER)[number];

// 候选人列表查询参数类型
export interface CandidateListQuery {
  page?: number;
  pageSize?: number;
  keyword?: string;
  source?: string;
  stage?: string;
  status?: string;
  education?: string;
  workYearsMin?: number;
  workYearsMax?: number;
  jobId?: string;
}

// 创建候选人参数类型
export interface CreateCandidateInput {
  name: string;
  phone: string;
  email: string;
  gender: string;
  age?: number;
  education: string;
  school?: string;
  workYears?: number;
  currentCompany?: string;
  currentPosition?: string;
  expectedSalary?: string;
  resumeUrl?: string;
  source: string;
  sourceNote?: string;
  intro?: string;
  jobIds?: string[];
}

// 更新候选人参数类型
export interface UpdateCandidateInput {
  name?: string;
  phone?: string;
  email?: string;
  gender?: string;
  age?: number;
  education?: string;
  school?: string;
  workYears?: number;
  currentCompany?: string;
  currentPosition?: string;
  expectedSalary?: string;
  resumeUrl?: string;
  source?: string;
  sourceNote?: string;
  intro?: string;
}

// 推进阶段参数类型
export interface AdvanceStageInput {
  stage: string;
  status: string;
  rejectReason?: string;
  assigneeId?: string;
  note?: string;
}

// 面试反馈参数类型
export interface InterviewFeedbackInput {
  round: string;
  interviewerName: string;
  interviewTime: string;
  conclusion: string;
  feedbackContent: string;
  rejectReason?: string;
}

// 重复候选人信息
export interface DuplicateCandidate {
  id: string;
  name: string;
  phone: string;
  email: string;
  currentStage: string;
  status: string;
  createdAt: Date;
}

// 创建候选人返回结果（可能包含警告）
export interface CreateCandidateResult {
  candidate: Candidate;
  warning?: string;
  duplicates?: DuplicateCandidate[];
}

// 候选人列表返回类型
export interface CandidateListResult {
  candidates: Array<Candidate & { currentStage?: string; stageStatus?: string }>;
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

/**
 * 候选人服务类
 * 封装所有候选人相关的业务逻辑
 */
export class CandidateService {
  /**
   * 创建候选人（含查重逻辑）
   */
  async createCandidate(
    data: CreateCandidateInput,
    createdById: string
  ): Promise<CreateCandidateResult> {
    // 查重：检查手机号或邮箱是否已存在
    const duplicates: DuplicateCandidate[] = [];

    const existingByPhone = await prisma.candidate.findFirst({
      where: { phone: data.phone },
      include: {
        stageRecords: {
          orderBy: { enteredAt: 'desc' },
          take: 1,
          select: { stage: true, status: true },
        },
      },
    });

    const existingByEmail = await prisma.candidate.findFirst({
      where: { email: data.email },
      include: {
        stageRecords: {
          orderBy: { enteredAt: 'desc' },
          take: 1,
          select: { stage: true, status: true },
        },
      },
    });

    // 收集重复信息
    const seenIds = new Set<string>();
    if (existingByPhone && !seenIds.has(existingByPhone.id)) {
      duplicates.push({
        id: existingByPhone.id,
        name: existingByPhone.name,
        phone: existingByPhone.phone,
        email: existingByPhone.email,
        currentStage: existingByPhone.stageRecords[0]?.stage || '入库',
        status: existingByPhone.stageRecords[0]?.status || 'in_progress',
        createdAt: existingByPhone.createdAt,
      });
      seenIds.add(existingByPhone.id);
    }

    if (existingByEmail && !seenIds.has(existingByEmail.id)) {
      duplicates.push({
        id: existingByEmail.id,
        name: existingByEmail.name,
        phone: existingByEmail.phone,
        email: existingByEmail.email,
        currentStage: existingByEmail.stageRecords[0]?.stage || '入库',
        status: existingByEmail.stageRecords[0]?.status || 'in_progress',
        createdAt: existingByEmail.createdAt,
      });
    }

    // 创建候选人
    const candidate = await prisma.candidate.create({
      data: {
        name: data.name,
        phone: data.phone,
        email: data.email,
        gender: data.gender,
        age: data.age,
        education: data.education,
        school: data.school,
        workYears: data.workYears,
        currentCompany: data.currentCompany,
        currentPosition: data.currentPosition,
        expectedSalary: data.expectedSalary,
        resumeUrl: data.resumeUrl,
        source: data.source,
        sourceNote: data.sourceNote,
        intro: data.intro,
        createdById,
      },
    });

    // 如果有关联职位，创建关联关系
    if (data.jobIds && data.jobIds.length > 0) {
      await prisma.candidateJob.createMany({
        data: data.jobIds.map((jobId) => ({
          candidateId: candidate.id,
          jobId,
        })),
      });
    }

    // 创建初始阶段记录（入库）
    await prisma.stageRecord.create({
      data: {
        candidateId: candidate.id,
        stage: '入库',
        status: 'passed',
        enteredAt: new Date(),
        completedAt: new Date(),
      },
    });

    // 如果有重复，返回警告
    if (duplicates.length > 0) {
      return {
        candidate,
        warning: '发现重复候选人',
        duplicates,
      };
    }

    return { candidate };
  }

  /**
   * 获取候选人列表（支持分页和多条件筛选）
   */
  async getCandidates(query: CandidateListQuery): Promise<CandidateListResult> {
    const {
      page = 1,
      pageSize = 10,
      keyword,
      source,
      stage,
      status,
      education,
      workYearsMin,
      workYearsMax,
      jobId,
    } = query;

    const skip = (page - 1) * pageSize;

    // 构建查询条件
    const where: Prisma.CandidateWhereInput = {};

    // 关键词搜索（姓名、手机号、邮箱）
    if (keyword) {
      where.OR = [
        { name: { contains: keyword, mode: 'insensitive' } },
        { phone: { contains: keyword, mode: 'insensitive' } },
        { email: { contains: keyword, mode: 'insensitive' } },
      ];
    }

    // 来源筛选
    if (source) {
      where.source = source;
    }

    // 学历筛选
    if (education) {
      where.education = education;
    }

    // 工作年限筛选
    if (workYearsMin !== undefined || workYearsMax !== undefined) {
      where.workYears = {};
      if (workYearsMin !== undefined) {
        where.workYears.gte = workYearsMin;
      }
      if (workYearsMax !== undefined) {
        where.workYears.lte = workYearsMax;
      }
    }

    // 按职位筛选
    let candidateIdsByJob: string[] | undefined;
    if (jobId) {
      const candidateJobs = await prisma.candidateJob.findMany({
        where: { jobId },
        select: { candidateId: true },
      });
      candidateIdsByJob = candidateJobs.map((cj) => cj.candidateId);
      where.id = { in: candidateIdsByJob };
    }

    // 并行查询数据和总数
    const [candidates, total] = await Promise.all([
      prisma.candidate.findMany({
        where,
        skip,
        take: pageSize,
        orderBy: { createdAt: 'desc' },
        include: {
          stageRecords: {
            orderBy: { enteredAt: 'desc' },
            take: 1,
            select: { stage: true, status: true },
          },
          candidateJobs: {
            include: {
              job: {
                select: { id: true, title: true },
              },
            },
          },
        },
      }),
      prisma.candidate.count({ where }),
    ]);

    // 过滤阶段和状态（需要在内存中过滤，因为涉及关联表）
    let filteredCandidates = candidates;

    if (stage) {
      filteredCandidates = filteredCandidates.filter(
        (c) => c.stageRecords[0]?.stage === stage
      );
    }

    if (status) {
      filteredCandidates = filteredCandidates.filter(
        (c) => c.stageRecords[0]?.status === status
      );
    }

    // 格式化返回数据
    const formattedCandidates = filteredCandidates.map((candidate) => ({
      ...candidate,
      currentStage: candidate.stageRecords[0]?.stage || '入库',
      stageStatus: candidate.stageRecords[0]?.status || 'in_progress',
    }));

    return {
      candidates: formattedCandidates as unknown as Array<
        Candidate & { currentStage?: string; stageStatus?: string }
      >,
      total,
      page,
      pageSize,
      totalPages: Math.ceil(total / pageSize),
    };
  }

  /**
   * 获取候选人详情（含流程记录、面试反馈、Offer 信息）
   */
  async getCandidateById(
    id: string
  ): Promise<
    Candidate & {
      stageRecords: Array<{
        id: string;
        stage: string;
        status: string;
        rejectReason: string | null;
        assignee: { id: string; name: string } | null;
        enteredAt: Date;
        completedAt: Date | null;
        note: string | null;
      }>;
      interviewFeedbacks: Array<{
        id: string;
        round: string;
        interviewerName: string;
        interviewTime: Date;
        conclusion: string;
        feedbackContent: string;
        rejectReason: string | null;
        createdBy: { id: string; name: string };
      }>;
      offer: {
        id: string;
        salary: string;
        offerDate: Date;
        expectedJoinDate: Date | null;
        result: string;
        joined: boolean;
        actualJoinDate: Date | null;
        note: string | null;
      } | null;
      jobs: Array<{ id: string; title: string }>;
    }
  > {
    const candidate = await prisma.candidate.findUnique({
      where: { id },
      include: {
        stageRecords: {
          orderBy: { enteredAt: 'desc' },
          include: {
            assignee: {
              select: { id: true, name: true },
            },
          },
        },
        interviewFeedbacks: {
          orderBy: { interviewTime: 'desc' },
          include: {
            createdBy: {
              select: { id: true, name: true },
            },
          },
        },
        offer: true,
        candidateJobs: {
          include: {
            job: {
              select: { id: true, title: true },
            },
          },
        },
        createdBy: {
          select: { id: true, name: true, email: true },
        },
      },
    });

    if (!candidate) {
      throw new AppError('候选人不存在', 404);
    }

    return {
      ...candidate,
      jobs: candidate.candidateJobs.map((cj) => cj.job),
    } as unknown as Candidate & {
      stageRecords: Array<{
        id: string;
        stage: string;
        status: string;
        rejectReason: string | null;
        assignee: { id: string; name: string } | null;
        enteredAt: Date;
        completedAt: Date | null;
        note: string | null;
      }>;
      interviewFeedbacks: Array<{
        id: string;
        round: string;
        interviewerName: string;
        interviewTime: Date;
        conclusion: string;
        feedbackContent: string;
        rejectReason: string | null;
        createdBy: { id: string; name: string };
      }>;
      offer: {
        id: string;
        salary: string;
        offerDate: Date;
        expectedJoinDate: Date | null;
        result: string;
        joined: boolean;
        actualJoinDate: Date | null;
        note: string | null;
      } | null;
      jobs: Array<{ id: string; title: string }>;
    };
  }

  /**
   * 更新候选人
   */
  async updateCandidate(
    id: string,
    data: UpdateCandidateInput
  ): Promise<Candidate> {
    // 检查候选人是否存在
    const existingCandidate = await prisma.candidate.findUnique({
      where: { id },
    });

    if (!existingCandidate) {
      throw new AppError('候选人不存在', 404);
    }

    // 如果修改手机号或邮箱，检查是否与其他候选人冲突
    if (data.phone && data.phone !== existingCandidate.phone) {
      const existingByPhone = await prisma.candidate.findFirst({
        where: { phone: data.phone, NOT: { id } },
      });
      if (existingByPhone) {
        throw new AppError('该手机号已被其他候选人使用', 400);
      }
    }

    if (data.email && data.email !== existingCandidate.email) {
      const existingByEmail = await prisma.candidate.findFirst({
        where: { email: data.email, NOT: { id } },
      });
      if (existingByEmail) {
        throw new AppError('该邮箱已被其他候选人使用', 400);
      }
    }

    const updateData: Prisma.CandidateUpdateInput = {};

    if (data.name !== undefined) updateData.name = data.name;
    if (data.phone !== undefined) updateData.phone = data.phone;
    if (data.email !== undefined) updateData.email = data.email;
    if (data.gender !== undefined) updateData.gender = data.gender;
    if (data.age !== undefined) updateData.age = data.age;
    if (data.education !== undefined) updateData.education = data.education;
    if (data.school !== undefined) updateData.school = data.school;
    if (data.workYears !== undefined) updateData.workYears = data.workYears;
    if (data.currentCompany !== undefined)
      updateData.currentCompany = data.currentCompany;
    if (data.currentPosition !== undefined)
      updateData.currentPosition = data.currentPosition;
    if (data.expectedSalary !== undefined)
      updateData.expectedSalary = data.expectedSalary;
    if (data.resumeUrl !== undefined) updateData.resumeUrl = data.resumeUrl;
    if (data.source !== undefined) updateData.source = data.source;
    if (data.sourceNote !== undefined) updateData.sourceNote = data.sourceNote;
    if (data.intro !== undefined) updateData.intro = data.intro;

    const candidate = await prisma.candidate.update({
      where: { id },
      data: updateData,
    });

    return candidate;
  }

  /**
   * 推进候选人流程（必须按顺序验证）
   */
  async advanceStage(
    id: string,
    data: AdvanceStageInput,
    _operatedById: string
  ): Promise<void> {
    const { stage, status, rejectReason, assigneeId, note } = data;

    // 验证候选人是否存在
    const candidate = await prisma.candidate.findUnique({
      where: { id },
      include: {
        stageRecords: {
          orderBy: { enteredAt: 'desc' },
          take: 1,
        },
      },
    });

    if (!candidate) {
      throw new AppError('候选人不存在', 404);
    }

    // 验证阶段是否有效
    const targetStageIndex = STAGE_ORDER.indexOf(stage as Stage);
    if (targetStageIndex === -1) {
      throw new AppError('无效的阶段', 400);
    }

    // 获取当前阶段
    const currentStage =
      candidate.stageRecords[0]?.stage || ('入库' as Stage);
    const currentStageIndex = STAGE_ORDER.indexOf(currentStage as Stage);

    // 验证阶段顺序：只能向前推进，不能回退
    if (targetStageIndex < currentStageIndex) {
      throw new AppError('不能回退到之前的阶段', 400);
    }

    // 如果要推进到新阶段，必须是下一个阶段
    if (targetStageIndex > currentStageIndex && targetStageIndex !== currentStageIndex + 1) {
      throw new AppError(`阶段推进必须按顺序：${STAGE_ORDER.join('→')}`, 400);
    }

    // 验证淘汰时必须填写原因
    if (status === 'rejected' && !rejectReason) {
      throw new AppError('淘汰时必须填写原因', 400);
    }

    // 创建新的阶段记录
    await prisma.stageRecord.create({
      data: {
        candidateId: id,
        stage,
        status,
        rejectReason: rejectReason || null,
        assigneeId: assigneeId || null,
        note: note || null,
        enteredAt: new Date(),
        completedAt: status !== 'in_progress' ? new Date() : null,
      },
    });

    // 如果阶段是 "Offer" 且状态是通过，自动创建 Offer 记录
    if (stage === 'Offer' && status === 'passed') {
      const existingOffer = await prisma.offer.findUnique({
        where: { candidateId: id },
      });

      if (!existingOffer) {
        await prisma.offer.create({
          data: {
            candidateId: id,
            salary: '',
            offerDate: new Date(),
            result: 'pending',
          },
        });
      }
    }

    // 如果阶段是 "入职" 且状态是通过，更新 Offer 记录
    if (stage === '入职' && status === 'passed') {
      const existingOffer = await prisma.offer.findUnique({
        where: { candidateId: id },
      });

      if (existingOffer) {
        await prisma.offer.update({
          where: { candidateId: id },
          data: {
            joined: true,
            actualJoinDate: new Date(),
            result: 'accepted',
          },
        });
      }
    }
  }

  /**
   * 添加面试反馈
   */
  async addInterviewFeedback(
    candidateId: string,
    data: InterviewFeedbackInput,
    createdById: string
  ): Promise<void> {
    // 验证候选人是否存在
    const candidate = await prisma.candidate.findUnique({
      where: { id: candidateId },
    });

    if (!candidate) {
      throw new AppError('候选人不存在', 404);
    }

    // 验证淘汰时必须填写原因
    if (data.conclusion === 'reject' && !data.rejectReason) {
      throw new AppError('淘汰时必须填写原因', 400);
    }

    await prisma.interviewFeedback.create({
      data: {
        candidateId,
        round: data.round,
        interviewerName: data.interviewerName,
        interviewTime: new Date(data.interviewTime),
        conclusion: data.conclusion,
        feedbackContent: data.feedbackContent,
        rejectReason: data.rejectReason || null,
        createdById,
      },
    });
  }

  /**
   * 获取面试反馈列表
   */
  async getInterviewFeedbacks(
    candidateId: string
  ): Promise<
    Array<{
      id: string;
      round: string;
      interviewerName: string;
      interviewTime: Date;
      conclusion: string;
      feedbackContent: string;
      rejectReason: string | null;
      createdBy: { id: string; name: string };
      createdAt: Date;
    }>
  > {
    // 验证候选人是否存在
    const candidate = await prisma.candidate.findUnique({
      where: { id: candidateId },
    });

    if (!candidate) {
      throw new AppError('候选人不存在', 404);
    }

    const feedbacks = await prisma.interviewFeedback.findMany({
      where: { candidateId },
      orderBy: { interviewTime: 'desc' },
      include: {
        createdBy: {
          select: { id: true, name: true },
        },
      },
    });

    return feedbacks as unknown as Array<{
      id: string;
      round: string;
      interviewerName: string;
      interviewTime: Date;
      conclusion: string;
      feedbackContent: string;
      rejectReason: string | null;
      createdBy: { id: string; name: string };
      createdAt: Date;
    }>;
  }

  /**
   * 删除候选人（仅管理员）
   */
  async deleteCandidate(id: string): Promise<void> {
    // 检查候选人是否存在
    const candidate = await prisma.candidate.findUnique({
      where: { id },
    });

    if (!candidate) {
      throw new AppError('候选人不存在', 404);
    }

    // 删除候选人（级联删除关联记录）
    await prisma.candidate.delete({
      where: { id },
    });
  }
}

// 导出单例实例
export const candidateService = new CandidateService();
