import { defineStore } from 'pinia';
import { ref } from 'vue';

// 侧边栏折叠状态
export type SidebarCollapsed = boolean;

// 主题类型
export type Theme = 'light' | 'dark';

// 标签页项
export interface TabItem {
  name: string;
  title: string;
  path: string;
}

export const useAppStore = defineStore('app', () => {
  // State
  const sidebarCollapsed = ref<SidebarCollapsed>(false);
  const theme = ref<Theme>('light');
  const tabs = ref<TabItem[]>([]);
  const activeTab = ref<string>('');
  const isLoading = ref(false);

  // Actions

  /**
   * 切换侧边栏折叠状态
   */
  function toggleSidebar() {
    sidebarCollapsed.value = !sidebarCollapsed.value;
  }

  /**
   * 设置侧边栏折叠状态
   */
  function setSidebarCollapsed(collapsed: boolean) {
    sidebarCollapsed.value = collapsed;
  }

  /**
   * 设置主题
   */
  function setTheme(newTheme: Theme) {
    theme.value = newTheme;
    document.documentElement.setAttribute('data-theme', newTheme);
  }

  /**
   * 添加标签页
   */
  function addTab(tab: TabItem) {
    const exists = tabs.value.find((t) => t.name === tab.name);
    if (!exists) {
      tabs.value.push(tab);
    }
    activeTab.value = tab.name;
  }

  /**
   * 移除标签页
   */
  function removeTab(name: string) {
    const index = tabs.value.findIndex((t) => t.name === name);
    if (index > -1) {
      tabs.value.splice(index, 1);
      // 如果关闭的是当前标签，切换到相邻标签
      if (activeTab.value === name && tabs.value.length > 0) {
        const newIndex = index > 0 ? index - 1 : 0;
        activeTab.value = tabs.value[newIndex].name;
      }
    }
  }

  /**
   * 设置当前活动标签
   */
  function setActiveTab(name: string) {
    activeTab.value = name;
  }

  /**
   * 设置全局加载状态
   */
  function setLoading(loading: boolean) {
    isLoading.value = loading;
  }

  return {
    sidebarCollapsed,
    theme,
    tabs,
    activeTab,
    isLoading,
    toggleSidebar,
    setSidebarCollapsed,
    setTheme,
    addTab,
    removeTab,
    setActiveTab,
    setLoading,
  };
});
