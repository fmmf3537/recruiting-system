import prisma from '../lib/prisma';
import { AppError } from '../middleware/errorHandler';

const RULE_CATEGORY = 'hr_score_rule';

export interface UpdateRuleInput {
  name?: string;
  description?: string;
  enabled?: boolean;
}

/** admin：列出全部业务积分规则（字典 hr_score_rule） */
export async function listRules() {
  return prisma.dictionary.findMany({
    where: { category: RULE_CATEGORY },
    orderBy: [{ sortOrder: 'asc' }, { code: 'asc' }],
  });
}

/** admin：按 code 更新规则名称 / 分值（description）/ 启停用。已记分事件不追溯。 */
export async function updateRule(code: string, data: UpdateRuleInput) {
  const existing = await prisma.dictionary.findFirst({
    where: { category: RULE_CATEGORY, code },
  });
  if (!existing) {
    throw new AppError(`积分规则不存在：${code}`, 404);
  }
  const payload: {
    name?: string;
    description?: string | null;
    enabled?: boolean;
  } = {};
  if (data.name !== undefined) payload.name = data.name;
  if (data.description !== undefined) payload.description = data.description;
  if (data.enabled !== undefined) payload.enabled = data.enabled;
  return prisma.dictionary.update({
    where: { id: existing.id },
    data: payload,
  });
}

/** hr 只读视图：当前适用的规则列表（含 enabled 状态，不暴露写入口） */
export async function getMyCurrentRules() {
  const rules = await listRules();
  return rules.map((r) => ({
    code: r.code,
    name: r.name,
    points: r.description,
    enabled: r.enabled,
  }));
}
