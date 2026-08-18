-- AlterTable
-- User 表新增 tokenVersion：JWT 吊销版本号，改密/重置密码时 +1 使旧 token 失效
ALTER TABLE "user" ADD COLUMN     "tokenVersion" INTEGER NOT NULL DEFAULT 0;
