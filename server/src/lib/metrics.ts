import client from 'prom-client';

export const register = new client.Registry();
client.collectDefaultMetrics({ register });

export const httpRequestDuration = new client.Histogram({
  name: 'ats_http_request_duration_seconds',
  help: 'HTTP request duration in seconds',
  labelNames: ['method', 'route', 'status_code'],
  buckets: [0.01, 0.05, 0.1, 0.5, 1, 2, 5],
  registers: [register],
});

export const httpRequestTotal = new client.Counter({
  name: 'ats_http_requests_total',
  help: 'Total HTTP requests',
  labelNames: ['method', 'route', 'status_code'],
  registers: [register],
});

export const candidateStageAdvanceTotal = new client.Counter({
  name: 'ats_candidate_stage_advance_total',
  help: 'Total candidate stage advances',
  labelNames: ['from_stage', 'to_stage', 'status'],
  registers: [register],
});

export const offerApprovalTotal = new client.Counter({
  name: 'ats_offer_approval_total',
  help: 'Total offer approval actions',
  labelNames: ['action', 'role'],
  registers: [register],
});

export const llmCallDuration = new client.Histogram({
  name: 'ats_llm_call_duration_seconds',
  help: 'LLM API call duration',
  labelNames: ['provider', 'purpose'],
  buckets: [0.5, 1, 2, 5, 10, 30, 60],
  registers: [register],
});

/** 预留给 Prisma 查询耗时；不在 prisma.ts 中埋点（禁止改动该文件） */
export const dbQueryDuration = new client.Histogram({
  name: 'ats_db_query_duration_seconds',
  help: 'Database query duration',
  labelNames: ['model', 'operation'],
  buckets: [0.001, 0.01, 0.05, 0.1, 0.5, 1, 2],
  registers: [register],
});
