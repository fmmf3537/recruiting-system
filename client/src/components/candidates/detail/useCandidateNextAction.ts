// 候选人详情页「下一步行动」状态机
// 依据候选人/面试/评估/Offer 数据计算出全页唯一的主引导 CTA，
// 详情页新版信息架构的核心：让用户打开页面 3 秒内知道该干什么。
import { computed, type ComputedRef, type Ref } from 'vue';

import type { CandidateDetail } from '@/api/candidate';
import type { InterviewEvaluationItem } from '@/api/evaluation';
import type { InterviewItem } from '@/api/interview';
import { useAuthStore } from '@/stores/auth';

export type NextActionKind =
  | 'schedule-interview' // 当前是面试阶段但尚未安排面试
  | 'pending-evaluations' // 面试已结束但有面试官未提交结构化评估
  | 'offer-draft' // Offer 草稿待提交审批
  | 'offer-approve' // Offer 待审批且当前用户是审批人
  | 'stage-overdue' // 阶段停留超时
  | 'rejected' // 候选人已淘汰
  | 'idle'; // 无待办

export type NextActionTone = 'overdue' | 'todo' | 'success' | 'info';

export interface NextActionState {
  kind: NextActionKind;
  tone: NextActionTone;
  icon: string;
  text: string;
  overdueDays: number;
  sub: string;
  btnText: string;
}

// 面试安排超期阈值：进入当前面试阶段后超过该天数仍未安排即提示超期
const INTERVIEW_SCHEDULE_OVERDUE_DAYS = 2;
// 阶段停留超时阈值：与后端 STAGE_OVERDUE_DAYS 默认值（7 天）对齐
const STAGE_OVERDUE_DAYS = 7;

function daysSince(dateStr: string): number {
  return Math.floor((Date.now() - new Date(dateStr).getTime()) / 86400000);
}

// 面试是否已结束（scheduledAt + duration 已过）
function isInterviewFinished(iv: InterviewItem): boolean {
  return new Date(iv.scheduledAt).getTime() + iv.duration * 60 * 1000 < Date.now();
}

export function useCandidateNextAction(
  candidate: Ref<CandidateDetail | null>,
  interviews: Ref<InterviewItem[]>,
  /** 面试 ID → 该场所有面试官评估（getInterviewEvaluations 结果） */
  evaluations: Ref<Map<string, InterviewEvaluationItem[]>>
): { nextAction: ComputedRef<NextActionState>; defaultTab: ComputedRef<string> } {
  const authStore = useAuthStore();

  const nextAction = computed<NextActionState>(() => {
    const c = candidate.value;
    if (!c) {
      return { kind: 'idle', tone: 'info', icon: '⏳', text: '加载中', overdueDays: 0, sub: '', btnText: '' };
    }

    // 1. 已淘汰：无行动，仅展示结论
    if (c.stageStatus === 'rejected') {
      const rejectRecord = [...(c.stageRecords || [])].reverse().find((r) => r.status === 'rejected');
      return {
        kind: 'rejected',
        tone: 'info',
        icon: '⊘',
        text: '候选人已淘汰',
        overdueDays: 0,
        sub: rejectRecord?.rejectReason ? `淘汰原因：${rejectRecord.rejectReason}` : '可在招聘进展中查看历史阶段记录。',
        btnText: '',
      };
    }

    // 2. Offer 相关（优先于面试引导）
    const { offer } = c;
    if (offer) {
      if (offer.status === 'draft') {
        return {
          kind: 'offer-draft',
          tone: 'todo',
          icon: '📋',
          text: 'Offer 草稿待提交审批',
          overdueDays: 0,
          sub: 'Offer 已创建但未提交，提交并审批通过后才能发送给候选人。',
          btnText: '提交审批',
        };
      }
      if (
        offer.status === 'pending_approval' &&
        (authStore.isAdmin || (offer.approverId && offer.approverId === authStore.userInfo?.id))
      ) {
        return {
          kind: 'offer-approve',
          tone: 'todo',
          icon: '📋',
          text: 'Offer 待你审批',
          overdueDays: 0,
          sub: `${c.name} 的 Offer 待审批，请尽快处理。`,
          btnText: '去审批',
        };
      }
    }

    // 3. 面试阶段引导
    const isInterviewStage = c.currentStage.includes('面');
    const currentRecord = (c.stageRecords || []).find((r) => r.stage === c.currentStage);
    const stageDays = currentRecord ? daysSince(currentRecord.enteredAt) : 0;

    if (isInterviewStage) {
      const scheduled = interviews.value.filter((iv) => iv.status === 'scheduled');
      if (!scheduled.length) {
        const overdueDays = Math.max(0, stageDays - INTERVIEW_SCHEDULE_OVERDUE_DAYS);
        return {
          kind: 'schedule-interview',
          tone: overdueDays > 0 ? 'overdue' : 'todo',
          icon: '⚡',
          text: `安排${c.currentStage}面试`,
          overdueDays,
          sub:
            overdueDays > 0
              ? `${c.currentStage}已进入 ${stageDays} 天仍未安排面试，建议尽快协调面试官时间。`
              : `${c.currentStage}尚未安排，建议提前协调面试官时间。`,
          btnText: '立即安排面试',
        };
      }
      // 已结束但仍有面试官未提交结构化评估
      const pendingCount = interviews.value
        .filter((iv) => iv.status === 'completed' && isInterviewFinished(iv))
        .reduce(
          (sum, iv) =>
            sum + (evaluations.value.get(iv.id) || []).filter((e) => !e.submittedAt).length,
          0
        );
      if (pendingCount > 0) {
        return {
          kind: 'pending-evaluations',
          tone: 'todo',
          icon: '📝',
          text: `${pendingCount} 份面试评估待提交`,
          overdueDays: 0,
          sub: '面试已结束，部分面试官尚未提交结构化评估，可一键催收。',
          btnText: '查看并提醒',
        };
      }
    }

    // 4. 阶段停留超时
    if (stageDays > STAGE_OVERDUE_DAYS) {
      return {
        kind: 'stage-overdue',
        tone: 'overdue',
        icon: '⏰',
        text: `「${c.currentStage}」已停留 ${stageDays} 天`,
        overdueDays: 0,
        sub: '阶段停留时间较长，请尽快推进或补充阶段备注。',
        btnText: '推进阶段',
      };
    }

    // 5. 无待办
    return {
      kind: 'idle',
      tone: 'success',
      icon: '✓',
      text: '暂无待办事项',
      overdueDays: 0,
      sub: `当前阶段「${c.currentStage}」一切就绪。`,
      btnText: '',
    };
  });

  // 默认聚焦的 Tab：与当前最紧迫的事项对应（打开页面即引导）
  const defaultTab = computed(() => {
    const { kind } = nextAction.value;
    if (kind === 'pending-evaluations') return 'interview';
    if (kind === 'offer-draft' || kind === 'offer-approve') return 'offer';
    return 'profile';
  });

  return { nextAction, defaultTab };
}
