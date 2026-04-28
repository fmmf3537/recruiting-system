// ==================== 招聘阶段 ====================
export const STAGE_ORDER = ['入库', '初筛', '复试', '终面', '拟录用', 'Offer', '入职'] as const;
export type Stage = (typeof STAGE_ORDER)[number];

// ==================== 阶段状态 ====================
export const STAGE_STATUS = ['in_progress', 'passed', 'rejected'] as const;
export type StageStatus = (typeof STAGE_STATUS)[number];

// ==================== 面试轮次 ====================
export const INTERVIEW_ROUNDS = ['初试', '复试', '终面'] as const;
export type InterviewRound = (typeof INTERVIEW_ROUNDS)[number];

// ==================== 面试结论 ====================
export const INTERVIEW_CONCLUSIONS = ['pass', 'reject', 'pending'] as const;
export type InterviewConclusion = (typeof INTERVIEW_CONCLUSIONS)[number];

// ==================== 职位状态 ====================
export const JOB_STATUS = ['open', 'paused', 'closed'] as const;
export type JobStatus = (typeof JOB_STATUS)[number];

// ==================== 职位类型 ====================
export const JOB_TYPES = ['社招', '校招', '实习生'] as const;
export type JobType = (typeof JOB_TYPES)[number];

// ==================== Offer 结果 ====================
export const OFFER_RESULTS = ['pending', 'accepted', 'rejected'] as const;
export type OfferResult = (typeof OFFER_RESULTS)[number];

// ==================== 性别 ====================
export const GENDERS = ['男', '女'] as const;
export type Gender = (typeof GENDERS)[number];

// ==================== 默认阶段与状态（用于兜底显示）====================
export const DEFAULT_STAGE = '入库' as const;
export const DEFAULT_STAGE_STATUS = 'in_progress' as const;
