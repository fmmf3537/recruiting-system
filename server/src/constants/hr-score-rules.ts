// ==================== HR 考核积分规则常量（F4-S1）====================
// 规则分值以字典 hr_score_rule.description 为准（admin 可在 /settings/dictionary 调整）；
// 本文件的 DEFAULT_POINTS 仅在字典缺失 / 解析失败时兜底，取值与迁移种子保持一致。

/** 积分规则 code（与字典 hr_score_rule.code 一一对应） */
export const RULE_CODE = {
  resume_upload: 'resume_upload',
  agency_resume_process: 'agency_resume_process',
  dept_recommend: 'dept_recommend',
  interview_complete: 'interview_complete',
  offer_sent: 'offer_sent',
  candidate_joined: 'candidate_joined',
  offer_rejected: 'offer_rejected',
  probation_out: 'probation_out',
} as const;

export type RuleCode = (typeof RULE_CODE)[keyof typeof RULE_CODE];

/** 兜底默认分值（与迁移 20260902150000_add_hr_score 的字典种子一致） */
export const DEFAULT_POINTS: Record<string, number> = {
  [RULE_CODE.resume_upload]: 2,
  [RULE_CODE.agency_resume_process]: 3,
  [RULE_CODE.dept_recommend]: 5,
  [RULE_CODE.interview_complete]: 10,
  [RULE_CODE.offer_sent]: 30,
  [RULE_CODE.candidate_joined]: 50,
  [RULE_CODE.offer_rejected]: -10,
  [RULE_CODE.probation_out]: -20,
};

/** 猎头来源前缀：候选人 source 以此开头视为猎头渠道（F5-S 约定） */
export const AGENCY_SOURCE_PREFIX = '猎头:';
