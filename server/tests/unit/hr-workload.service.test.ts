import { describe, it, expect } from 'vitest';
import {
  assembleRows,
  buildRates,
  classifyStatus,
  detectWeakPoints,
  resolveRange,
  safeRate,
  sumProcess,
  type ProcessMetrics,
  type ResultMetrics,
} from '../../src/services/hr-workload.service';

const zeroProcess = (): ProcessMetrics => ({
  newCandidates: 0,
  communications: 0,
  interviewsScheduled: 0,
  interviewsCompleted: 0,
  offerActions: 0,
  stageAdvances: 0,
});

const zeroResult = (): ResultMetrics => ({
  screeningPassed: 0,
  interviewsCompleted: 0,
  offersSent: 0,
  offersAccepted: 0,
  joined: 0,
});

describe('hr-workload.service 口径与判定', () => {
  describe('resolveRange', () => {
    it('日范围覆盖所选自然日', () => {
      const r = resolveRange('day', '2026-09-16');
      expect(r.startStr).toBe('2026-09-16');
      expect(r.endStr).toBe('2026-09-16');
      expect(r.start.getHours()).toBe(0);
      expect(r.end.getHours()).toBe(23);
    });

    it('周范围是所选日期所在周一到周日', () => {
      const r = resolveRange('week', '2026-09-16');
      expect(r.startStr).toBe('2026-09-14');
      expect(r.endStr).toBe('2026-09-20');
    });

    it('月范围是所选日期所在自然月', () => {
      const r = resolveRange('month', '2026-09-16');
      expect(r.startStr).toBe('2026-09-01');
      expect(r.endStr).toBe('2026-09-30');
    });
  });

  describe('safeRate', () => {
    it('分母为 0 返回 null', () => {
      expect(safeRate(1, 0)).toBeNull();
      expect(safeRate(0, 0)).toBeNull();
    });

    it('正常比值不返回 NaN/Infinity', () => {
      expect(safeRate(1, 2)).toBe(0.5);
      expect(Number.isFinite(safeRate(3, 4) as number)).toBe(true);
    });
  });

  describe('detectWeakPoints', () => {
    const team = buildRates(
      { screeningPassed: 40, interviewsCompleted: 20, offersSent: 10, offersAccepted: 8, joined: 6 },
      50
    );

    it('上一环节样本 < 5 不判薄弱', () => {
      const rates = buildRates(
        { screeningPassed: 1, interviewsCompleted: 0, offersSent: 0, offersAccepted: 0, joined: 0 },
        3
      );
      const weak = detectWeakPoints(rates, team, {
        newCandidates: 3,
        screeningPassed: 1,
        offersSent: 0,
        offersAccepted: 0,
      });
      expect(weak).toEqual([]);
    });

    it('转化率低于团队均值 20% 标薄弱', () => {
      const rates = buildRates(
        { screeningPassed: 10, interviewsCompleted: 8, offersSent: 10, offersAccepted: 2, joined: 2 },
        50
      );
      const weak = detectWeakPoints(rates, team, {
        newCandidates: 50,
        screeningPassed: 10,
        offersSent: 10,
        offersAccepted: 2,
      });
      expect(weak.some((w) => w.stage === 'offerAccept')).toBe(true);
    });
  });

  describe('classifyStatus', () => {
    it('最大上环节样本不足 → insufficient_sample', () => {
      expect(
        classifyStatus({
          processTotal: 2,
          teamAvgProcess: 10,
          joinRate: null,
          teamJoinRate: 0.5,
          offersAccepted: 1,
          maxPrev: 3,
        })
      ).toBe('insufficient_sample');
    });

    it('过程量高且入职率低 → need_attention', () => {
      expect(
        classifyStatus({
          processTotal: 20,
          teamAvgProcess: 10,
          joinRate: 0.2,
          teamJoinRate: 0.5,
          offersAccepted: 10,
          maxPrev: 10,
        })
      ).toBe('need_attention');
    });

    it('样本足够且不满足忙碌低效 → normal', () => {
      expect(
        classifyStatus({
          processTotal: 10,
          teamAvgProcess: 10,
          joinRate: 0.5,
          teamJoinRate: 0.5,
          offersAccepted: 10,
          maxPrev: 10,
        })
      ).toBe('normal');
    });
  });

  describe('assembleRows 按操作人归属', () => {
    it('过程量记在操作人而不是其他 HR', () => {
      const hrs = [
        { id: 'hr-a', name: '甲', department: '人力' },
        { id: 'hr-b', name: '乙', department: '人力' },
      ];
      const metrics = new Map([
        [
          'hr-a',
          {
            process: { ...zeroProcess(), newCandidates: 7, communications: 4 },
            result: { ...zeroResult(), screeningPassed: 6 },
            approximate: false,
          },
        ],
      ]);
      const rows = assembleRows(hrs, metrics);
      const a = rows.find((r) => r.hrId === 'hr-a')!;
      const b = rows.find((r) => r.hrId === 'hr-b')!;
      expect(a.process.newCandidates).toBe(7);
      expect(a.process.communications).toBe(4);
      expect(b.process.newCandidates).toBe(0);
      expect(b.result.screeningPassed).toBe(0);
      expect(sumProcess(a.process)).toBe(11);
    });
  });
});
