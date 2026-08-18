import path from 'path';
import fs from 'fs/promises';
import prisma from '../lib/prisma';
import { env } from '../lib/env';

/**
 * 候选人数据匿名化服务（个保法合规：数据保留与最小化）
 *
 * 规则：「淘汰超过 2 年且未入职」的候选人执行匿名化
 * - 姓名改为「已匿名」，手机号/邮箱清空，删除简历物理文件并清空 resumeUrl
 * - 保留统计所需的脱敏数据：来源渠道、学历、阶段记录等不改动
 * - 每位候选人的匿名化写入 OperationLog（action: candidate_anonymized）
 */

// 数据保留期限：2 年
const RETENTION_YEARS = 2;

/**
 * 执行匿名化，返回本次匿名化的候选人数量
 * @param now 当前时间（可注入便于测试）
 */
export async function anonymizeExpiredCandidates(now = new Date()): Promise<number> {
  // 淘汰时间点早于该时间即视为"超过保留期限"
  const cutoff = new Date(now);
  cutoff.setFullYear(cutoff.getFullYear() - RETENTION_YEARS);

  // 初筛：未匿名化 + 存在 2 年前的淘汰记录 + 未入职（无通过的入职阶段、Offer 未标记入职）
  const candidates = await prisma.candidate.findMany({
    where: {
      anonymizedAt: null,
      stageRecords: { some: { status: 'rejected', enteredAt: { lt: cutoff } } },
      NOT: [
        { stageRecords: { some: { stage: '入职', status: 'passed' } } },
        { offer: { joined: true } },
      ],
    },
    include: {
      // 仅取最新阶段记录，用于确认当前仍处于淘汰状态（避免淘汰后又推进的误删）
      stageRecords: { orderBy: { enteredAt: 'desc' }, take: 1 },
    },
  });

  // 精确过滤：最新阶段为淘汰且进入时间超过保留期限
  const targets = candidates.filter(
    (c) => c.stageRecords[0]?.status === 'rejected' && c.stageRecords[0].enteredAt < cutoff
  );

  let anonymizedCount = 0;
  // 逐个处理：单条失败不影响其他候选人的匿名化
  for (const candidate of targets) {
    try {
      // 删除简历物理文件（文件可能已不存在，失败不阻断匿名化）
      if (candidate.resumeUrl) {
        const filename = path.basename(candidate.resumeUrl);
        const filePath = path.join(path.resolve(process.cwd(), env.UPLOAD_DIR), filename);
        await fs.unlink(filePath).catch(() => {});
      }

      await prisma.candidate.update({
        where: { id: candidate.id },
        data: {
          // 清空直接标识信息；来源、学历、阶段记录等统计字段保留
          name: '已匿名',
          phone: '',
          email: '',
          resumeUrl: null,
          anonymizedAt: now,
        },
      });

      // 审计日志：以候选人负责人作为操作归属（系统定时任务无登录用户）
      await prisma.operationLog.create({
        data: {
          userId: candidate.createdById,
          targetType: 'Candidate',
          targetId: candidate.id,
          action: 'candidate_anonymized',
          detail: {
            reason: `淘汰超过 ${RETENTION_YEARS} 年且未入职，按数据保留策略自动匿名化`,
          },
        },
      });

      anonymizedCount += 1;
    } catch (error) {
      console.error(`[匿名化] 候选人 ${candidate.id} 匿名化失败:`, error);
    }
  }

  return anonymizedCount;
}
