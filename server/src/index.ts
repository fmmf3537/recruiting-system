import express from 'express';
import cors from 'cors';
import morgan from 'morgan';
import dotenv from 'dotenv';

import { errorHandler } from '@middleware/error';
import authRoutes from '@routes/auth';
import userRoutes from '@routes/user';
import jobRoutes from '@routes/job';
import candidateRoutes from '@routes/candidate';
import interviewRoutes from '@routes/interview';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3001;

// 中间件
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(morgan('dev'));

// 健康检查
app.get('/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// API 路由
app.use('/auth', authRoutes);
app.use('/users', userRoutes);
app.use('/jobs', jobRoutes);
app.use('/candidates', candidateRoutes);
app.use('/interviews', interviewRoutes);

// 404 处理
app.use((_req, res) => {
  res.status(404).json({ message: '路由不存在' });
});

// 错误处理
app.use(errorHandler);

app.listen(PORT, () => {
  // eslint-disable-next-line no-console
  console.log(`🚀 Server running on http://localhost:${PORT}`);
});

export default app;
