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
        :default-openeds="uiNewNavLayout ? groupedMenuOpenedIndexes : []"
        router
        class="sidebar-menu"
        background-color="#17253a"
        text-color="#c5d1e0"
        active-text-color="#73a7ff"
      >
        <!-- UI-S1：开关打开时按职能分组；关闭时保持原扁平列表 -->
        <template v-if="uiNewNavLayout">
          <el-sub-menu
            v-for="group in groupedMenuItems"
            :key="group.title"
            :index="group.title"
          >
            <template #title>
              <el-icon>
                <component :is="group.icon" />
              </el-icon>
              <span>{{ group.title }}</span>
            </template>
            <el-menu-item
              v-for="item in group.items"
              :key="item.path"
              :index="item.path"
            >
              <el-icon>
                <component :is="item.icon" />
              </el-icon>
              <template #title>{{ item.title }}</template>
            </el-menu-item>
          </el-sub-menu>
        </template>
        <template v-else>
          <el-menu-item v-for="item in menuItems" :key="item.path" :index="item.path">
            <el-icon>
              <component :is="item.icon" />
            </el-icon>
            <template #title>{{ item.title }}</template>
          </el-menu-item>
        </template>
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
          <span v-if="!uiNewNavLayout" class="page-title">{{ route.meta.title }}</span>
          <span v-else class="page-title page-breadcrumb">
            <template v-if="breadcrumbGroupTitle">
              <span class="breadcrumb-group">{{ breadcrumbGroupTitle }}</span>
              <span class="breadcrumb-sep">/</span>
            </template>
            <span class="breadcrumb-current">{{ route.meta.title }}</span>
          </span>
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
import type { Component } from 'vue';
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
  Calendar,
  Connection,
  Trophy,
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

// UI-S1：新布局开关，默认开启。回退：localStorage.setItem('ui:new-layout:UI-S1','false') 后刷新
const uiNewNavLayout = ref(localStorage.getItem('ui:new-layout:UI-S1') !== 'false');

// UI-S1：菜单分组映射（与 router 解耦，不改路由文件）
// UI-S1-fix1：分组标题带图标，折叠态 64px 下仍可见
const MENU_GROUPS: { title: string; icon: Component; paths: string[] }[] = [
  { title: '招聘作业', icon: Briefcase, paths: ['/dashboard', '/hiring', '/jobs', '/candidates', '/offers'] },
  { title: '面试', icon: Calendar, paths: ['/interview', '/interviews'] },
  { title: '数据与考核', icon: TrendCharts, paths: ['/stats', '/stats/hr-workload', '/hr-score/my', '/hr-score/team'] },
  {
    title: '设置与管理',
    icon: Setting,
    paths: [
      '/hc-requests',
      '/users',
      '/settings/agencies',
      '/settings/dictionary',
      '/settings/tags',
      '/settings/pipeline-templates',
      '/settings/ai',
      '/settings/automation-rules',
      '/notifications',
    ],
  },
];

