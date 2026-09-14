/**
 * E2E 数据种子（追加型）：为 UI 测试提供丰富业务数据
 * - 不清空已有数据（幂等 upsert）
 * - 依赖 e2e minimal seed（4 角色用户 + 默认 PipelineTemplate）
 * - 覆盖 UI 测试用例所需：职位/候选人/阶段/面试/沟通/Offer/编制/通知
 * - 数据量级：20+ 候选人、4 职位、6+ 面试反馈、3 Offer、20+ 沟通、4 编制
 */
import { PrismaClient } from '@prisma/client';

const E2E_DB = process.env.DATABASE_URL;
if (!E2E_DB) throw new Error('DATABASE_URL 未设置');

const prisma = new PrismaClient({ datasources: { db: { url: E2E_DB } } });

// 渠道池（覆盖渠道分析统计）
const SOURCES = ['BOSS直聘', '猎聘', '智联招聘', '前程无忧', '内推', '官网投递', '其他'] as const;
// 性别 / 学历 / 公司 / 学校池
const GENDERS = ['男', '女'] as const;
const EDUCATIONS = ['博士', '硕士', '本科', '大专', '高中及以下'] as const;
const COMPANIES = ['阿里巴巴', '腾讯', '字节跳动', '美团', '京东', '小米', '百度', '华为', '滴滴', '网易'] as const;
const SCHOOLS = ['北京大学', '清华大学', '复旦大学', '浙江大学', '上海交通大学', '南京大学', '同济大学', '武汉大学', '中山大学', '厦门大学'] as const;

