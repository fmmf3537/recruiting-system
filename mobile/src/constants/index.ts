/**
 * 移动端共享常量
 * 与 server/src/constants/index.ts 保持一致
 */

// 招聘阶段
export const STAGE_ORDER = ['入库', '初筛', '复试', '终面', '拟录用', 'Offer', '入职'] as const;
export type Stage = (typeof STAGE_ORDER)[number];

// 阶段状态
export const STAGE_STATUS = ['in_progress', 'passed', 'rejected'] as const;
export type StageStatus = (typeof STAGE_STATUS)[number];

export const STAGE_STATUS_MAP: Record<StageStatus, string> = {
  in_progress: '进行中',
  passed: '已通过',
  rejected: '已淘汰',
};

// 面试轮次
export const INTERVIEW_ROUNDS = ['初试', '复试', '终面'] as const;
export type InterviewRound = (typeof INTERVIEW_ROUNDS)[number];

// 面试结论
export const INTERVIEW_CONCLUSIONS = ['pass', 'reject', 'pending'] as const;
export type InterviewConclusion = (typeof INTERVIEW_CONCLUSIONS)[number];

export const INTERVIEW_CONCLUSION_MAP: Record<InterviewConclusion, string> = {
  pass: '通过',
  reject: '淘汰',
  pending: '待定',
};

// 职位状态
export const JOB_STATUS = ['open', 'closed', 'paused'] as const;
export type JobStatus = (typeof JOB_STATUS)[number];

export const JOB_STATUS_MAP: Record<JobStatus, string> = {
  open: '招聘中',
  closed: '已关闭',
  paused: '已暂停',
};

// Offer 结果
export const OFFER_RESULT = ['pending', 'accepted', 'rejected'] as const;
export type OfferResult = (typeof OFFER_RESULT)[number];

export const OFFER_RESULT_MAP: Record<OfferResult, string> = {
  pending: '待定',
  accepted: '已接受',
  rejected: '已拒绝',
};

// 性别
export const GENDER_OPTIONS = ['男', '女'] as const;
export type Gender = (typeof GENDER_OPTIONS)[number];

// 学历选项（常用）
export const EDUCATION_OPTIONS = ['博士', '硕士', '本科', '大专', '高中及以下'] as const;

// 来源选项（常用）
export const SOURCE_OPTIONS = [
  '招聘网站',
  '内部推荐',
  '猎头',
  '校园招聘',
  '社交媒体',
  '官网投递',
  '其他',
] as const;

// 阶段标签颜色映射（对应 Vant Tag type）
export function getStageStatusType(status: string): 'primary' | 'success' | 'danger' {
  if (status === 'rejected') return 'danger';
  if (status === 'passed') return 'success';
  return 'primary';
}

// 面试结论标签颜色映射
export function getConclusionType(conclusion: string | null): 'success' | 'danger' | 'warning' {
  if (conclusion === 'pass') return 'success';
  if (conclusion === 'reject') return 'danger';
  return 'warning';
}

// Offer 结果标签颜色映射
export function getOfferResultType(result: string): 'success' | 'danger' | 'warning' {
  if (result === 'accepted') return 'success';
  if (result === 'rejected') return 'danger';
  return 'warning';
}

// 职位状态标签颜色映射
export function getJobStatusType(status: string): 'success' | 'danger' | 'warning' {
  if (status === 'open') return 'success';
  if (status === 'closed') return 'danger';
  return 'warning';
}
