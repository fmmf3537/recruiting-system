import { describe, it, expect, vi, beforeEach } from 'vitest';

// mock prisma（覆盖 referral / candidate 链路所需的表）
vi.mock('../../src/lib/prisma', () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const mock: any = {
    agencyLink: {
      findUnique: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
    },
    agency: {
      findUnique: vi.fn(),
    },
    candidate: {
      findUnique: vi.fn(),
      create: vi.fn(),
      count: vi.fn(),
    },
    candidateJob: {
      create: vi.fn(),
    },
    uploadRecord: {
      create: vi.fn(),
    },
    operationLog: {
      create: vi.fn(),
    },
    $queryRaw: vi.fn(),
    $transaction: vi.fn(),
  };
  return { default: mock };
});

// mock file.service (createUploadRecord)
vi.mock('../../src/services/file.service', () => ({
  createUploadRecord: vi.fn().mockResolvedValue({ id: 'upload-1' }),
}));

// mock utils/upload-file (validateAndRenameUpload + buildFileApiPath)
vi.mock('../../src/utils/upload-file', () => ({
  validateAndRenameUpload: vi
    .fn()
    .mockResolvedValue({ filename: 'abc-uuid.pdf', mimetype: 'application/pdf', size: 1024 }),
  buildFileApiPath: vi.fn((filename: string) => `/api/files/${filename}`),
}));

// mock candidate.service（避免走完整链路）
vi.mock('../../src/services/candidate.service', () => ({
  candidateService: {
    createCandidate: vi.fn(),
  },
}));

// mock duplicate-checker.service
vi.mock('../../src/services/duplicate-checker.service', () => ({
  checkDuplicate: vi.fn(),
}));

// mock notification.service
vi.mock('../../src/services/notification.service', () => ({
  createNotification: vi.fn().mockResolvedValue({ id: 'noti-1' }),
}));

// mock queue（防止启动 BullMQ；记录投递供断言）
vi.mock('../../src/lib/queue', () => ({
  resumeParseQueue: { add: vi.fn().mockResolvedValue({ id: 'q-1' }) },
}));

import prisma from '../../src/lib/prisma';
import { candidateService } from '../../src/services/candidate.service';
import { checkDuplicate } from '../../src/services/duplicate-checker.service';
import { resumeParseQueue } from '../../src/lib/queue';
import {
  getReferralInfo,
  submitReferral,
  getSubmitSuccessResponse,
} from '../../src/services/referral.service';

const LINK_ID = 'clf5stest0000000000000001';
const AGENCY_ID = 'clf5stest0000000000000002';
const USER_ID = 'user-hr-1';
const JOB_ID = 'clf5stest0000000000000003';
const CAND_ID = 'clf5stest0000000000000004';
const VALID_TOKEN = 'a'.repeat(32);

function makeLink(overrides: Record<string, unknown> = {}) {
  return {
    id: LINK_ID,
    agencyId: AGENCY_ID,
    token: VALID_TOKEN,
    jobId: null,
    expiresAt: null,
    disabledAt: null,
    createdById: USER_ID,
    createdAt: new Date(),
    agency: { id: AGENCY_ID, name: 'ACME 猎头', enabled: true },
    job: null,
    ...overrides,
  };
}

const fakeFile = {
  fieldname: 'file',
  originalname: 'resume.pdf',
  encoding: '7bit',
  mimetype: 'application/pdf',
  destination: '/tmp',
  filename: 'xxx.tmp',
  path: '/tmp/xxx.tmp',
  size: 1024,
} as unknown as Express.Multer.File;

const baseForm = {
  name: '张三',
  phone: '13800138000',
  email: '',
  reason: '强推',
};

