import { Router, type Router as RouterType } from 'express';
import authRoutes from './auth';
import userRoutes from './users';
import jobRoutes from './jobs';
import candidateRoutes from './candidates';
import offerRoutes from './offers';
import statsRoutes from './stats';
import uploadRoutes from './upload';
import dictionaryRoutes from './dictionaries';
import tagRoutes from './tags';
import emailRoutes from './email';
import aiMatcherRoutes from './ai-matcher';
import onboardingTaskRoutes from './onboarding-task';

const router: RouterType = Router();

// 健康检查
router.get('/health', (_req, res) => {
  res.json({
    success: true,
    data: {
      status: 'ok',
      timestamp: new Date().toISOString(),
      version: '1.0.0',
    },
  });
});

// 挂载各模块路由
router.use('/auth', authRoutes);
router.use('/users', userRoutes);
router.use('/jobs', jobRoutes);
router.use('/candidates', candidateRoutes);
router.use('/offers', offerRoutes);
router.use('/stats', statsRoutes);
router.use('/upload', uploadRoutes);
router.use('/dictionaries', dictionaryRoutes);
router.use('/tags', tagRoutes);
router.use('/email', emailRoutes);
router.use('/ai-matcher', aiMatcherRoutes);
router.use('/onboarding-tasks', onboardingTaskRoutes);

export default router;
