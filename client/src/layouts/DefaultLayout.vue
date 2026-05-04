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
          <!-- 通知铃铛 -->
          <el-badge
            :value="notificationStore.unreadCount"
            :hidden="notificationStore.unreadCount === 0"
            :max="99"
            class="notification-badge"
          >
            <el-icon class="notification-bell" @click="toggleNotificationPanel">
              <Bell />
            </el-icon>
          </el-badge>

          <!-- 通知下拉面板 -->
          <transition name="el-zoom-in-top">
            <div v-if="showNotificationPanel" class="notification-dropdown">
              <div class="notification-panel-header">
                <span>消息通知</span>
                <el-button text size="small" @click="handleMarkAllRead">全部已读</el-button>
              </div>
              <div class="notification-panel-list">
                <div
                  v-for="item in recentNotifications"
                  :key="item.id"
                  class="notification-panel-item"
                  :class="{ unread: !item.isRead }"
                  @click="handleNotificationClick(item)"
                >
                  <div class="notif-item-title">{{ item.title }}</div>
                  <div class="notif-item-time">{{ formatRelativeTime(item.createdAt) }}</div>
                </div>
                <el-empty v-if="!recentNotifications.length" description="暂无消息" />
              </div>
              <div class="notification-panel-footer">
                <el-button text size="small" @click="goToNotifications">查看全部</el-button>
              </div>
            </div>
          </transition>

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
          <transition name="fade-transform">
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
import { computed, ref, onMounted, onUnmounted } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useAuthStore } from '@/stores/auth';
import { useAppStore } from '@/stores/app';
import { useNotificationStore } from '@/stores/notification';
import type { NotificationItem } from '@/api/notification';
import {
  Odometer,
  Briefcase,
  UserFilled,
  DocumentChecked,
  TrendCharts,
  User,
  Setting,
  Fold,
  Expand,
  ArrowDown,
  SwitchButton,
  Bell,
  Tickets,
} from '@element-plus/icons-vue';
import { ElMessage, ElMessageBox } from 'element-plus';

const route = useRoute();
const router = useRouter();
const authStore = useAuthStore();
const appStore = useAppStore();
const notificationStore = useNotificationStore();

// 通知面板
const showNotificationPanel = ref(false);

function toggleNotificationPanel() {
  showNotificationPanel.value = !showNotificationPanel.value;
  if (showNotificationPanel.value) {
    notificationStore.fetchNotifications(1, 5);
  }
}

// 最近通知（最多5条）
const recentNotifications = computed(() => notificationStore.notifications.slice(0, 5));

// 关闭通知面板的点击外部处理
function handleClickOutside(e: MouseEvent) {
  const target = e.target as HTMLElement;
  if (!target.closest('.notification-dropdown') && !target.closest('.notification-bell')) {
    showNotificationPanel.value = false;
  }
}

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
  
  // 消息通知对所有用户可见
  items.push({ path: '/notifications', title: '消息通知', icon: Bell });

  // 编制管理对所有用户可见
  items.push({ path: '/hc-requests', title: '编制管理', icon: Tickets });

  // 仅管理员可见成员管理和字典管理
  if (authStore.isAdmin) {
    items.push({ path: '/users', title: '成员管理', icon: User });
    items.push({ path: '/settings/dictionary', title: '字典管理', icon: Setting });
    items.push({ path: '/settings/tags', title: '标签管理', icon: Setting });
    items.push({ path: '/settings/automation-rules', title: '自动化邮件', icon: Setting });
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

// 通知面板相关方法
function handleNotificationClick(item: NotificationItem) {
  showNotificationPanel.value = false;
  notificationStore.readOne(item.id);

  // 跳转到关联页面
  if (item.businessId) {
    if (item.businessType === 'candidate') {
      router.push(`/candidates/${item.businessId}`);
    } else if (item.businessType === 'offer') {
      router.push(`/offers/${item.businessId}`);
    } else if (item.businessType === 'interview') {
      router.push(`/candidates/${item.businessId}`);
    }
  }
}

async function handleMarkAllRead() {
  await notificationStore.readAll();
  ElMessage.success('全部已读');
}

function goToNotifications() {
  showNotificationPanel.value = false;
  router.push('/notifications');
}

function formatRelativeTime(dateStr: string): string {
  const now = Date.now();
  const date = new Date(dateStr).getTime();
  const diff = now - date;
  if (diff < 60000) return '刚刚';
  if (diff < 3600000) return `${Math.floor(diff / 60000)}分钟前`;
  if (diff < 86400000) return `${Math.floor(diff / 3600000)}小时前`;
  return new Date(dateStr).toLocaleDateString('zh-CN');
}

onMounted(() => {
  notificationStore.startPolling();
  document.addEventListener('click', handleClickOutside);
});

onUnmounted(() => {
  notificationStore.stopPolling();
  document.removeEventListener('click', handleClickOutside);
});
</script>

<style scoped lang="scss">
.layout-container {
  height: 100vh;
  width: 100vw;
  /* overflow 由 .main-content 控制，避免裁剪 MessageBox 等 fixed 弹窗 */
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
    position: relative;
    display: flex;
    align-items: center;
    gap: 16px;

    .notification-badge {
      :deep(.el-badge__content) {
        top: 6px;
        right: 4px;
      }
    }

    .notification-bell {
      font-size: 20px;
      cursor: pointer;
      color: #606266;

      &:hover {
        color: #409EFF;
      }
    }

    .notification-dropdown {
      position: absolute;
      top: 100%;
      right: 80px;
      width: 360px;
      max-height: 480px;
      background: #fff;
      border-radius: 8px;
      box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
      z-index: 2000;
      display: flex;
      flex-direction: column;
      overflow: hidden;
      margin-top: 8px;

      .notification-panel-header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        padding: 12px 16px;
        border-bottom: 1px solid #ebeef5;
        font-weight: 500;
      }

      .notification-panel-list {
        flex: 1;
        overflow-y: auto;
        max-height: 380px;

        .notification-panel-item {
          padding: 12px 16px;
          cursor: pointer;
          border-bottom: 1px solid #f5f5f5;

          &.unread {
            background-color: #f0f9ff;
          }

          &:hover {
            background-color: #f5f7fa;
          }

          .notif-item-title {
            font-size: 14px;
            color: #303133;
            margin-bottom: 4px;
          }

          .notif-item-time {
            font-size: 12px;
            color: #909399;
          }
        }
      }

      .notification-panel-footer {
        padding: 10px 16px;
        text-align: center;
        border-top: 1px solid #ebeef5;
      }
    }

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
  overflow: hidden;
  overflow-y: auto;
}

// 页面切换动画
.fade-transform-leave-active,
.fade-transform-enter-active {
  transition: all 0.15s;
}

.fade-transform-enter-from {
  opacity: 0;
  transform: translateX(-10px);
}

.fade-transform-leave-to {
  opacity: 0;
  transform: translateX(10px);
}
</style>
