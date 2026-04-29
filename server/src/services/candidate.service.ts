import type { Candidate, WorkHistory } from '@prisma/client';
import { Prisma } from '@prisma/client';
import prisma from '../lib/prisma';
import { clearStatsCache, getFromCache, setCache, clearListCache } from '../lib/redis';
import { AppError } from '../middleware/errorHandler';
import { sanitizeHtml } from '../utils/sanitize';
import { autoSendEmailOnStageTransition } from './email-auto-sender.service';
import * as notificationService from './notification.service';
import {
  STAGE_ORDER,
  DEFAULT_STAGE,
  DEFAULT_STAGE_STATUS,
} from '../constants';
import type { Stage } from '../constants';
import { checkDuplicate, isPhoneUsed, isEmailUsed } from './duplicate-checker.service';

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
  tagIds?: string[];
  hasNoJob?: boolean;
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
  referrer?: string;
  intro?: string;
  jobIds?: string[];
  tagIds?: string[];
  skills?: string[];
  workHistory?: Array<{
    company: string;
    position: string;
    startDate?: string;
    endDate?: string;
    description?: string;
  }>;
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
  referrer?: string;
  intro?: string;
  tagIds?: string[];
  skills?: string[];
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
    const { duplicates } = await checkDuplicate(data.phone, data.email);

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
        referrer: data.referrer,
        intro: data.intro,
        skills: data.skills || [],
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

    // 如果有标签，创建标签关联
    if (data.tagIds && data.tagIds.length > 0) {
      await prisma.candidateTag.createMany({
        data: data.tagIds.map((tagId) => ({
          candidateId: candidate.id,
          tagId,
        })),
        skipDuplicates: true,
      });
    }

    // 创建初始阶段记录（入库）
    await prisma.stageRecord.create({
      data: {
        candidateId: candidate.id,
        stage: DEFAULT_STAGE,
        status: 'passed',
        enteredAt: new Date(),
        completedAt: new Date(),
      },
    });

    // 如果有工作经历，创建工作经历记录
    if (data.workHistory && data.workHistory.length > 0) {
      // 过滤无效日期
      const validWorkHistory = data.workHistory.filter((w) => {
        if (!w.company || !w.position) return false;
        if (w.startDate && isNaN(Date.parse(w.startDate))) return false;
        if (w.endDate && isNaN(Date.parse(w.endDate))) return false;
        return true;
      });

      if (validWorkHistory.length > 0) {
        await prisma.workHistory.createMany({
          data: validWorkHistory.map((w) => ({
            candidateId: candidate.id,
            company: w.company,
            position: w.position,
            startDate: w.startDate ? new Date(w.startDate) : null,
            endDate: w.endDate ? new Date(w.endDate) : null,
            description: w.description,
          })),
        });
      }
    }

    await clearStatsCache();
    await clearListCache('candidates:list:*');
    await clearListCache('candidates:activities');

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
    const cacheKey = `candidates:list:${JSON.stringify(query)}`;
    const cached = await getFromCache<CandidateListResult>(cacheKey);
    if (cached) {
      return cached;
    }

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
      tagIds,
      hasNoJob,
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

    // 人才库筛选（未关联职位的候选人）
    if (hasNoJob) {
      const candidatesWithJobs = await prisma.candidateJob.findMany({
        select: { candidateId: true },
        distinct: ['candidateId'],
      });
      const candidatesWithJobIds = candidatesWithJobs.map((cj) => cj.candidateId);
      where.id = {
        ...((where.id as Prisma.StringFilter) || {}),
        notIn: candidatesWithJobIds,
      };
    }

    // 标签筛选（候选人必须拥有所有指定标签）
    let candidateIdsByTags: string[] | undefined;
    if (tagIds && tagIds.length > 0) {
      const candidateTags = await prisma.candidateTag.groupBy({
        by: ['candidateId'],
        where: { tagId: { in: tagIds } },
        _count: { tagId: true },
        having: { tagId: { _count: { equals: tagIds.length } } },
      });
      candidateIdsByTags = candidateTags.map((ct) => ct.candidateId);

      if (candidateIdsByTags.length === 0) {
        return {
          candidates: [],
          total: 0,
          page,
          pageSize,
          totalPages: 0,
        };
      }

      const existingFilter = (where.id as Prisma.StringFilter)?.in as string[] | undefined;
      if (existingFilter) {
        const intersection = existingFilter.filter((id) => candidateIdsByTags!.includes(id));
        if (intersection.length === 0) {
          return {
            candidates: [],
            total: 0,
            page,
            pageSize,
            totalPages: 0,
          };
        }
        where.id = { in: intersection };
      } else {
        where.id = { in: candidateIdsByTags };
      }
    }

    // 阶段/状态筛选（基于最新阶段记录，下推到数据库）
    if (stage || status) {
      const stageWhere = stage ? Prisma.sql`AND stage = ${stage}` : Prisma.empty;
      const statusWhere = status ? Prisma.sql`AND status = ${status}` : Prisma.empty;

      const matched = await prisma.$queryRaw<{ candidateId: string }[]>`
        SELECT "candidateId" FROM (
          SELECT "candidateId", stage, status,
                 ROW_NUMBER() OVER (PARTITION BY "candidateId" ORDER BY "enteredAt" DESC) as rn
          FROM "stage_record"
        ) t WHERE rn = 1 ${stageWhere} ${statusWhere}
      `;

      const matchedIds = matched.map((m) => m.candidateId);

      if (matchedIds.length === 0) {
        return {
          candidates: [],
          total: 0,
          page,
          pageSize,
          totalPages: 0,
        };
      }

      if (candidateIdsByJob) {
        const intersection = candidateIdsByJob.filter((id) => matchedIds.includes(id));
        if (intersection.length === 0) {
          return {
            candidates: [],
            total: 0,
            page,
            pageSize,
            totalPages: 0,
          };
        }
        where.id = { in: intersection };
      } else {
        where.id = { in: matchedIds };
      }
    }

    // 并行查询数据和总数（主查询不再嵌套 include，减少 JOIN 开销）
    const [candidates, total] = await Promise.all([
      prisma.candidate.findMany({
        where,
        skip,
        take: pageSize,
        orderBy: { createdAt: 'desc' },
      }),
      prisma.candidate.count({ where }),
    ]);

    const candidateIds = candidates.map((c) => c.id);

    // 批量查询最新阶段记录、关联职位和标签（避免 Prisma 嵌套 JOIN 性能问题）
    const [stageRecords, candidateJobs, candidateTags] = await Promise.all([
      prisma.stageRecord.findMany({
        where: { candidateId: { in: candidateIds } },
        orderBy: { enteredAt: 'desc' },
        select: { candidateId: true, stage: true, status: true },
      }),
      prisma.candidateJob.findMany({
        where: { candidateId: { in: candidateIds } },
        include: {
          job: {
            select: { id: true, title: true },
          },
        },
      }),
      prisma.candidateTag.findMany({
        where: { candidateId: { in: candidateIds } },
        include: { tag: true },
      }),
    ]);

    const stageMap = new Map<string, { stage: string; status: string }>();
    for (const sr of stageRecords) {
      if (!stageMap.has(sr.candidateId)) {
        stageMap.set(sr.candidateId, sr);
      }
    }

    const jobsMap = new Map<string, typeof candidateJobs>();
    for (const cj of candidateJobs) {
      if (!jobsMap.has(cj.candidateId)) {
        jobsMap.set(cj.candidateId, []);
      }
      jobsMap.get(cj.candidateId)!.push(cj);
    }

    const tagsMap = new Map<string, typeof candidateTags>();
    for (const ct of candidateTags) {
      if (!tagsMap.has(ct.candidateId)) {
        tagsMap.set(ct.candidateId, []);
      }
      tagsMap.get(ct.candidateId)!.push(ct);
    }

    // 格式化返回数据
    const formattedCandidates = candidates.map((candidate) => ({
      ...candidate,
      currentStage: stageMap.get(candidate.id)?.stage || '入库',
      stageStatus: stageMap.get(candidate.id)?.status || 'in_progress',
      candidateJobs: jobsMap.get(candidate.id) || [],
      tags: tagsMap.get(candidate.id)?.map((ct) => ct.tag) || [],
    }));

    const result = {
      candidates: formattedCandidates as unknown as Array<
        Candidate & { currentStage?: string; stageStatus?: string }
      >,
      total,
      page,
      pageSize,
      totalPages: Math.ceil(total / pageSize),
    };

    await setCache(cacheKey, result, 30);
    return result;
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
        workHistories: {
          orderBy: { startDate: 'desc' },
        },
        candidateTags: {
          include: { tag: true },
        },
      },
    });

    if (!candidate) {
      throw new AppError('候选人不存在', 404);
    }

    return {
      ...candidate,
      currentStage: candidate.stageRecords[0]?.stage || DEFAULT_STAGE,
      stageStatus: candidate.stageRecords[0]?.status || DEFAULT_STAGE_STATUS,
      jobs: candidate.candidateJobs.map((cj) => cj.job),
      tags: candidate.candidateTags.map((ct) => ct.tag),
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
      workHistories: Array<{
        id: string;
        company: string;
        position: string;
        startDate: Date | null;
        endDate: Date | null;
        description: string | null;
      }>;
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
      const phoneUsed = await isPhoneUsed(data.phone, id);
      if (phoneUsed) {
        throw new AppError('该手机号已被其他候选人使用', 400);
      }
    }

    if (data.email && data.email !== existingCandidate.email) {
      const emailUsed = await isEmailUsed(data.email, id);
      if (emailUsed) {
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
    if (data.referrer !== undefined) updateData.referrer = data.referrer;
    if (data.intro !== undefined) updateData.intro = data.intro;
    if (data.skills !== undefined) updateData.skills = data.skills;

    const candidate = await prisma.candidate.update({
      where: { id },
      data: updateData,
    });

    // 如果传了标签，更新标签关联
    if (data.tagIds !== undefined) {
      await prisma.candidateTag.deleteMany({ where: { candidateId: id } });
      if (data.tagIds.length > 0) {
        await prisma.candidateTag.createMany({
          data: data.tagIds.map((tagId) => ({ candidateId: id, tagId })),
          skipDuplicates: true,
        });
      }
    }

    await clearListCache('candidates:list:*');
    return candidate;
  }

  /**
   * 推进候选人流程（必须按顺序验证）
   */
  async advanceStage(
    id: string,
    data: AdvanceStageInput,
    operatedById: string
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
      candidate.stageRecords[0]?.stage || (DEFAULT_STAGE as Stage);
    const currentStageIndex = STAGE_ORDER.indexOf(currentStage as Stage);
    const currentStatus = candidate.stageRecords[0]?.status || DEFAULT_STAGE_STATUS;

    // 检查是否为 admin
    const user = await prisma.user.findUnique({ where: { id: operatedById } });
    const isAdmin = user?.role === 'admin';

    // 非 admin 用户验证阶段顺序：只能向前推进，不能回退
    if (!isAdmin) {
      if (targetStageIndex < currentStageIndex) {
        throw new AppError('不能回退到之前的阶段', 400);
      }

      // 如果目标阶段与当前阶段相同，只更新状态
      if (targetStageIndex === currentStageIndex) {
        if (!candidate.stageRecords[0]) {
          throw new AppError('当前阶段记录不存在', 400);
        }
        // 验证淘汰时必须填写原因
        if (status === 'rejected' && !rejectReason) {
          throw new AppError('淘汰时必须填写原因', 400);
        }
        // 不能从非进行中状态改成进行中
        if (currentStatus !== 'in_progress' && status === 'in_progress') {
          throw new AppError('不能将已完成的阶段改回进行中', 400);
        }
        // 更新当前阶段记录的状态
        await prisma.stageRecord.update({
          where: { id: candidate.stageRecords[0].id },
          data: {
            status,
            rejectReason: rejectReason || null,
            note: note || null,
            completedAt: status !== 'in_progress' ? new Date() : null,
          },
        });
        await clearListCache('candidates:activities');
        return;
      }

      // 如果要推进到新阶段，必须是下一个阶段
      if (targetStageIndex > currentStageIndex && targetStageIndex !== currentStageIndex + 1) {
        throw new AppError(`阶段推进必须按顺序：${STAGE_ORDER.join('→')}`, 400);
      }
    }

    // 验证淘汰时必须填写原因
    if (status === 'rejected' && !rejectReason) {
      throw new AppError('淘汰时必须填写原因', 400);
    }

    // 如果目标阶段与当前阶段相同（admin bypass 场景），只更新状态
    if (targetStageIndex === currentStageIndex) {
      if (!candidate.stageRecords[0]) {
        throw new AppError('当前阶段记录不存在', 400);
      }
      await prisma.stageRecord.update({
        where: { id: candidate.stageRecords[0].id },
        data: {
          status,
          rejectReason: rejectReason || null,
          note: note || null,
          completedAt: status !== 'in_progress' ? new Date() : null,
        },
      });
      await clearListCache('candidates:activities');
      return;
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

    // 异步触发自动化邮件（发后即忘，失败不阻塞流程）
    void autoSendEmailOnStageTransition(id, stage, status, operatedById);

    // 异步发送阶段推进通知
    const statusLabel = status === 'passed' ? '通过' : status === 'rejected' ? '淘汰' : '进行中';
    void notificationService.createNotification({
      recipientId: candidate.createdById,
      title: `候选人「${candidate.name}」已进入${stage}阶段`,
      content: `当前状态：${statusLabel}` + (rejectReason ? `，淘汰原因：${rejectReason}` : ''),
      type: 'stage_advance',
      businessId: id,
      businessType: 'candidate',
    }).catch((e) => console.error('[Notification] 阶段通知发送失败:', e));

    await clearStatsCache();
    await clearListCache('candidates:list:*');
    await clearListCache('candidates:activities');
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
        feedbackContent: sanitizeHtml(data.feedbackContent),
        rejectReason: data.rejectReason || null,
        createdById,
      },
    });

    await clearStatsCache();
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
   * 获取面试列表（直接查询 interview_feedback，支持分页和筛选）
   */
  async getInterviewList(query: InterviewListQuery): Promise<InterviewListResult> {
    const { page = 1, pageSize = 10, keyword, round, conclusion, startDate, endDate } = query;
    const skip = (page - 1) * pageSize;

    const keywordWhere = keyword ? Prisma.sql`AND c.name ILIKE ${`%${keyword}%`}` : Prisma.empty;
    const roundWhere = round ? Prisma.sql`AND i.round = ${round}` : Prisma.empty;
    const conclusionWhere = conclusion ? Prisma.sql`AND i.conclusion = ${conclusion}` : Prisma.empty;
    const dateWhere = (startDate && endDate)
      ? Prisma.sql`AND i."interviewTime" >= ${new Date(startDate)} AND i."interviewTime" <= ${new Date(endDate)}`
      : Prisma.empty;

    const interviews = await prisma.$queryRaw<InterviewListItem[]>`
      SELECT
        i.id,
        i.round,
        i."interviewerName",
        i."interviewTime",
        i.conclusion,
        i."feedbackContent",
        i."rejectReason",
        i."createdById",
        u.name as "createdByName",
        i."createdAt",
        c.id as "candidateId",
        c.name as "candidateName",
        COALESCE(
          (SELECT j.title FROM "candidate_job" cj JOIN "job" j ON cj."jobId" = j.id WHERE cj."candidateId" = c.id LIMIT 1),
          '未知职位'
        ) as "jobTitle"
      FROM "interview_feedback" i
      JOIN "candidate" c ON i."candidateId" = c.id
      LEFT JOIN "user" u ON i."createdById" = u.id
      WHERE 1=1 ${keywordWhere} ${roundWhere} ${conclusionWhere} ${dateWhere}
      ORDER BY i."interviewTime" DESC
      LIMIT ${pageSize} OFFSET ${skip}
    `;

    const countResult = await prisma.$queryRaw<{ count: number }[]>`
      SELECT COUNT(*)::int as count
      FROM "interview_feedback" i
      JOIN "candidate" c ON i."candidateId" = c.id
      WHERE 1=1 ${keywordWhere} ${roundWhere} ${conclusionWhere} ${dateWhere}
    `;

    const total = countResult[0]?.count || 0;

    return {
      interviews,
      total,
      page,
      pageSize,
      totalPages: Math.ceil(total / pageSize),
    };
  }

  /**
   * 删除候选人（只能删除自己创建的）
   */
  async deleteCandidate(id: string, userId: string, isAdmin: boolean): Promise<void> {
    // 检查候选人是否存在
    const candidate = await prisma.candidate.findUnique({
      where: { id },
    });

    if (!candidate) {
      throw new AppError('候选人不存在', 404);
    }

    // 检查权限：只有创建者或管理员可以删除
    if (candidate.createdById !== userId && !isAdmin) {
      throw new AppError('无权删除此候选人', 403);
    }

    // 删除候选人（级联删除关联记录）
    await prisma.candidate.delete({
      where: { id },
    });

    await clearStatsCache();
    await clearListCache('candidates:activities');
    await clearListCache('candidates:list:*');
  }

  /**
   * 创建工作经历
   */
  async createWorkHistory(data: CreateWorkHistoryInput): Promise<WorkHistory> {
    const { candidateId, ...historyData } = data;

    const candidate = await prisma.candidate.findUnique({
      where: { id: candidateId },
    });

    if (!candidate) {
      throw new AppError('候选人不存在', 404);
    }

    return prisma.workHistory.create({
      data: {
        candidateId,
        company: historyData.company,
        position: historyData.position,
        startDate: historyData.startDate ? new Date(historyData.startDate) : null,
        endDate: historyData.endDate ? new Date(historyData.endDate) : null,
        description: historyData.description,
      },
    });
  }

  /**
   * 批量创建工作经历
   */
  async createWorkHistories(
    candidateId: string,
    histories: Array<{
      company: string;
      position: string;
      startDate?: string;
      endDate?: string;
      description?: string;
    }>
  ): Promise<WorkHistory[]> {
    if (histories.length === 0) {
      return [];
    }

    const candidate = await prisma.candidate.findUnique({
      where: { id: candidateId },
    });

    if (!candidate) {
      throw new AppError('候选人不存在', 404);
    }

    await prisma.workHistory.createMany({
      data: histories.map((h) => ({
        candidateId,
        company: h.company,
        position: h.position,
        startDate: h.startDate ? new Date(h.startDate) : null,
        endDate: h.endDate ? new Date(h.endDate) : null,
        description: h.description,
      })),
    });

    return prisma.workHistory.findMany({
      where: { candidateId },
      orderBy: { startDate: 'desc' },
    });
  }

  /**
   * 获取候选人的工作经历列表
   */
  async getWorkHistories(candidateId: string): Promise<WorkHistory[]> {
    return prisma.workHistory.findMany({
      where: { candidateId },
      orderBy: { startDate: 'desc' },
    });
  }

  /**
   * 更新工作经历
   */
  async updateWorkHistory(
    id: string,
    data: Partial<{
      company: string;
      position: string;
      startDate: string;
      endDate: string;
      description: string;
    }>
  ): Promise<WorkHistory> {
    const history = await prisma.workHistory.findUnique({
      where: { id },
    });

    if (!history) {
      throw new AppError('工作经历不存在', 404);
    }

    return prisma.workHistory.update({
      where: { id },
      data: {
        ...data,
        startDate: data.startDate ? new Date(data.startDate) : undefined,
        endDate: data.endDate ? new Date(data.endDate) : undefined,
      },
    });
  }

  /**
   * 删除工作经历
   */
  async deleteWorkHistory(id: string): Promise<void> {
    const history = await prisma.workHistory.findUnique({
      where: { id },
    });

    if (!history) {
      throw new AppError('工作经历不存在', 404);
    }

    await prisma.workHistory.delete({
      where: { id },
    });
  }

  /**
   * 获取近期候选人动态
   */
  async getRecentActivities(limit = 20): Promise<
    Array<{
      id: string;
      candidateName: string;
      action: string;
      stage: string;
      stageText: string;
      time: string;
    }>
  > {
    let stageRecords: Array<{
      id: string;
      stage: string;
      status: string;
      updatedAt: Date;
      candidate: { name: string } | null;
    }> = [];
    let offers: Array<{
      id: string;
      result: string;
      joined: boolean;
      updatedAt: Date;
      candidate: { name: string } | null;
    }> = [];

    // 1. 查询阶段记录（包含入库，覆盖候选人创建和阶段推进）
    try {
      stageRecords = await prisma.stageRecord.findMany({
        orderBy: { updatedAt: 'desc' },
        take: limit,
        select: {
          id: true,
          stage: true,
          status: true,
          updatedAt: true,
          candidate: { select: { name: true } },
        },
      });
      console.log('[getRecentActivities] stageRecords count:', stageRecords.length);
    } catch (err) {
      console.error('[getRecentActivities] stageRecords query failed:', err);
    }

    // 2. 查询 Offer 作为补充（直接接受或入职）
    try {
      offers = await prisma.offer.findMany({
        where: {
          OR: [{ result: 'accepted' }, { joined: true }],
        },
        orderBy: { updatedAt: 'desc' },
        take: limit,
        select: {
          id: true,
          result: true,
          joined: true,
          updatedAt: true,
          candidate: { select: { name: true } },
        },
      });
      console.log('[getRecentActivities] offers count:', offers.length);
    } catch (err) {
      console.error('[getRecentActivities] offers query failed:', err);
    }

    // 映射为统一的活动格式
    const stageActivities = stageRecords.map((s) => {
      const stageMap: Record<string, { action: string; stageKey: string }> = {
        入库: { action: '简历入库', stageKey: 'screening' },
        初筛: { action: s.status === 'passed' ? '初筛通过' : s.status === 'rejected' ? '初筛未通过' : '进入初筛阶段', stageKey: 'screening' },
        复试: { action: s.status === 'passed' ? '复试通过' : s.status === 'rejected' ? '复试未通过' : '进入复试阶段', stageKey: 'interview' },
        终面: { action: s.status === 'passed' ? '终面通过' : s.status === 'rejected' ? '终面未通过' : '进入终面阶段', stageKey: 'interview' },
        拟录用: { action: s.status === 'passed' ? '拟录用通过' : s.status === 'rejected' ? '拟录用未通过' : '进入拟录用阶段', stageKey: 'offer' },
        Offer: { action: s.status === 'passed' ? 'Offer 审批通过' : s.status === 'rejected' ? 'Offer 审批未通过' : '进入 Offer 阶段', stageKey: 'offer' },
        入职: { action: s.status === 'passed' ? '已入职' : s.status === 'rejected' ? '入职取消' : '进入入职阶段', stageKey: 'hired' },
      };
      const mapped = stageMap[s.stage] || { action: `${s.stage}更新`, stageKey: 'screening' };
      return {
        id: `s-${s.id}`,
        candidateName: s.candidate?.name ?? '未知候选人',
        action: mapped.action,
        stage: mapped.stageKey,
        stageText: s.stage,
        time: s.updatedAt.toISOString(),
      };
    });

    const offerActivities = offers.map((o) => ({
      id: `o-${o.id}`,
      candidateName: o.candidate?.name ?? '未知候选人',
      action: o.joined ? '已入职' : '接受 Offer',
      stage: o.joined ? 'hired' : 'offer',
      stageText: o.joined ? '入职' : 'Offer',
      time: o.updatedAt.toISOString(),
    }));

    // 合并并按时间倒序排列，取前 limit 条
    const allActivities = [...stageActivities, ...offerActivities];
    allActivities.sort((a, b) => new Date(b.time).getTime() - new Date(a.time).getTime());
    console.log('[getRecentActivities] total returned:', allActivities.slice(0, limit).length);
    return allActivities.slice(0, limit);
  }

  /**
   * 批量推进候选人阶段
   */
  async batchAdvanceStage(
    candidateIds: string[],
    data: AdvanceStageInput,
    operatedById: string
  ): Promise<{ success: number; failed: number }> {
    let success = 0;
    let failed = 0;

    for (const id of candidateIds) {
      try {
        await this.advanceStage(id, data, operatedById);
        success++;
      } catch (error) {
        console.error(`[BatchAdvance] 候选人 ${id} 推进失败:`, error);
        failed++;
      }
    }

    return { success, failed };
  }

  /**
   * 批量设置候选人标签
   */
  async batchSetTags(
    candidateIds: string[],
    tagIds: string[]
  ): Promise<{ success: number; failed: number }> {
    let success = 0;
    let failed = 0;

    for (const candidateId of candidateIds) {
      try {
        // 先删除旧标签，再创建新标签
        await prisma.candidateTag.deleteMany({ where: { candidateId } });
        if (tagIds.length > 0) {
          await prisma.candidateTag.createMany({
            data: tagIds.map((tagId) => ({ candidateId, tagId })),
            skipDuplicates: true,
          });
        }
        success++;
      } catch (error) {
        console.error(`[BatchSetTags] 候选人 ${candidateId} 设置标签失败:`, error);
        failed++;
      }
    }

    await clearListCache('candidates:list:*');
    return { success, failed };
  }
}

// 导出单例实例
export const candidateService = new CandidateService();

// 面试列表查询参数
export interface InterviewListQuery {
  page?: number;
  pageSize?: number;
  keyword?: string;
  round?: string;
  conclusion?: string;
  startDate?: string;
  endDate?: string;
}

// 面试列表项
export interface InterviewListItem {
  id: string;
  round: string;
  interviewerName: string;
  interviewTime: Date;
  conclusion: string | null;
  feedbackContent: string | null;
  rejectReason: string | null;
  createdById: string;
  createdByName: string | null;
  createdAt: Date;
  candidateName: string;
  candidateId: string;
  jobTitle: string;
}

// 面试列表返回类型
export interface InterviewListResult {
  interviews: InterviewListItem[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

// WorkHistory 相关类型
export interface CreateWorkHistoryInput {
  candidateId: string;
  company: string;
  position: string;
  startDate?: string;
  endDate?: string;
  description?: string;
}
