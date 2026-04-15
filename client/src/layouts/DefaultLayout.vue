<template>
  <el-container class="layout-container">
    <!-- 侧边栏 -->
    <el-aside 
      class="sidebar" 
      :width="sidebarWidth"
      :class="{ collapsed: appStore.sidebarCollapsed }"
    >
      <div class="logo">
        <span class="logo-text" v-if="!appStore.sidebarCollapsed">辰航卓越</span>
        <span v-else class="logo-mini">辰</span>
      </div>
      
      <el-menu
        :default-active="activeMenu"
        :collapse="appStore.sidebarCollapsed"
        :collapse-transition="false"
        router
        class="sidebar-menu"
        background-color="#304156"
        text-color="#bfcbd9"
        active-text-color="#409EFF"
      >
        <el-menu-item v-for="item in menuItems" :key="item.path" :index="item.path">
          <el-icon>
            <component :is="item.icon" />
          </el-icon>
          <template #title>{{ item.title }}</template>
        </el-menu-item>
      </el-menu>
    </el-aside>

    <el-container class="main-container">
      <!-- 顶部导航 -->
      <el-header class="header">
        <div class="header-left">
          <el-icon 
            class="collapse-btn"
            @click="appStore.toggleSidebar()"
          >
            <Fold v-if="!appStore.sidebarCollapsed" />
            <Expand v-else />
          </el-icon>
          <span class="page-title">{{ route.meta.title }}</span>
        </div>
        
        <div class="header-right">
          <el-dropdown @command="handleCommand">
            <span class="user-info">
              {{ authStore.userName }}
              <el-icon><ArrowDown /></el-icon>
            </span>
            <template #dropdown>
              <el-dropdown-menu>
                <el-dropdown-item command="profile">
                  <el-icon><User /></el-icon>个人中心
                </el-dropdown-item>
                <el-dropdown-item divided command="logout">
                  <el-icon><SwitchButton /></el-icon>退出登录
                </el-dropdown-item>
              </el-dropdown-menu>
            </template>
          </el-dropdown>
        </div>
      </el-header>

      <!-- 主内容区 -->
      <el-main class="main-content">
        <router-view v-slot="{ Component }">
          <transition name="fade-transform" mode="out-in">
            <keep-alive>
              <component :is="Component" :key="$route.path" />
            </keep-alive>
          </transition>
        </router-view>
      </el-main>
    </el-container>
  </el-container>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useAuthStore } from '@/stores/auth';
import { useAppStore } from '@/stores/app';
import {
  Odometer,
  Briefcase,
  UserFilled,
  DocumentChecked,
  TrendCharts,
  User,
  Fold,
  Expand,
  ArrowDown,
  SwitchButton,
} from '@element-plus/icons-vue';
import { ElMessage, ElMessageBox } from 'element-plus';

const route = useRoute();
const router = useRouter();
const authStore = useAuthStore();
const appStore = useAppStore();

// 侧边栏宽度
const sidebarWidth = computed(() => appStore.sidebarCollapsed ? '64px' : '210px');

// 当前激活的菜单
const activeMenu = computed(() => route.path);

// 菜单项
const menuItems = computed(() => {
  const items = [
    { path: '/dashboard', title: '仪表盘', icon: Odometer },
    { path: '/jobs', title: '职位管理', icon: Briefcase },
    { path: '/candidates', title: '候选人管理', icon: UserFilled },
    { path: '/offers', title: 'Offer管理', icon: DocumentChecked },
    { path: '/stats', title: '数据统计', icon: TrendCharts },
  ];
  
  // 仅管理员可见成员管理
  if (authStore.isAdmin) {
    items.push({ path: '/users', title: '成员管理', icon: User });
  }
  
  return items;
});

// 处理下拉菜单命令
async function handleCommand(command: string) {
  switch (command) {
    case 'profile':
      router.push('/profile');
      break;
    case 'logout':
      try {
        await ElMessageBox.confirm('确定要退出登录吗？', '提示', {
          confirmButtonText: '确定',
          cancelButtonText: '取消',
          type: 'warning',
        });
        await authStore.logout();
        ElMessage.success('已退出登录');
      } catch {
        // 用户取消
      }
      break;
  }
}
</script>

<style scoped lang="scss">
.layout-container {
  height: 100vh;
  width: 100vw;
  overflow: hidden;
}

.sidebar {
  background-color: #304156;
  transition: width 0.3s;
  
  .logo {
    height: 60px;
    display: flex;
    align-items: center;
    justify-content: center;
    border-bottom: 1px solid #1f2d3d;
    
    .logo-text {
      color: #fff;
      font-size: 16px;
      font-weight: bold;
    }
    
    .logo-mini {
      font-size: 24px;
      font-weight: bold;
      color: #409EFF;
    }
  }
  
  .sidebar-menu {
    border-right: none;
  }
}

.main-container {
  background-color: #f0f2f5;
}

.header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  background-color: #fff;
  box-shadow: 0 1px 4px rgba(0, 21, 41, 0.08);
  
  .header-left {
    display: flex;
    align-items: center;
    
    .collapse-btn {
      font-size: 20px;
      cursor: pointer;
      margin-right: 15px;
      
      &:hover {
        color: #409EFF;
      }
    }
    
    .page-title {
      font-size: 16px;
      font-weight: 500;
    }
  }
  
  .header-right {
    .user-info {
      cursor: pointer;
      display: flex;
      align-items: center;
      gap: 8px;
      
      &:hover {
        color: #409EFF;
      }
    }
  }
}

.main-content {
  padding: 20px;
  overflow-y: auto;
}

// 页面切换动画
.fade-transform-leave-active,
.fade-transform-enter-active {
  transition: all 0.3s;
}

.fade-transform-enter-from {
  opacity: 0;
  transform: translateX(-30px);
}

.fade-transform-leave-to {
  opacity: 0;
  transform: translateX(30px);
}
</style>
