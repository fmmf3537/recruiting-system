/**
 * E2E minimal seed：4 角色用户 + 1 条默认 PipelineTemplate
 * - 复用 seed-test-users.ts 的 seedTestUsers（不复制内部逻辑）
 * - 字典由 dictionary.service lazy seed，此处不种
 * - 新建 PrismaClient，用 process.env.DATABASE_URL（由调用方注入 e2e URL）
 */
import { PrismaClient } from '@prisma/client';

import { seedTestUsers } from './seed-test-users.js';

/** 与历史七阶段 / STAGE_ORDER 一致 */
const DEFAULT_STAGES = ['入库', '初筛', '复试', '终面', '拟录用', 'Offer', '入职'];

async function seedE2eMinimal(): Promise<void> {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error('DATABASE_URL 未设置，无法执行 e2e minimal seed');
  }

  const prisma = new PrismaClient({
    datasources: { db: { url: databaseUrl } },
  });

  try {
    await seedTestUsers(prisma);

    const existing = await prisma.pipelineTemplate.findFirst({
      where: { name: 'E2E-默认模板', type: '社招' },
    });

    if (existing) {
      console.log('⏭️  PipelineTemplate 已存在，跳过: E2E-默认模板');
    } else {
      await prisma.pipelineTemplate.create({
        data: {
          name: 'E2E-默认模板',
          type: '社招',
          stages: DEFAULT_STAGES,
          enabled: true,
          isDefault: true,
        },
      });
      console.log('✅ 已创建 PipelineTemplate: E2E-默认模板（社招 / 七阶段 / isDefault）');
    }

    console.log('\n🎉 E2E minimal seed 完成');
  } finally {
    await prisma.$disconnect();
  }
}

seedE2eMinimal().catch((e) => {
  console.error(e);
  process.exit(1);
});
