import { createRouter, createWebHistory } from 'vue-router';
import { useUserStore } from '@stores/user';
import type { RouteRecordRaw } from 'vue-router';

const routes: RouteRecordRaw[] = [
  {
    path: '/login',
    name: 'Login',
    component: () => import('@views/login/index.vue'),
    meta: { public: true, title: '登录' },
  },
  {
    path: '/',
    name: 'Layout',
    component: () => import('@components/layout/index.vue'),
    redirect: '/dashboard',
    children: [
      {
        path: 'dashboard',
        name: 'Dashboard',
        component: () => import('@views/dashboard/index.vue'),
        meta: { title: '仪表盘', icon: 'Odometer' },
      },
      {
        path: 'jobs',
        name: 'Jobs',
        component: () => import('@views/jobs/index.vue'),
        meta: { title: '职位管理', icon: 'Briefcase' },
      },
      {
        path: 'candidates',
        name: 'Candidates',
        component: () => import('@views/candidates/index.vue'),
        meta: { title: '候选人', icon: 'User' },
      },
      {
        path: 'interviews',
        name: 'Interviews',
        component: () => import('@views/interviews/index.vue'),
        meta: { title: '面试安排', icon: 'Calendar' },
      },
      {
        path: 'profile',
        name: 'Profile',
        component: () => import('@views/profile/index.vue'),
        meta: { title: '个人中心', icon: 'UserFilled', hidden: true },
      },
    ],
  },
  {
    path: '/:pathMatch(.*)*',
    name: 'NotFound',
    component: () => import('@views/error/404.vue'),
    meta: { public: true, title: '页面不存在' },
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
router.beforeEach((to, from, next) => {
  const userStore = useUserStore();
  const token = userStore.token;

  // 设置页面标题
  document.title = to.meta.title ? `${to.meta.title} - 招聘系统` : '招聘系统';

  if (to.meta.public) {
    // 公开页面直接访问
    next();
  } else if (!token) {
    // 需要登录但未登录，跳转到登录页
    next('/login');
  } else {
    // 已登录，正常访问
    next();
  }
});

export default router;
