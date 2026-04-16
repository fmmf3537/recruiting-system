import { defineStore } from 'pinia';
import { getDictionaries, type DictionaryItem } from '@/api/dictionary';

interface DictionaryState {
  items: DictionaryItem[];
  loading: boolean;
  loadedCategories: Set<string>;
}

export const useDictionaryStore = defineStore('dictionary', {
  state: (): DictionaryState => ({
    items: [],
    loading: false,
    loadedCategories: new Set(),
  }),

  getters: {
    byCategory: (state) => {
      return (category: string, includeDisabled = false) => {
        let list = state.items.filter((item) => item.category === category);
        if (!includeDisabled) {
          list = list.filter((item) => item.enabled);
        }
        return list.sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name));
      };
    },

    departmentOptions() {
      return this.byCategory('department');
    },

    locationOptions() {
      return this.byCategory('location');
    },
  },

  actions: {
    async fetchDictionaries(category?: string, force = false) {
      if (!force && category && this.loadedCategories.has(category)) {
        return;
      }

      this.loading = true;
      try {
        const res = await getDictionaries({ category, includeDisabled: true });
        if (res.success) {
          if (category) {
            // 移除旧分类数据，避免重复
            this.items = this.items.filter((item) => item.category !== category);
            this.loadedCategories.add(category);
          } else {
            this.items = [];
            this.loadedCategories.clear();
            res.data.forEach((item) => this.loadedCategories.add(item.category));
          }
          this.items.push(...res.data);
        }
      } catch (error) {
        console.error('[DictionaryStore] fetch failed:', error);
      } finally {
        this.loading = false;
      }
    },

    refreshCategory(category: string) {
      return this.fetchDictionaries(category, true);
    },
  },
});
