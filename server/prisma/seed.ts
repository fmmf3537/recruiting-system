import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  console.log('开始初始化数据库...\n');

  // 清空现有数据
  await prisma.operationLog.deleteMany();
  await prisma.offer.deleteMany();
  await prisma.interviewFeedback.deleteMany();
  await prisma.stageRecord.deleteMany();
  await prisma.candidateJob.deleteMany();
  await prisma.candidate.deleteMany();
  await prisma.job.deleteMany();
  await prisma.user.deleteMany();

  console.log('已清空旧数据\n');

  // 1. 创建管理员账号
  const adminPassword = await bcrypt.hash('admin123', 10);
  const admin = await prisma.user.create({
    data: {
      email: 'admin@example.com',
      password: adminPassword,
      name: '系统管理员',
      role: 'admin',
    },
  });
  console.log('✅ 管理员账号创建成功:');
  console.log(`   邮箱: ${admin.email}`);
  console.log(`   密码: admin123`);
  console.log(`   角色: ${admin.role}\n`);

  // 2. 创建普通成员账号
  const memberPassword = await bcrypt.hash('member123', 10);
  const member = await prisma.user.create({
    data: {
      email: 'member@example.com',
      password: memberPassword,
      name: '招聘专员',
      role: 'member',
    },
  });
  console.log('✅ 成员账号创建成功:');
  console.log(`   邮箱: ${member.email}`);
  console.log(`   密码: member123`);
  console.log(`   角色: ${member.role}\n`);

  // 3. 创建示例职位
  const job1 = await prisma.job.create({
    data: {
      title: '高级前端工程师',
      departments: ['技术部', '前端组'],
      level: 'P6',
      skills: ['Vue.js', 'TypeScript', 'Node.js', 'Webpack'],
      location: '北京',
      type: '社招',
      status: 'open',
      description: '<p>负责公司核心产品的前端开发工作</p>',
      requirements: '<p>3年以上前端开发经验，精通 Vue.js</p>',
      createdById: admin.id,
    },
  });

  const job2 = await prisma.job.create({
    data: {
      title: '后端开发工程师',
      departments: ['技术部', '后端组'],
      level: 'P5',
      skills: ['Java', 'Spring Boot', 'MySQL', 'Redis'],
      location: '上海',
      type: '社招',
      status: 'open',
      description: '<p>负责后端服务开发与维护</p>',
      requirements: '<p>2年以上 Java 开发经验</p>',
      createdById: admin.id,
    },
  });

  console.log('✅ 示例职位创建成功:');
  console.log(`   1. ${job1.title}`);
  console.log(`   2. ${job2.title}\n`);

  // 4. 创建示例候选人
  const candidate1 = await prisma.candidate.create({
    data: {
      name: '张三',
      phone: '13800138001',
      email: 'zhangsan@example.com',
      gender: '男',
      age: 28,
      education: '本科',
      school: '北京大学',
      workYears: 5,
      currentCompany: '阿里巴巴',
      currentPosition: '前端工程师',
      expectedSalary: '25k-35k',
      resumeUrl: 'https://example.com/resume/zhangsan.pdf',
      source: 'BOSS直聘',
      sourceNote: '主动投递',
      intro: '有丰富的前端开发经验，精通 Vue 生态',
      createdById: admin.id,
    },
  });

  // 关联候选人和职位
  await prisma.candidateJob.create({
    data: {
      candidateId: candidate1.id,
      jobId: job1.id,
    },
  });

  console.log('✅ 示例候选人创建成功:');
  console.log(`   姓名: ${candidate1.name}`);
  console.log(`   应聘职位: ${job1.title}\n`);

  // 5. 创建阶段记录
  const stageRecord = await prisma.stageRecord.create({
    data: {
      candidateId: candidate1.id,
      stage: '初筛',
      status: 'passed',
      assigneeId: member.id,
      enteredAt: new Date(),
      completedAt: new Date(),
      note: '技术基础扎实，沟通良好',
    },
  });

  console.log('✅ 阶段记录创建成功:');
  console.log(`   阶段: ${stageRecord.stage}`);
  console.log(`   状态: ${stageRecord.status}\n`);

  // 6. 创建面试反馈
  const feedback = await prisma.interviewFeedback.create({
    data: {
      candidateId: candidate1.id,
      round: '初试',
      interviewerName: '李四',
      interviewTime: new Date(),
      conclusion: 'pass',
      feedbackContent: '<p>技术能力较强，项目经验丰富</p>',
      createdById: member.id,
    },
  });

  console.log('✅ 面试反馈创建成功:');
  console.log(`   轮次: ${feedback.round}`);
  console.log(`   结论: ${feedback.conclusion}\n`);

  // 7. 创建 Offer
  const offer = await prisma.offer.create({
    data: {
      candidateId: candidate1.id,
      salary: '30k',
      offerDate: new Date(),
      expectedJoinDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // 30天后
      result: 'pending',
      joined: false,
      note: '薪资已确认，等待候选人回复',
    },
  });

  console.log('✅ Offer 创建成功:');
  console.log(`   薪资: ${offer.salary}`);
  console.log(`   状态: ${offer.result}\n`);

  // 8. 创建操作日志
  const log = await prisma.operationLog.create({
    data: {
      userId: admin.id,
      targetType: 'Candidate',
      targetId: candidate1.id,
      action: 'created',
      detail: {
        name: candidate1.name,
        jobId: job1.id,
      },
    },
  });

  console.log('✅ 操作日志创建成功:');
  console.log(`   操作: ${log.action}`);
  console.log(`   目标: ${log.targetType}\n`);

  console.log('🎉 数据库初始化完成！');
  console.log('\n📋 可用账号:');
  console.log('   管理员: admin@example.com / admin123');
  console.log('   成员:   member@example.com / member123');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