// 菜单项
const menuItems = computed(() => {
  const items = [
    { path: '/dashboard', title: '仪表盘', icon: Odometer },
  ];

  const rawRole = authStore.userInfo?.role;
  const role = rawRole === 'member' ? 'hr' : rawRole;

  if (role === 'admin' || role === 'hiring_manager') {
    items.push({ path: '/hiring', title: '招聘工作台', icon: Briefcase });
  }

  if (role === 'admin' || role === 'hr') {
    items.push({ path: '/jobs', title: '职位管理', icon: Briefcase });
    // F5-C：猎头机构菜单（HR / Admin 可见）
    items.push({ path: '/settings/agencies', title: '猎头机构', icon: Connection });
  }

  if (role !== 'interviewer') {
    items.push({ path: '/candidates', title: '候选人管理', icon: UserFilled });
  }

  if (role === 'admin' || role === 'interviewer' || role === 'hiring_manager') {
    items.push({ path: '/interview', title: '面试官工作台', icon: Calendar });
  }

  // 面试管理：HR / 管理员 / 用人经理安排与查看面试（面试官走工作台）
  if (role === 'admin' || role === 'hr' || role === 'hiring_manager') {
    items.push({ path: '/interviews', title: '面试管理', icon: Calendar });
  }

  if (role !== 'interviewer') {
    items.push({ path: '/offers', title: 'Offer管理', icon: DocumentChecked });
    items.push({ path: '/stats', title: '数据统计', icon: TrendCharts });
  }

  // F4-C：考核菜单（按 role 过滤；member 已归一为 hr）
  if (role === 'admin' || role === 'hr') {
    items.push({ path: '/hr-score/my', title: '我的积分', icon: Trophy });
  }
  if (role === 'admin') {
    items.push({ path: '/hr-score/team', title: '团队考核', icon: Trophy });
    items.push({ path: '/stats/hr-workload', title: 'HR 工作监控', icon: TrendCharts });
  }
  
  // 消息通知对所有用户可见
  items.push({ path: '/notifications', title: '消息通知', icon: Bell });

  if (role !== 'interviewer') {
    items.push({ path: '/hc-requests', title: '编制管理', icon: Tickets });
  }

  // 仅管理员可见成员管理和字典管理
  if (authStore.isAdmin) {
    items.push({ path: '/settings', title: '设置中心', icon: Setting });
    items.push({ path: '/users', title: '成员管理', icon: User });
    items.push({ path: '/settings/dictionary', title: '字典管理', icon: Setting });
    items.push({ path: '/settings/tags', title: '标签管理', icon: Setting });
    items.push({ path: '/settings/pipeline-templates', title: '流程模板', icon: Setting });
    items.push({ path: '/settings/ai', title: 'AI 设置', icon: Setting });
    items.push({ path: '/settings/automation-rules', title: '自动化邮件', icon: Setting });
  }
  
  return items;
});

// UI-S1：按映射表分组；空组隐藏；未映射 path 归入末尾「其他」
const groupedMenuItems = computed(() => {
  const items = menuItems.value;
  const byPath = new Map(items.map((item) => [item.path, item]));
  const groupedPaths = new Set<string>();
  const groups: { title: string; icon: Component; items: typeof items }[] = [];

  for (const group of MENU_GROUPS) {
    group.paths.forEach((p) => groupedPaths.add(p));
    const matched = group.paths
      .map((p) => byPath.get(p))
      .filter((item): item is (typeof items)[number] => item !== undefined);
    if (matched.length > 0) {
      groups.push({ title: group.title, icon: group.icon, items: matched });
    }
  }

  const rest = items.filter((item) => !groupedPaths.has(item.path));
  if (rest.length > 0) {
    // UI-S1-fix1：兜底组同样带图标，避免未来未映射菜单折叠后空白
    groups.push({ title: '其他', icon: Connection, items: rest });
  }
  return groups;
});

const groupedMenuOpenedIndexes = computed(() => groupedMenuItems.value.map((g) => g.title));

// UI-S1：面包屑分组名；未在 MENU_GROUPS 中（含「其他」）则只显示页面名
const breadcrumbGroupTitle = computed(() => {
  const path = route.path;
  const found = MENU_GROUPS.find((group) => group.paths.includes(path));
  return found ? found.title : null;
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
      // businessId 为面试 ID，跳面试详情页
      router.push(`/interviews/${item.businessId}`);
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
  background-color: $sidebar-bg;
  transition: width 0.3s;
  
  .logo {
    height: 60px;
    display: flex;
    align-items: center;
    justify-content: center;
    border-bottom: 1px solid rgba(220, 228, 238, 0.14);
    
    .logo-text {
      color: #fff;
      font-size: 16px;
      font-weight: bold;
    }
    
    .logo-mini {
      font-size: 24px;
      font-weight: bold;
      color: $ui-color-primary;
    }
  }
  
  .sidebar-menu {
    border-right: none;
  }
}

.main-container {
  background-color: $bg-base;
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
        color: $ui-color-primary;
      }
    }
    
    .page-title {
      font-size: 16px;
      font-weight: 500;
    }

    // UI-S1：开关打开时的面包屑，不影响关闭态的 page-title
    .page-breadcrumb {
      display: flex;
      align-items: center;
      gap: $ui-space-sm;

      .breadcrumb-group {
        color: $ui-gray-500;
        font-weight: 400;
      }

      .breadcrumb-sep {
        color: $ui-gray-300;
      }
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
        color: $ui-color-primary;
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
        color: $ui-color-primary;
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
