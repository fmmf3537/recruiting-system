import { mount } from '@vue/test-utils';
import { describe, it, expect } from 'vitest';
import ElementPlus from 'element-plus';
import TableSkeleton from '@/components/Skeleton/TableSkeleton.vue';
import CardSkeleton from '@/components/Skeleton/CardSkeleton.vue';

describe('Skeleton 组件', () => {
  it('TableSkeleton 默认渲染 5 行', () => {
    const wrapper = mount(TableSkeleton, {
      global: { plugins: [ElementPlus] },
    });
    expect(wrapper.findAll('.el-skeleton__item').length).toBeGreaterThan(0);
    expect(wrapper.findAll('.table-skeleton-row').length).toBe(5);
  });

  it('TableSkeleton 接受 rowCount prop', () => {
    const wrapper = mount(TableSkeleton, {
      props: { rowCount: 10 },
      global: { plugins: [ElementPlus] },
    });
    expect(wrapper.exists()).toBe(true);
    expect(wrapper.findAll('.table-skeleton-row').length).toBe(10);
  });

  it('CardSkeleton 渲染统计卡片占位', () => {
    const wrapper = mount(CardSkeleton, {
      global: { plugins: [ElementPlus] },
    });
    expect(wrapper.findAll('.el-skeleton__item').length).toBeGreaterThan(4);
  });
});