describe('referral.service - 猎头推荐通道单元测试', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(prisma.candidateJob.create).mockResolvedValue({ id: 'cj-1' });
    vi.mocked(prisma.operationLog.create).mockResolvedValue({} as any);
    vi.mocked(candidateService.createCandidate).mockResolvedValue({
      candidate: { id: CAND_ID } as any,
    });
    vi.mocked(checkDuplicate).mockResolvedValue({ duplicates: [], hasHiddenDuplicate: false });
  });

  // ============ assertLinkUsable 4 种失效场景 ============

  it('token 不存在 → 410', async () => {
    vi.mocked(prisma.agencyLink.findUnique).mockResolvedValue(null);
    await expect(getReferralInfo(VALID_TOKEN)).rejects.toMatchObject({
      statusCode: 410,
      message: '链接已失效',
    });
  });

  it('token 格式非法（不 32 位 hex） → 410（不暴露格式细节）', async () => {
    await expect(getReferralInfo('not-hex-token')).rejects.toMatchObject({
      statusCode: 410,
      message: '链接已失效',
    });
    expect(prisma.agencyLink.findUnique).not.toHaveBeenCalled();
  });

  it('链接 disabledAt 非空 → 410', async () => {
    vi.mocked(prisma.agencyLink.findUnique).mockResolvedValue(
      makeLink({ disabledAt: new Date() }) as any
    );
    await expect(getReferralInfo(VALID_TOKEN)).rejects.toMatchObject({
      statusCode: 410,
      message: '链接已失效',
    });
  });

  it('链接 expiresAt 已过 → 410', async () => {
    vi.mocked(prisma.agencyLink.findUnique).mockResolvedValue(
      makeLink({ expiresAt: new Date(Date.now() - 1000) }) as any
    );
    await expect(getReferralInfo(VALID_TOKEN)).rejects.toMatchObject({
      statusCode: 410,
      message: '链接已失效',
    });
  });

  it('机构 enabled=false → 410', async () => {
    vi.mocked(prisma.agencyLink.findUnique).mockResolvedValue(
      makeLink({ agency: { id: AGENCY_ID, name: 'X', enabled: false } }) as any
    );
    await expect(getReferralInfo(VALID_TOKEN)).rejects.toMatchObject({
      statusCode: 410,
      message: '链接已失效',
    });
  });

  // ============ getReferralInfo ============

  it('getReferralInfo 正常：仅返回 { agencyName, jobTitle }', async () => {
    vi.mocked(prisma.agencyLink.findUnique).mockResolvedValue(
      makeLink({ jobId: JOB_ID, job: { id: JOB_ID, title: '高级前端' } }) as any
    );
    const info = await getReferralInfo(VALID_TOKEN);
    expect(info).toEqual({ agencyName: 'ACME 猎头', jobTitle: '高级前端' });
    // 字段收敛：仅两个字段，不含机构联系方式 / 创建人等
    expect(Object.keys(info).sort()).toEqual(['agencyName', 'jobTitle']);
  });

  it('getReferralInfo 无 job 时 jobTitle=null', async () => {
    vi.mocked(prisma.agencyLink.findUnique).mockResolvedValue(makeLink() as any);
    const info = await getReferralInfo(VALID_TOKEN);
    expect(info).toEqual({ agencyName: 'ACME 猎头', jobTitle: null });
  });

  // ============ submitReferral 正常路径 ============

  it('submitReferral 正常：createCandidate 不传 jobIds，candidateJob 直接 create，不触发 aiMatchScoreQueue', async () => {
    vi.mocked(prisma.agencyLink.findUnique).mockResolvedValue(
      makeLink({ jobId: JOB_ID, job: { id: JOB_ID, title: '高级前端' } }) as any
    );

    await submitReferral(VALID_TOKEN, baseForm, fakeFile);

    // 1) createCandidate 调用：source / consentNote / consentAt / education 空串，**无 jobIds**
    expect(candidateService.createCandidate).toHaveBeenCalledWith(
      expect.objectContaining({
        name: '张三',
        phone: '13800138000',
        email: '', // 邮箱选填时存空串
        education: '', // 必填占位，解析回填
        source: '猎头:ACME 猎头',
        intro: '强推',
        consentAt: expect.any(String),
        consentNote: '猎头机构（ACME 猎头）承诺已获候选人授权',
      }),
      USER_ID
    );
    const callArgs = vi.mocked(candidateService.createCandidate).mock.calls[0];
    expect(callArgs[0]).not.toHaveProperty('jobIds');
    expect(callArgs[2]).toBeUndefined(); // 不传 scope

    // 2) candidateJob.create 走直接路径，**不**走 createCandidate 的 jobIds 路径
    expect(prisma.candidateJob.create).toHaveBeenCalledWith({
      data: { candidateId: CAND_ID, jobId: JOB_ID },
    });

    // 3) 解析任务投递带 candidateId（worker 据此不删文件 + 回填）
    expect(resumeParseQueue.add).toHaveBeenCalledWith(
      'parse',
      expect.objectContaining({
        filePath: expect.stringContaining('abc-uuid.pdf'),
        mimetype: 'application/pdf',
        userId: USER_ID,
        candidateId: CAND_ID,
      })
    );

    // 4) 通知
    const { createNotification } = await import('../../src/services/notification.service');
    expect(createNotification).toHaveBeenCalledWith(
      expect.objectContaining({
        recipientId: USER_ID,
        title: '新猎头推荐：张三',
        businessId: CAND_ID,
        businessType: 'candidate',
        type: 'agency_referral',
      })
    );

    // 5) OperationLog
    expect(prisma.operationLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          action: 'agency_referral_submit',
          targetId: CAND_ID,
          detail: expect.objectContaining({
            agencyId: AGENCY_ID,
            linkId: LINK_ID,
            tokenSuffix: 'aaaa',
            duplicated: false,
          }),
        }),
      })
    );
  });

  it('submitReferral 无 job 绑定时：不调 candidateJob.create', async () => {
    vi.mocked(prisma.agencyLink.findUnique).mockResolvedValue(makeLink() as any);
    await submitReferral(VALID_TOKEN, baseForm, fakeFile);
    expect(prisma.candidateJob.create).not.toHaveBeenCalled();
  });

  // ============ 疑似重复 ============

  it('疑似重复：候选人 sourceNote 标记 + 通知带提示 + 响应仍固定文案不含 ID', async () => {
    vi.mocked(prisma.agencyLink.findUnique).mockResolvedValue(makeLink() as any);
    vi.mocked(checkDuplicate).mockResolvedValue({
      duplicates: [{ id: 'dup-1' } as any],
      hasHiddenDuplicate: false,
    });

    await submitReferral(VALID_TOKEN, baseForm, fakeFile);

    expect(candidateService.createCandidate).toHaveBeenCalledWith(
      expect.objectContaining({
        sourceNote: '疑似重复待核实（与现有候选人手机号/邮箱重复）',
      }),
      USER_ID
    );

    const { createNotification } = await import('../../src/services/notification.service');
    expect(createNotification).toHaveBeenCalledWith(
      expect.objectContaining({
        content: expect.stringContaining('疑似重复'),
      })
    );

    expect(prisma.operationLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          detail: expect.objectContaining({ duplicated: true }),
        }),
      })
    );

    // 响应：固定文案 + 不含 candidateId
    const resp = getSubmitSuccessResponse();
    expect(resp).toEqual({ success: true, message: '已提交，将由 HR 联系候选人' });
    expect(resp).not.toHaveProperty('candidateId');
    expect(resp).not.toHaveProperty('data');
  });

  // ============ email 空串策略 ============

  it('email 空串：checkDuplicate 第二参为 undefined（跳过邮箱维度）', async () => {
    vi.mocked(prisma.agencyLink.findUnique).mockResolvedValue(makeLink() as any);
    await submitReferral(VALID_TOKEN, { ...baseForm, email: '' }, fakeFile);
    expect(checkDuplicate).toHaveBeenCalledWith(
      '13800138000',
      undefined, // email 空串 → undefined
      undefined,
      undefined
    );
  });

  it('email 实际填写：checkDuplicate 第二参为邮箱值', async () => {
    vi.mocked(prisma.agencyLink.findUnique).mockResolvedValue(makeLink() as any);
    await submitReferral(VALID_TOKEN, { ...baseForm, email: 'a@b.com' }, fakeFile);
    expect(checkDuplicate).toHaveBeenCalledWith(
      '13800138000',
      'a@b.com',
      undefined,
      undefined
    );
  });

  // ============ 链接不可用 → submitReferral 同样 410 ============

  it('submitReferral 在已停用链接上抛 410，且不创建候选人 / 不投递简历', async () => {
    vi.mocked(prisma.agencyLink.findUnique).mockResolvedValue(
      makeLink({ disabledAt: new Date() }) as any
    );
    await expect(submitReferral(VALID_TOKEN, baseForm, fakeFile)).rejects.toMatchObject({
      statusCode: 410,
      message: '链接已失效',
    });
    expect(candidateService.createCandidate).not.toHaveBeenCalled();
    expect(resumeParseQueue.add).not.toHaveBeenCalled();
  });
});