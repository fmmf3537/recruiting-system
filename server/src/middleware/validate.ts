import type { Request, Response, NextFunction } from 'express';
import { z, type ZodSchema, type ZodError } from 'zod';
import { AppError } from './errorHandler';

/**
 * 请求参数验证中间件
 * @param schema Zod 验证 schema
 * @param source 验证的数据来源: 'body' | 'query' | 'params'
 */
export const validate = (
  schema: ZodSchema,
  source: 'body' | 'query' | 'params' = 'body'
) => {
  return (req: Request, _res: Response, next: NextFunction): void => {
    try {
      const data = req[source];
      const result = schema.safeParse(data);

      if (!result.success) {
        const errorMessage = formatZodError(result.error);
        throw new AppError(errorMessage, 400);
      }

      // 将验证后的数据替换到请求对象
      req[source] = result.data;
      next();
    } catch (error) {
      next(error);
    }
  };
};

/**
 * 格式化 Zod 错误信息
 */
const formatZodError = (error: ZodError): string => {
  const errors = error.errors.map((err) => {
    const path = err.path.join('.');
    return path ? `${path}: ${err.message}` : err.message;
  });
  return errors.join('; ');
};

/**
 * 同时验证多个来源的数据
 * @param schemas 包含 body、query、params 的 schema 对象
 */
export const validateAll = (schemas: {
  body?: ZodSchema;
  query?: ZodSchema;
  params?: ZodSchema;
}) => {
  return (req: Request, _res: Response, next: NextFunction): void => {
    try {
      // 验证 body
      if (schemas.body) {
        const bodyResult = schemas.body.safeParse(req.body);
        if (!bodyResult.success) {
          throw new AppError(formatZodError(bodyResult.error), 400);
        }
        req.body = bodyResult.data;
      }

      // 验证 query
      if (schemas.query) {
        const queryResult = schemas.query.safeParse(req.query);
        if (!queryResult.success) {
          throw new AppError(formatZodError(queryResult.error), 400);
        }
        req.query = queryResult.data;
      }

      // 验证 params
      if (schemas.params) {
        const paramsResult = schemas.params.safeParse(req.params);
        if (!paramsResult.success) {
          throw new AppError(formatZodError(paramsResult.error), 400);
        }
        req.params = paramsResult.data;
      }

      next();
    } catch (error) {
      next(error);
    }
  };
};

// 常用验证 schema
export const commonSchemas = {
  // ID 参数验证
  idParam: z.object({
    id: z.string().cuid(),
  }),

  // 分页参数验证
  pagination: z.object({
    page: z.string().optional().default('1').transform(Number),
    limit: z.string().optional().default('10').transform(Number),
  }),

  // 排序参数验证
  sorting: z.object({
    sortBy: z.string().optional(),
    sortOrder: z.enum(['asc', 'desc']).optional().default('desc'),
  }),
};

export default validate;
