// 候选人列表「下一步」引导徽标的状态机
// 与详情页 useCandidateNextAction 同一套判断逻辑，但只依赖列表接口返回的轻量字段
// （Offer 摘要 + 最近一场待进行面试 + 当前阶段进入时间），不对每行发起额外请求。
import type { CandidateItem } from '@/api/candidate';

export type NextStepTone = 'overdue' | 'todo' | 'info' | 'success';

export interface ListNextStep {
  tone: NextStepTone;
  text: string;
}

// 阶段停留超时阈值：与详情页状态机、后端 STAGE_OVERDUE_DAYS 默认值（7 天）对齐
const STAGE_OVERDUE_DAYS = 7;

function daysSince(dateStr: string): number {
  return Math.floor((Date.now() - new Date(dateStr).getTime()) / 86400000);
}

// 计算列表行「下一步」徽标：优先级与详情页下一步行动条一致（淘汰 > Offer > 面试 > 超期 > 就绪）
export function getListNextStep(row: CandidateItem): ListNextStep {
  if (row.stageStatus === 'rejected') {
    return { tone: 'info', text: '已淘汰' };
  }

  // Offer 相关（优先于面试引导）
  const { offer } = row;
  if (offer) {
    if (offer.joined) return { tone: 'success', text: '已入职' };
    if (offer.status === 'draft') return { tone: 'todo', text: '提交 Offer 审批' };
    if (offer.status === 'pending_approval') return { tone: 'todo', text: 'Offer 待审批' };
    if (offer.status === 'approved') return { tone: 'todo', text: '发送 Offer' };
    if (offer.status === 'sent' && offer.result === 'pending') return { tone: 'todo', text: '待候选人答复' };
  }

  // 面试阶段引导
  if (row.currentStage.includes('面') || row.currentStage.includes('试')) {
    if (row.nextInterviewAt) {
      const t = new Date(row.nextInterviewAt);
      const mmdd = `${t.getMonth() + 1}/${t.getDate()}`;
      const hhmm = `${String(t.getHours()).padStart(2, '0')}:${String(t.getMinutes()).padStart(2, '0')}`;
      return { tone: 'info', text: `${mmdd} ${hhmm} 面试` };
    }
    return { tone: 'todo', text: `安排${row.currentStage}` };
  }

  // 阶段停留超时
  if (row.currentStageEnteredAt) {
    const days = daysSince(row.currentStageEnteredAt);
    if (days > STAGE_OVERDUE_DAYS) {
      return { tone: 'overdue', text: `停留 ${days} 天未推进` };
    }
  }

  // 就绪：按阶段给出轻提示
  if (row.currentStage === '入库') return { tone: 'info', text: '待初筛' };
  if (row.currentStage === '拟录用') return { tone: 'info', text: '准备 Offer' };
  return { tone: 'info', text: '正常推进' };
}
