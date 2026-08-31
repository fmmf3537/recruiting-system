import { mount } from '@vue/test-utils';
import { defineComponent, ref } from 'vue';
import { describe, it, expect } from 'vitest';
import ElementPlus from 'element-plus';
import { TableSkeleton } from '@/components/Skeleton';

const ListFixture = defineComponent({
  components: { TableSkeleton },
  props: {
    loading: { type: Boolean, default: false },
    error: { type: Boolean, default: false },
    items: { type: Array, default: () => [] },
  },
  template: `
    <div>
      <el-empty v-if="error && !loading" description="加载失败" />
      <TableSkeleton v-else-if="loading" :row-count="5" />
      <div v-else class="data-ready">{{ items.length }}</div>
    </div>
  `,
});

const mountOptions = {
  global: { plugins: [ElementPlus] },
};

describe('骨架屏集成', () => {
  it('loading=true 时骨架屏可见', () => {
    const wrapper = mount(ListFixture, {
      ...mountOptions,
      props: { loading: true, error: false, items: [] },
    });
    expect(wrapper.findComponent(TableSkeleton).exists()).toBe(true);
    expect(wrapper.find('.el-empty').exists()).toBe(false);
    expect(wrapper.find('.data-ready').exists()).toBe(false);
  });

  it('数据到达后骨架屏消失', async () => {
    const Host = defineComponent({
      components: { ListFixture },
      setup() {
        const loading = ref(true);
        const items = ref<string[]>([]);
        const reveal = () => {
          items.value = ['a'];
          loading.value = false;
        };
        return { loading, items, reveal };
      },
      template: `
        <ListFixture :loading="loading" :items="items" />
        <button class="reveal-btn" @click="reveal">reveal</button>
      `,
    });

    const wrapper = mount(Host, mountOptions);
    expect(wrapper.findComponent(TableSkeleton).exists()).toBe(true);

    await wrapper.find('.reveal-btn').trigger('click');
    expect(wrapper.findComponent(TableSkeleton).exists()).toBe(false);
    expect(wrapper.find('.data-ready').text()).toBe('1');
  });

  it('错误时仍显示 el-empty（不显示骨架屏）', () => {
    const wrapper = mount(ListFixture, {
      ...mountOptions,
      props: { loading: false, error: true, items: [] },
    });
    expect(wrapper.find('.el-empty').exists()).toBe(true);
    expect(wrapper.findComponent(TableSkeleton).exists()).toBe(false);
    expect(wrapper.find('.data-ready').exists()).toBe(false);
  });
});
