import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock prisma before importing the service
vi.mock('../../src/lib/prisma', () => ({
  default: {
    uploadRecord: {
      findUnique: vi.fn(),
      create: vi.fn(),
      delete: vi.fn(),
    },
    candidate: {
      findFirst: vi.fn(),
    },
    operationLog: {
      create: vi.fn(),
    },
  },
}));

import prisma from '../../src/lib/prisma';
import {
  assertCanAccessFile,
  getUploadRecordOrThrow,
  logResumeDownload,
} from '../../src/services/file.service';
import type { JwtPayload } from '../../src/middleware/auth';

// 测试用用户
const adminUser: JwtPayload = {
  userId: 'admin-1',
  email: 'admin@test.com',
  role: 'admin',
  department: null,
};
const memberUser: JwtPayload = {
  userId: 'member-1',
  email: 'member@test.com',
  role: 'member',
  department: '技术部',
};

const mockRecord = {
  id: 'record-1',
  filename: '3f8a2c1e-1234-4abc-8def-0123456789ab.pdf',
  originalName: '张三-简历.pdf',
  mimetype: 'application/pdf',
  size: 1024,
  uploadedById: 'member-1',
  createdAt: new Date(),
};

describe('file.service - 文件服务单元测试', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('assertCanAccessFile - 访问权限校验', () => {
    it('应拒绝包含路径遍历字符的文件名', async () => {
      await expect(assertCanAccessFile('../.env', adminUser)).rejects.toThrow('非法文件名');
      await expect(assertCanAccessFile('a/b.pdf', adminUser)).rejects.toThrow('非法文件名');
      await expect(assertCanAccessFile('a\\b.pdf', adminUser)).rejects.toThrow('非法文件名');
    });

    it('admin 可直接访问', async () => {
      await expect(assertCanAccessFile(mockRecord.filename, adminUser)).resolves.toBeUndefined();
    });

    it('上传者本人可访问', async () => {
      vi.mocked(prisma.uploadRecord.findUnique).mockResolvedValue(mockRecord);
      await expect(assertCanAccessFile(mockRecord.filename, memberUser)).resolves.toBeUndefined();
    });

    it('候选人创建者可访问其简历', async () => {
      vi.mocked(prisma.uploadRecord.findUnique).mockResolvedValue(null);
      vi.mocked(prisma.candidate.findFirst).mockResolvedValue({ createdById: 'member-1' } as never);
      await expect(assertCanAccessFile(mockRecord.filename, memberUser)).resolves.toBeUndefined();
    });

    it('无权限用户应返回 403', async () => {
      vi.mocked(prisma.uploadRecord.findUnique).mockResolvedValue(null);
      vi.mocked(prisma.candidate.findFirst).mockResolvedValue(null);
      await expect(assertCanAccessFile(mockRecord.filename, memberUser)).rejects.toThrow(
        '没有权限访问此文件'
      );
    });
  });

  describe('getUploadRecordOrThrow - 文件记录校验', () => {
    it('记录存在时返回记录', async () => {
      vi.mocked(prisma.uploadRecord.findUnique).mockResolvedValue(mockRecord);
      const result = await getUploadRecordOrThrow(mockRecord.filename);
      expect(result).toEqual(mockRecord);
      expect(prisma.uploadRecord.findUnique).toHaveBeenCalledWith({
        where: { filename: mockRecord.filename },
      });
    });

    it('记录不存在时应返回 404', async () => {
      vi.mocked(prisma.uploadRecord.findUnique).mockResolvedValue(null);
      await expect(getUploadRecordOrThrow('not-exist.pdf')).rejects.toThrow('文件不存在');
    });
  });

  describe('logResumeDownload - 下载操作日志', () => {
    it('应写入 action 为 resume_download 的 OperationLog', async () => {
      vi.mocked(prisma.operationLog.create).mockResolvedValue({} as never);
      await logResumeDownload(memberUser, mockRecord);
      expect(prisma.operationLog.create).toHaveBeenCalledWith({
        data: {
          userId: memberUser.userId,
          targetType: 'UploadRecord',
          targetId: mockRecord.id,
          action: 'resume_download',
          detail: {
            filename: mockRecord.filename,
            originalName: mockRecord.originalName,
          },
        },
      });
    });

    it('写日志失败时不应抛出异常（不阻断下载）', async () => {
      vi.mocked(prisma.operationLog.create).mockRejectedValue(new Error('db error'));
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
      await expect(logResumeDownload(memberUser, mockRecord)).resolves.toBeUndefined();
      consoleSpy.mockRestore();
    });
  });
});
