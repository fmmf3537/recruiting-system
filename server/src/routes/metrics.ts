import { Router } from 'express';

import { register } from '../lib/metrics';

const router = Router();

// Prometheus 抓取通常不带 JWT，此端点不强制鉴权
router.get('/', async (_req, res) => {
  res.set('Content-Type', register.contentType);
  res.send(await register.metrics());
});

export default router;
