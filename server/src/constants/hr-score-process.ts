// 过程质量分 4 维度常量定义（PRD §6.3）
// 字典 `hr_score_process_rule` 4 条对应这些 code；description 字段为 0（不改分值）
export const PROCESS_RULE_CODE = {
  resume_sla: 'resume_sla', // 简历处理时效
  interview_response: 'interview_response', // 面试反馈催收响应
  followup_coverage: 'followup_coverage', // 跟进记录完整度
  talent_ops: 'talent_ops', // 人才库维护
} as const;

export type ProcessRuleCode = (typeof PROCESS_RULE_CODE)[keyof typeof PROCESS_RULE_CODE];

export const PROCESS_RULE_FULL_SCORE = 10; // 每维度满分

/** 维度中文名（写入 remark） */
export const PROCESS_RULE_LABEL: Record<ProcessRuleCode, string> = {
  resume_sla: '简历处理时效',
  interview_response: '面试反馈催收响应',
  followup_coverage: '跟进记录完整度',
  talent_ops: '人才库维护',
};

// 简历处理时效：48h 内处理率阈值
export const RESUME_SLA_THRESHOLD_HOURS = 48;
export const RESUME_SLA_TARGET_RATE = 0.9; // ≥90% 得满分

// 面试反馈催收：remindedAt 后 24h 内提交率
export const INTERVIEW_RESPONSE_THRESHOLD_HOURS = 24;
export const INTERVIEW_RESPONSE_TARGET_RATE = 1.0; // 100% 得满分

// 跟进记录完整度：活跃候选人中有跟进记录的比例
export const FOLLOWUP_TARGET_RATE = 0.8; // ≥80% 得满分

// 人才库维护：每周有效操作次数目标
export const TALENT_OPS_WEEKLY_DEFAULT = 5;

/** 人才库维护计入的 OperationLog.action（distinct 计数） */
export const TALENT_OPS_ACTIONS = [
  'tag_create',
  'tag_update',
  'candidate_update',
  'candidate_duplicate_resolved',
] as const;
