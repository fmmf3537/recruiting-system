import { PrismaClient, type UserRole } from '@prisma/client';
import bcrypt from 'bcryptjs';
import { fileURLToPath } from 'url';
import path from 'path';

const prisma = new PrismaClient();

export const TEST_USERS: Array<{
  email: string;
  name: string;
  role: UserRole;
  department: string | null;
  password: string;
}> = [
  {
    email: 'admin@test.local',
    name: '管理员测试',
    role: 'admin',
    department: null,
    password: 'admin123',
  },
  {
    email: 'hr@test.local',
    name: 'HR 测试',
    role: 'hr',
    department: null,
    password: 'hr123456',
  },
  {
    email: 'hiring@test.local',
    name: '业务经理测试',
    role: 'hiring_manager',
    department: '研发部',
    password: 'hiring123',
  },
  {
    email: 'interviewer@test.local',
    name: '面试官测试',
    role: 'interviewer',
    department: '研发部',
    password: 'interview123',
  },
];

export async function seedTestUsers(client: PrismaClient = prisma): Promise<void> {
  console.log('开始创建 4 角色测试用户...\n');

  for (const user of TEST_USERS) {
    const existing = await client.user.findUnique({ where: { email: user.email } });

    if (existing) {
      console.log(`⏭️  用户已存在，跳过: ${user.email}`);
      continue;
    }

    const hashedPassword = await bcrypt.hash(user.password, 10);
    await client.user.create({
      data: {
        email: user.email,
        name: user.name,
        role: user.role,
        department: user.department,
        password: hashedPassword,
        tokenVersion: 0,
      },
    });
    console.log(`✅ 创建用户: ${user.email} (${user.role}) / 密码: ${user.password}`);
  }

  console.log('\n🎉 4 角色测试用户创建完成！');
  console.log('\n📋 登录账号:');
  console.log('   admin        : admin@test.local        / admin123');
  console.log('   hr           : hr@test.local           / hr123456');
  console.log('   hiring_manager: hiring@test.local       / hiring123');
  console.log('   interviewer  : interviewer@test.local   / interview123');
}

const thisFile = fileURLToPath(import.meta.url);
const invokedFile = process.argv[1] ? path.resolve(process.argv[1]) : '';
if (invokedFile === thisFile) {
  seedTestUsers()
    .catch((e) => {
      console.error(e);
      process.exit(1);
    })
    .finally(async () => {
      await prisma.$disconnect();
    });
}
