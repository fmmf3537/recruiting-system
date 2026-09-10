import { randomUUID } from 'crypto';

import { expect, type APIRequestContext } from '@playwright/test';

/** 职位创建入参骨架（P2 才用） */
export type JobInput = {
  title: string;
  departments: string[];
  level: string;
  location: string;
  type: string;
  description: string;
  requirements: string;
};

/**
 * 通过 API 创建职位（骨架，smoke 不调用；P2 数据工厂用）
 */
export async function makeJob(
  request: APIRequestContext,
  over: Partial<JobInput> = {}
): Promise<{ id: string; title: string; suffix: string }> {
  const suffix = randomUUID().slice(0, 8);
  const title = over.title ?? `E2E职位-${suffix}`;
  const res = await request.post('/api/jobs', {
    data: {
      title,
      departments: ['研发部'],
      level: '中级',
      location: '上海',
      type: '全职',
      description: 'E2E 自动创建职位',
      requirements: 'E2E 要求',
      ...over,
    },
  });
  expect(res.ok()).toBeTruthy();
  const body = (await res.json()) as { data: { id: string } };
  return { id: body.data.id, title, suffix };
}
