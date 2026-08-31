-- AlterEnum：扩展 UserRole，只追加值，不改现有 admin/member
-- PostgreSQL 11+ 允许同一条 migration 加多个 enum 值
ALTER TYPE "UserRole" ADD VALUE 'hiring_manager';
ALTER TYPE "UserRole" ADD VALUE 'interviewer';
