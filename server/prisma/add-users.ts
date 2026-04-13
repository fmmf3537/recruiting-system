import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  console.log('开始添加用户...\n');

  const users = [
    {
      email: 'fmmf3537@163.com',
      password: await bcrypt.hash('fmmf5213537', 10),
      name: 'Admin',
      role: 'admin',
    },
    {
      email: 'liting@aidrone.com.cn',
      password: await bcrypt.hash('xinhang123', 10),
      name: '李婷',
      role: 'member',
    },
  ];

  for (const userData of users) {
    const existing = await prisma.user.findUnique({
      where: { email: userData.email },
    });

    if (existing) {
      console.log(`⚠️  用户 ${userData.email} 已存在，跳过`);
    } else {
      const user = await prisma.user.create({
        data: userData,
      });
      console.log(`✅ 用户创建成功: ${user.email} (${user.role})`);
    }
  }

  console.log('\n🎉 完成！');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });