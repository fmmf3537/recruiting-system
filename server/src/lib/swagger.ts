import swaggerJsdoc from 'swagger-jsdoc';
import swaggerUi from 'swagger-ui-express';
import { type Application } from 'express';
import { env } from './env';

const options: swaggerJsdoc.Options = {
  definition: {
    openapi: '3.0.0',
    info: {
      title: '招聘管理系统 API',
      version: '1.0.0',
      description: '招聘管理系统（ATS）后端 API 文档',
    },
    servers: [
      {
        url: env.NODE_ENV === 'production' ? '/api' : `http://localhost:${env.PORT}/api`,
        description: 'API 服务器',
      },
    ],
    components: {
      securitySchemes: {
        bearerAuth: {
          type: 'http',
          scheme: 'bearer',
          bearerFormat: 'JWT',
        },
      },
    },
  },
  apis: ['./src/routes/*.ts', './src/controllers/*.ts'],
};

const specs = swaggerJsdoc(options);

export function setupSwagger(app: Application): void {
  app.use('/api/docs', swaggerUi.serve, swaggerUi.setup(specs));
}
