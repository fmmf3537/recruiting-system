-- AlterEnum：追加 hr（member 数据迁移的前置条件）
-- PostgreSQL 不允许在同一事务中使用刚 ADD 的 enum 值，故与 UPDATE 拆成两条 migration
ALTER TYPE "UserRole" ADD VALUE 'hr';