async function main(): Promise<void> {
  console.log('[seed-e2e-data] 开始注入 e2e 业务数据...');

  // 1. 找 e2e 用户
  const admin = await prisma.user.findUnique({ where: { email: 'admin@test.local' } });
  if (!admin) throw new Error('admin@test.local 不存在，请先跑 seed-e2e-minimal');
  const hr = await prisma.user.findUnique({ where: { email: 'hr@test.local' } });
  const hiring = await prisma.user.findUnique({ where: { email: 'hiring@test.local' } });
  const interviewer = await prisma.user.findUnique({ where: { email: 'interviewer@test.local' } });

  // 2. 拿默认招聘流程模板
  const pipelineTemplate = await prisma.pipelineTemplate.findFirst({ where: { isDefault: true, enabled: true } });
  const pipelineStages = (pipelineTemplate?.stages as string[] | undefined) ?? [
    '入库', '初筛', '复试', '终面', '拟录用', 'Offer', '入职',
  ];

  // 3. 职位（4 个，覆盖 open/closed、不同类型）
  const jobDefs = [
    { title: '高级前端工程师', departments: ['技术部', '前端组'], level: 'P6', location: '北京', type: '社招', status: 'open', skills: ['Vue.js', 'TypeScript', 'Node.js'], description: '<p>负责核心产品前端开发</p>', requirements: '<p>3 年以上前端经验</p>' },
    { title: '后端开发工程师', departments: ['技术部', '后端组'], level: 'P5', location: '上海', type: '社招', status: 'open', skills: ['Java', 'Spring Boot'], description: '<p>负责后端服务开发</p>', requirements: '<p>2 年以上 Java 经验</p>' },
    { title: '测试开发工程师', departments: ['技术部', '质量组'], level: 'P5', location: '深圳', type: '社招', status: 'closed', skills: ['自动化测试', 'Python'], description: '<p>负责测试体系搭建</p>', requirements: '<p>有自动化测试经验</p>' },
    { title: '产品经理', departments: ['产品部'], level: 'P6', location: '北京', type: '校招', status: 'open', skills: ['需求分析', '原型设计'], description: '<p>负责产品规划</p>', requirements: '<p>应届毕业生优先</p>' },
    { title: '数据分析师', departments: ['数据部'], level: 'P6', location: '杭州', type: '社招', status: 'open', skills: ['SQL', 'Python', '统计学'], description: '<p>负责业务数据分析</p>', requirements: '<p>有数据驱动决策经验</p>' },
  ];
  const jobs: { id: string; title: string; level: string }[] = [];
  for (const j of jobDefs) {
    const exist = await prisma.job.findFirst({ where: { title: j.title } });
    if (exist) { jobs.push(exist); continue; }
    const created = await prisma.job.create({
      data: {
        ...j,
        departments: j.departments,
        skills: j.skills,
        createdById: admin.id,
        pipelineTemplateId: pipelineTemplate?.id ?? null,
      },
    });
    jobs.push(created);
  }
  console.log(`[seed-e2e-data] 职位 x${jobs.length}`);

  // 4. 候选人（20 个，覆盖各阶段/渠道/学历/性别）
  // 阶段分布：4 在入库、3 在初筛、3 在复试、2 在终面、3 在拟录用、2 已 Offer、3 已入职
  const candidateNames = [
    '张力', '李雪', '王芳', '赵磊', '刘洋', '陈敏', '杨杰', '黄丽', '周强', '吴秀英',
    '徐明', '孙超', '马晓', '朱雷', '胡静', '郭峰', '林琳', '何伟', '高翔', '罗婷婷',
  ];
  const stageDistribution = [
    0, 0, 0, 0, // 4 入库
    1, 1, 1,    // 3 初筛
    2, 2, 2,    // 3 复试
    3, 3,       // 2 终面
    4, 4, 4,    // 3 拟录用
    5, 5,       // 2 Offer
    6, 6, 6,    // 3 已入职
  ];

  const candidates: { id: string; name: string; stageIdx: number; phone: string }[] = [];
  for (let i = 0; i < candidateNames.length; i++) {
    const phone = `138${String(20000000 + i).padStart(8, '0')}`;
    const exist = await prisma.candidate.findFirst({ where: { phone } });
    if (exist) { candidates.push({ id: exist.id, name: exist.name ?? candidateNames[i], stageIdx: i, phone }); continue; }

    const stageIdx = stageDistribution[i];
    const gender = GENDERS[i % GENDERS.length];
    const education = EDUCATIONS[i % EDUCATIONS.length];
    const source = SOURCES[i % SOURCES.length];
    const company = COMPANIES[i % COMPANIES.length];
    const school = SCHOOLS[i % SCHOOLS.length];
    const age = 24 + (i % 16);
    const workYears = Math.max(0, i % 8);
    const created = await prisma.candidate.create({
      data: {
        name: candidateNames[i],
        phone,
        email: `e2e-${candidateNames[i]}-${i}@test.local`,
        gender,
        age,
        education,
        school,
        workYears,
        currentCompany: i % 3 === 0 ? company : null,
        currentPosition: i % 3 === 0 ? '工程师' : null,
        expectedSalary: `${20 + (i % 5) * 5}k-${30 + (i % 5) * 5}k`,
        source,
        consentAt: new Date(),
        consentNote: 'E2E 自动授权',
        intro: i % 2 === 0 ? 'E2E 测试候选人' : null,
        createdById: admin.id,
      },
    });
    candidates.push({ id: created.id, name: created.name ?? candidateNames[i], stageIdx, phone });

    // 关联职位（轮流）
    const job = jobs[i % jobs.length];
    const cjExist = await prisma.candidateJob.findFirst({ where: { candidateId: created.id, jobId: job.id } });
    if (!cjExist) {
      await prisma.candidateJob.create({ data: { candidateId: created.id, jobId: job.id } });
    }

    // 阶段记录（初始入库 passed + 推进到 stageIdx）
    for (let s = 0; s <= stageIdx && s < pipelineStages.length; s++) {
      const stage = pipelineStages[s];
      const srExist = await prisma.stageRecord.findFirst({ where: { candidateId: created.id, stage } });
      if (srExist) continue;
      const enteredAt = new Date(Date.now() - (stageIdx - s) * 86400000);
      await prisma.stageRecord.create({
        data: {
          candidateId: created.id,
          stage,
          status: 'passed',
          enteredAt,
          completedAt: enteredAt,
          note: `E2E 阶段 ${stage}`,
        },
      });
    }
  }
  console.log(`[seed-e2e-data] 候选人 x${candidates.length}`);

  // 5. 面试安排（10 个，对应推进阶段 >= 2 的候选人）
  const interviewCandidates = candidates.filter((c) => c.stageIdx >= 1).slice(0, 10);
  let interviewCount = 0;
  for (const cand of interviewCandidates) {
    const exist = await prisma.interview.findFirst({ where: { candidateId: cand.id } });
    if (exist) continue;
    const job = jobs.find((j) => true);
    await prisma.interview.create({
      data: {
        candidateId: cand.id,
        jobId: job?.id ?? null,
        round: cand.stageIdx >= 4 ? '终面' : cand.stageIdx >= 2 ? '复试' : '初试',
        type: cand.stageIdx % 2 === 0 ? '视频' : '现场',
        interviewers: interviewer ? [{ id: interviewer.id, name: interviewer.name }] : [],
        scheduledAt: new Date(Date.now() + 86400000 * (cand.stageIdx + 1)),
        duration: 60,
        status: cand.stageIdx >= 4 ? 'completed' : 'scheduled',
        createdById: hr?.id ?? admin.id,
      },
    });
    interviewCount++;
  }
  console.log(`[seed-e2e-data] 面试安排 x${interviewCount}`);

  // 6. 沟通记录（每个候选人 1-3 条）
  let commCount = 0;
  for (const cand of candidates) {
    const num = Math.min(3, cand.stageIdx + 1);
    for (let i = 0; i < num; i++) {
      const exist = await prisma.communicationLog.findFirst({
        where: { candidateId: cand.id, content: { contains: `E2E 沟通#${i + 1}` } },
      });
      if (exist) continue;
      await prisma.communicationLog.create({
        data: {
          candidateId: cand.id,
          type: i % 2 === 0 ? '电话' : '邮件',
          content: `E2E 沟通#${i + 1}：${cand.name} 第 ${i + 1} 次沟通`,
          result: i === num - 1 ? '考虑中' : '已联系',
          createdById: hr?.id ?? admin.id,
        },
      });
      commCount++;
    }
  }
  console.log(`[seed-e2e-data] 沟通记录 x${commCount}`);

  // 7. 面试反馈（10 个，对应 interviewCandidates）
  let feedbackCount = 0;
  for (const cand of interviewCandidates) {
    const exist = await prisma.interviewFeedback.findFirst({ where: { candidateId: cand.id, round: '初试' } });
    if (exist) continue;
    await prisma.interviewFeedback.create({
      data: {
        candidateId: cand.id,
        round: '初试',
        interviewerName: interviewer?.name ?? '面试官',
        interviewTime: new Date(),
        conclusion: cand.stageIdx >= 3 ? 'pass' : (cand.stageIdx >= 1 ? 'pass' : 'pending'),
        feedbackContent: `<p>E2E 面试反馈：${cand.name} 表现${cand.stageIdx >= 3 ? '良好' : '中等'}</p>`,
        createdById: interviewer?.id ?? admin.id,
      },
    });
    feedbackCount++;
    // 部分加复试反馈
    if (cand.stageIdx >= 3) {
      const reExist = await prisma.interviewFeedback.findFirst({ where: { candidateId: cand.id, round: '复试' } });
      if (!reExist) {
        await prisma.interviewFeedback.create({
          data: {
            candidateId: cand.id,
            round: '复试',
            interviewerName: '复试官',
            interviewTime: new Date(),
            conclusion: cand.stageIdx >= 5 ? 'pass' : 'pending',
            feedbackContent: `<p>E2E 复试反馈：${cand.name} 综合能力${cand.stageIdx >= 5 ? '突出' : '良好'}</p>`,
            createdById: interviewer?.id ?? admin.id,
          },
        });
        feedbackCount++;
      }
    }
  }
  console.log(`[seed-e2e-data] 面试反馈 x${feedbackCount}`);

  // 8. Offer（5 个，对应 stageIdx >= 4 的候选人）
  let offerCount = 0;
  for (const cand of candidates.filter((c) => c.stageIdx >= 4)) {
    const exist = await prisma.offer.findFirst({ where: { candidateId: cand.id } });
    if (exist) continue;
    const status = cand.stageIdx >= 6 ? 'sent' : 'approved';
    const result = cand.stageIdx >= 6 ? 'accepted' : 'pending';
    await prisma.offer.create({
      data: {
        candidateId: cand.id,
        salary: `${20 + (offerCount * 2)}000`,
        offerDate: new Date(),
        expectedJoinDate: new Date(Date.now() + 30 * 86400000),
        result,
        joined: cand.stageIdx >= 6,
        status,
        approverId: admin.id,
        approveNote: cand.stageIdx >= 6 ? 'E2E 已入职' : 'E2E 审批通过',
        approvedAt: new Date(),
        note: 'E2E 测试 Offer',
      },
    });
    offerCount++;
  }
  console.log(`[seed-e2e-data] Offer x${offerCount}`);

  // 9. 编制申请（5 个，approved/pending 混合）
  const hcDefs = [
    { title: '高级前端工程师', department: '技术部', level: 'P6', headcount: 2, urgency: 'urgent', reason: 'new', status: 'approved' as const },
    { title: '后端工程师', department: '技术部', level: 'P5', headcount: 1, urgency: 'normal', reason: 'replacement', status: 'approved' as const },
    { title: '数据分析师', department: '数据部', level: 'P6', headcount: 3, urgency: 'urgent', reason: 'new', status: 'pending' as const },
    { title: '测试开发', department: '技术部', level: 'P5', headcount: 1, urgency: 'low', reason: 'expansion', status: 'approved' as const },
    { title: '产品助理', department: '产品部', level: 'P4', headcount: 1, urgency: 'normal', reason: 'replacement', status: 'pending' as const },
  ];
  let hcCount = 0;
  for (const h of hcDefs) {
    const exist = await prisma.hCRequest.findFirst({ where: { title: h.title } });
    if (exist) continue;
    await prisma.hCRequest.create({
      data: {
        title: h.title,
        department: h.department,
        level: h.level,
        headcount: h.headcount,
        urgency: h.urgency,
        reason: h.reason,
        status: h.status,
        requesterId: hiring?.id ?? admin.id,
        approverId: h.status === 'approved' ? admin.id : null,
        approveNote: h.status === 'approved' ? 'E2E 审批通过' : null,
        approvedAt: h.status === 'approved' ? new Date() : null,
      },
    });
    hcCount++;
  }
  console.log(`[seed-e2e-data] 编制申请 x${hcCount}`);

  // 10. 通知（多种类型，每种 2-3 条）
  const notifData: Array<{ type: string; title: string; content: string }> = [
    { type: 'stage_change', title: '阶段变动', content: '候选人 张力 进入了初筛阶段' },
    { type: 'stage_change', title: '阶段变动', content: '候选人 王芳 进入了复试阶段' },
    { type: 'stage_change', title: '阶段变动', content: '候选人 赵磊 进入了终面阶段' },
    { type: 'interview_reminder', title: '面试提醒', content: '李雪 的视频面试安排在明天下午 2 点' },
    { type: 'interview_reminder', title: '面试提醒', content: '周强 的现场面试安排在后天上午 10 点' },
    { type: 'offer', title: 'Offer 通知', content: '赵磊 的 Offer 已审批通过，请确认发送' },
    { type: 'offer', title: 'Offer 通知', content: '刘洋 的 Offer 已发送，等待候选人答复' },
    { type: 'hc_request', title: '编制审批', content: '高级前端工程师 编制申请已通过审批' },
    { type: 'hc_request', title: '编制审批', content: '后端工程师 编制申请已通过审批' },
    { type: 'system', title: '系统通知', content: '本周新增候选人 5 人，请关注' },
  ];
  let notifCount = 0;
  for (const n of notifData) {
    const exist = await prisma.notification.findFirst({ where: { recipientId: admin.id, title: n.title, content: n.content } });
    if (exist) continue;
    await prisma.notification.create({
      data: { recipientId: admin.id, title: n.title, content: n.content, type: n.type },
    });
    notifCount++;
  }
  console.log(`[seed-e2e-data] 通知 x${notifCount}`);

  console.log('\n🎉 e2e 业务数据种子完成');
  console.log(`   职位 ${jobs.length} | 候选人 ${candidates.length} | 面试 ${interviewCount} | 反馈 ${feedbackCount} | 沟通 ${commCount} | Offer ${offerCount} | 编制 ${hcCount} | 通知 ${notifCount}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
}).finally(() => prisma.$disconnect());