-- 为审计日志补充来源与结果。字段允许为空，兼容历史日志。
ALTER TABLE "operation_log" ADD COLUMN "source" TEXT;
ALTER TABLE "operation_log" ADD COLUMN "result" TEXT;
CREATE INDEX "operation_log_source_idx" ON "operation_log"("source");
CREATE INDEX "operation_log_result_idx" ON "operation_log"("result");
