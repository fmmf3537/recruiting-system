import { createRouter, createWebHistory } from 'vue-router';
import { useUserStore } from '@/stores/user';

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes: [
    {
      path: '/',
      name: 'Home',
      component: () => import('@/views/home/index.vue'),
      meta: { showTabBar: true },
    },
    {
      path: '/candidates',
      name: 'Candidates',
      component: () => import('@/views/candidates/index.vue'),
      meta: { showTabBar: true },
    },
    {
      path: '/candidates/form',
      name: 'CandidateForm',
      component: () => import('@/views/candidates/CandidateForm.vue'),
      meta: { showTabBar: false },
    },
    {
      path: '/candidates/:id',
      name: 'CandidateDetail',
      component: () => import('@/views/candidates/CandidateDetail.vue'),
      meta: { showTabBar: false },
    },
    {
      path: '/candidates/:id/feedback',
      name: 'InterviewForm',
      component: () => import('@/views/interviews/InterviewForm.vue'),
      meta: { showTabBar: false },
    },
    {
      path: '/candidates/:id/resume',
      name: 'ResumeUpload',
      component: () => import('@/views/candidates/ResumeUpload.vue'),
      meta: { showTabBar: false },
    },
    {
      path: '/interviews',
      name: 'Interviews',
      component: () => import('@/views/interviews/index.vue'),
      meta: { showTabBar: true },
    },
    {
      path: '/interviews/form',
      name: 'InterviewFormStandalone',
      component: () => import('@/views/interviews/InterviewForm.vue'),
      meta: { showTabBar: false },
    },
    {
      path: '/offers',
      name: 'Offers',
      component: () => import('@/views/offers/index.vue'),
      meta: { showTabBar: true },
    },
    {
      path: '/offers/form',
      name: 'OfferForm',
      component: () => import('@/views/offers/OfferForm.vue'),
      meta: { showTabBar: false },
    },
    {
      path: '/offers/:candidateId',
      name: 'OfferDetail',
      component: () => import('@/views/offers/OfferDetail.vue'),
      meta: { showTabBar: false },
    },
    {
      path: '/jobs',
      name: 'Jobs',
      component: () => import('@/views/jobs/index.vue'),
      meta: { showTabBar: true },
    },
    {
      path: '/jobs/:id',
      name: 'JobDetail',
      component: () => import('@/views/jobs/JobDetail.vue'),
      meta: { showTabBar: false },
    },
    {
      path: '/messages',
      name: 'Messages',
      component: () => import('@/views/messages/index.vue'),
      meta: { showTabBar: true },
    },
    {
      path: '/profile',
      name: 'Profile',
      component: () => import('@/views/profile/index.vue'),
      meta: { showTabBar: true },
    },
    {
      path: '/login',
      name: 'Login',
      component: () => import('@/views/login/index.vue'),
      meta: { showTabBar: false, public: true },
    },
    {
      path: '/:pathMatch(.*)*',
      name: 'NotFound',
      component: () => import('@/views/error/404.vue'),
      meta: { showTabBar: false },
    },
  ],
});

// 白名单路由
const whiteList = ['/login'];

router.beforeEach((to, _from, next) => {
  const userStore = useUserStore();

  // 公开路由直接放行
  if (to.meta.public || whiteList.includes(to.path)) {
    next();
    return;
  }

  // 检查登录状态
  if (!userStore.isLogin) {
    next('/login');
    return;
  }

  // 检查管理员权限
  if (to.meta.requireAdmin && !userStore.isAdmin) {
    next('/');
    return;
  }

  next();
});

export default router;
