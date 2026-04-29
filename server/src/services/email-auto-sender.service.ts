import prisma from '../lib/prisma';
import { sendMail } from './mail.service';
import { renderTemplate } from './email-template.service';
import { getEnabledRulesByTrigger } from './automation-rule.service';

/**
 * 邮件自动发送引擎
 * 在候选人阶段流转时自动发送匹配的邮件模板
 *
 * 关键设计：永不抛出异常，所有错误内部处理，不影响主流程
 */

/**
 * 构建邮件模板变量映射
 */
async function buildEmailVariables(
  candidateId: string,
  stage: string
): Promise<Record<string, string>> {
  const candidate = await prisma.candidate.findUnique({
    where: { id: candidateId },
    include: {
      candidateJobs: {
        include: { job: { select: { title: true } } },
        take: 1,
      },
      offer: true,
    },
  });
  if (!candidate) return {};

  const vars: Record<string, string> = {
    candidateName: candidate.name,
    candidateEmail: candidate.email || '',
    jobTitle: candidate.candidateJobs[0]?.job?.title || '',
    currentStage: stage,
  };

  // Offer 阶段补充 Offer 相关变量
  if (candidate.offer) {
    vars.salary = candidate.offer.salary || '';
    vars.offerDate = candidate.offer.offerDate
      ? new Date(candidate.offer.offerDate).toISOString().split('T')[0]
      : '';
    vars.expectedJoinDate = candidate.offer.expectedJoinDate
      ? new Date(candidate.offer.expectedJoinDate).toISOString().split('T')[0]
      : '';
  }

  return vars;
}

/**
 * 根据候选人当前阶段，检查并自动发送触发邮件
 * 此函数为"发后即忘"模式，调用方应使用 void 调用，不阻塞主流程
 */
export async function autoSendEmailOnStageTransition(
  candidateId: string,
  stage: string,
  status: string,
  operatedById: string
): Promise<void> {
  try {
    // 1. 查找匹配的自动化规则
    const rules = await getEnabledRulesByTrigger(stage, status);
    if (rules.length === 0) return;

    // 2. 获取候选人信息
    const candidate = await prisma.candidate.findUnique({
      where: { id: candidateId },
      select: { name: true, email: true },
    });
    if (!candidate || !candidate.email) return;

    // 3. 构建变量
    const variables = await buildEmailVariables(candidateId, stage);

    // 4. 逐条规则发送
    for (const rule of rules) {
      try {
        // 渲染模板
        const subject = renderTemplate(rule.template.subject, variables);
        const body = renderTemplate(rule.template.body, variables);

        // 发送邮件
        const result = await sendMail({
          to: candidate.email,
          subject,
          html: body,
        });

        // 记录发送日志
        await prisma.emailLog.create({
          data: {
            templateId: rule.templateId,
            candidateId,
            toEmail: candidate.email,
            subject,
            body,
            status: result.success ? 'sent' : 'failed',
            errorMessage: result.error || null,
            createdById: operatedById,
          },
        });
      } catch (innerError) {
        console.error(
          `[EmailAutoSender] 发送自动化邮件失败 (规则: ${rule.id}, 候选人: ${candidateId}):`,
          innerError
        );
        // 记录失败日志
        try {
          await prisma.emailLog.create({
            data: {
              templateId: rule.templateId,
              candidateId,
              toEmail: candidate.email,
              subject: rule.template.subject,
              body: rule.template.body,
              status: 'failed',
              errorMessage: innerError instanceof Error ? innerError.message : '未知错误',
              createdById: operatedById,
            },
          });
        } catch {
          // 日志记录失败也忽略
        }
      }
    }
  } catch (error) {
    console.error(
      `[EmailAutoSender] 自动化邮件处理失败 (候选人: ${candidateId}):`,
      error
    );
  }
}
