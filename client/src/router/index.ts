import { createRouter, createWebHistory, type RouteRecordRaw } from 'vue-router';
import { useAuthStore } from '@/stores/auth';
import { ElMessage } from 'element-plus';
import {
  Odometer,
  Briefcase,
  UserFilled,
  DocumentChecked,
  TrendCharts,
  User,
  Setting,
  Bell,
  Tickets,
} from '@element-plus/icons-vue';

// 路由配置
const routes: RouteRecordRaw[] = [
  {
    path: '/login',
    name: 'Login',
    component: () => import('@/views/login/index.vue'),
    meta: {
      public: true,
      title: '登录',
    },
  },
  {
    path: '/',
    name: 'Layout',
    component: () => import('@/layouts/DefaultLayout.vue'),
    redirect: '/dashboard',
    children: [
      {
        path: '/dashboard',
        name: 'Dashboard',
        component: () => import('@/views/dashboard/index.vue'),
        meta: {
          title: '仪表盘',
          icon: Odometer,
        },
      },
      {
        path: '/jobs',
        name: 'Jobs',
        component: () => import('@/views/jobs/index.vue'),
        meta: {
          title: '职位管理',
          icon: Briefcase,
        },
      },
      {
        path: '/jobs/create',
        name: 'JobCreate',
        component: () => import('@/views/jobs/JobForm.vue'),
        meta: {
          title: '发布职位',
          hidden: true,
          public: true,
        },
      },
      {
        path: '/jobs/:id',
        name: 'JobDetail',
        component: () => import('@/views/jobs/JobDetail.vue'),
        meta: {
          title: '职位详情',
          hidden: true,
          public: true,
        },
      },
      {
        path: '/jobs/:id/edit',
        name: 'JobEdit',
        component: () => import('@/views/jobs/JobForm.vue'),
        meta: {
          title: '编辑职位',
          hidden: true,
          public: true,
        },
      },
      {
        path: '/candidates',
        name: 'Candidates',
        component: () => import('@/views/candidates/index.vue'),
        meta: {
          title: '候选人管理',
          icon: UserFilled,
        },
      },
      {
        path: '/candidates/create',
        name: 'CandidateCreate',
        component: () => import('@/views/candidates/CandidateForm.vue'),
        meta: {
          title: '新增候选人',
          hidden: true,
          public: true,
        },
      },
      {
        path: '/candidates/:id',
        name: 'CandidateDetail',
        component: () => import('@/views/candidates/CandidateDetail.vue'),
        meta: {
          title: '候选人详情',
          hidden: true,
          public: true,
        },
      },
      {
        path: '/candidates/:id/edit',
        name: 'CandidateEdit',
        component: () => import('@/views/candidates/CandidateForm.vue'),
        meta: {
          title: '编辑候选人',
          hidden: true,
          public: true,
        },
      },
      {
        path: '/offers',
        name: 'Offers',
        component: () => import('@/views/offers/index.vue'),
        meta: {
          title: 'Offer管理',
          icon: DocumentChecked,
        },
      },
      {
        path: '/offers/create',
        name: 'OfferCreate',
        component: () => import('@/views/offers/OfferForm.vue'),
        meta: {
          title: '创建 Offer',
          hidden: true,
          public: true,
        },
      },
      {
        path: '/offers/:id',
        name: 'OfferDetail',
        component: () => import('@/views/offers/OfferDetail.vue'),
        meta: {
          title: 'Offer 详情',
          hidden: true,
          public: true,
        },
      },
      {
        path: '/hc-requests',
        name: 'HCRequests',
        component: () => import('@/views/hc-requests/index.vue'),
        meta: {
          title: '编制管理',
          icon: Tickets,
        },
      },
      {
        path: '/hc-requests/create',
        name: 'HCRequestCreate',
        component: () => import('@/views/hc-requests/HCRequestForm.vue'),
        meta: {
          title: '新建申请',
          hidden: true,
          public: true,
        },
      },
      {
        path: '/hc-requests/:id/edit',
        name: 'HCRequestEdit',
        component: () => import('@/views/hc-requests/HCRequestForm.vue'),
        meta: {
          title: '编辑申请',
          hidden: true,
          public: true,
        },
      },
      {
        path: '/notifications',
        name: 'Notifications',
        component: () => import('@/views/notifications/index.vue'),
        meta: {
          title: '消息通知',
          icon: Bell,
        },
      },
      {
        path: '/stats',
        name: 'Stats',
        component: () => import('@/views/stats/index.vue'),
        meta: {
          title: '数据统计',
          icon: TrendCharts,
        },
      },
      {
        path: '/users',
        name: 'Users',
        component: () => import('@/views/users/index.vue'),
        meta: {
          title: '成员管理',
          icon: User,
          requireAdmin: true,
        },
      },
      {
        path: '/settings/dictionary',
        name: 'Dictionary',
        component: () => import('@/views/settings/DictionaryPage.vue'),
        meta: {
          title: '字典管理',
          icon: Setting,
          requireAdmin: true,
          hidden: true,
        },
      },
      {
        path: '/settings/email-templates',
        name: 'EmailTemplates',
        component: () => import('@/views/settings/EmailTemplates.vue'),
        meta: {
          title: '邮件模板',
          icon: Setting,
          requireAdmin: true,
          hidden: true,
        },
      },
      {
        path: '/settings/automation-rules',
        name: 'AutomationRules',
        component: () => import('@/views/settings/AutomationRules.vue'),
        meta: {
          title: '自动化邮件',
          icon: Setting,
          requireAdmin: true,
          hidden: true,
        },
      },
      {
        path: '/settings/tags',
        name: 'TagManagement',
        component: () => import('@/views/settings/TagManagement.vue'),
        meta: {
          title: '标签管理',
          icon: Setting,
          requireAdmin: true,
          hidden: true,
        },
      },
      {
        path: '/profile',
        name: 'Profile',
        component: () => import('@/views/profile/index.vue'),
        meta: {
          title: '个人中心',
          hidden: true,
          public: true,
        },
      },
    ],
  },
  {
    path: '/404',
    name: 'NotFound',
    component: () => import('@/views/error/404.vue'),
    meta: {
      public: true,
      title: '页面未找到',
    },
  },
  {
    path: '/:pathMatch(.*)*',
    redirect: '/404',
  },
];

const router = createRouter({
  history: createWebHistory(),
  routes,
  scrollBehavior() {
    return { top: 0 };
  },
});

// 路由守卫
router.beforeEach(async (to, from, next) => {
  const authStore = useAuthStore();
  
  // 设置页面标题
  if (to.meta.title) {
    document.title = `${to.meta.title} - 招聘管理系统`;
  }

  // 公开路由直接放行
  if (to.meta.public) {
    // 已登录用户访问登录页，重定向到首页
    if (to.path === '/login' && authStore.isLoggedIn) {
      next('/dashboard');
      return;
    }
    next();
    return;
  }

  // 检查是否已登录
  if (!authStore.isLoggedIn) {
    ElMessage.warning('请先登录');
    next('/login');
    return;
  }

  // 获取用户信息（如果还没有）
  if (!authStore.userInfo) {
    const success = await authStore.fetchUserInfo();
    if (!success) {
      ElMessage.error('获取用户信息失败，请重新登录');
      authStore.logout();
      next('/login');
      return;
    }
  }

  // 检查管理员权限
  if (to.meta.requireAdmin && !authStore.isAdmin) {
    ElMessage.error('没有权限访问该页面');
    next('/dashboard');
    return;
  }

  next();
});

export default router;
