<script setup lang="ts">
import { computed } from 'vue';
import { useRoute } from 'vue-router';
import { routes } from '@router/index';
import { useAuthStore } from '@/stores/auth';

const route = useRoute();
const authStore = useAuthStore();

const menuItems = computed(() => {
  const layoutRoute = routes.find((r) => r.name === 'Layout');
  return layoutRoute?.children?.filter((item) => {
    // 隐藏的路由不显示
    if (item.meta?.hidden) return false;
    // 需要管理员权限的路由，只有管理员显示
    if (item.meta?.requireAdmin && !authStore.isAdmin) return false;
    return true;
  }) || [];
});

const activeMenu = computed(() => route.path);
</script>

<template>
  <div class="sidebar-container">
    <div class="logo">
      <el-icon :size="24"><i-ep-collection /></el-icon>
      <span class="title">招聘系统</span>
    </div>
    <el-menu
      :default-active="activeMenu"
      router
      background-color="#304156"
      text-color="#bfcbd9"
      active-text-color="#409EFF"
    >
      <el-menu-item v-for="item in menuItems" :key="item.path" :index="`/${item.path}`">
        <el-icon>
          <component :is="item.meta?.icon" />
        </el-icon>
        <template #title>{{ item.meta?.title }}</template>
      </el-menu-item>
    </el-menu>
  </div>
</template>

<style scoped lang="scss">
.sidebar-container {
  height: 100%;
}

.logo {
  height: 50px;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 0 16px;
  background-color: #2b3649;

  .title {
    margin-left: 12px;
    font-size: 16px;
    font-weight: 600;
    color: #fff;
  }
}

.el-menu {
  border-right: none;
}
</style>
