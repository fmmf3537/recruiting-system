import { Router, type Router as RouterType } from 'express';

import { getHealthSnapshot } from '../services/health.service';

import authRoutes from './auth';
import userRoutes from './users';
import jobRoutes from './jobs';
import candidateRoutes from './candidates';
import offerRoutes from './offers';
import hiringRoutes from './hiring';
import interviewWorkbenchRoutes from './interview';
import statsRoutes from './stats';
import uploadRoutes from './upload';
import fileRoutes from './files';
import dictionaryRoutes from './dictionaries';
import tagRoutes from './tags';
import emailRoutes from './email';
import aiMatcherRoutes from './ai-matcher';
import onboardingTaskRoutes from './onboarding-task';
import interviewRoutes from './interviews';
import evaluationRoutes from './evaluations';
import communicationRoutes from './communications';
import automationRuleRoutes from './automation-rule';
import metricsRoutes from './metrics';
import notificationRoutes from './notification';
import hcRequestRoutes from './hc-requests';
import pipelineTemplateRoutes from './pipeline-templates';

const router: RouterType = Router();

// 健康检查（DB / Redis / BullMQ；DB 失败 503，其余 200）
router.get('/health', async (_req, res) => {
  const result = await getHealthSnapshot();
  const httpStatus = result.status === 'fail' ? 503 : 200;
  res.status(httpStatus).json({ success: result.status === 'ok', data: result });
});

// Prometheus 抓取（不强制 JWT）
router.use('/metrics', metricsRoutes);

// 挂载各模块路由
router.use('/auth', authRoutes);
router.use('/users', userRoutes);
router.use('/jobs', jobRoutes);
router.use('/candidates', candidateRoutes);
router.use('/offers', offerRoutes);
router.use('/hiring', hiringRoutes);
router.use('/interview', interviewWorkbenchRoutes);
router.use('/stats', statsRoutes);
router.use('/upload', uploadRoutes);
router.use('/files', fileRoutes);
router.use('/dictionaries', dictionaryRoutes);
router.use('/tags', tagRoutes);
router.use('/email', emailRoutes);
router.use('/ai-matcher', aiMatcherRoutes);
router.use('/onboarding-tasks', onboardingTaskRoutes);
router.use('/interviews', interviewRoutes);
router.use('/evaluations', evaluationRoutes);
router.use('/communications', communicationRoutes);
router.use('/automation-rules', automationRuleRoutes);
router.use('/notifications', notificationRoutes);
router.use('/hc-requests', hcRequestRoutes);
router.use('/pipeline-templates', pipelineTemplateRoutes);

export default router;
