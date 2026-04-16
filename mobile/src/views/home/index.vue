<template>
  <div class="home-page">
    <div class="header">
      <h2>{{ greeting }}，{{ userStore.userInfo?.name || 'HR' }}</h2>
      <p class="subtitle">祝您工作愉快</p>
    </div>

    <!-- 快捷入口 -->
    <van-grid :column-num="4" class="quick-grid">
      <van-grid-item icon="friends-o" text="候选人" to="/candidates" />
      <van-grid-item icon="notes-o" text="面试" to="/messages" />
      <van-grid-item icon="gold-coin-o" text="Offer" to="/messages" />
      <van-grid-item icon="bag-o" text="职位" to="/messages" />
    </van-grid>

    <!-- 今日待办 -->
    <div class="todo-section">
      <h3>今日待办</h3>
      <div class="todo-cards">
        <div class="todo-card">
          <span class="number">{{ todo.pendingCandidates }}</span>
          <span class="label">待处理候选人</span>
        </div>
        <div class="todo-card">
          <span class="number">{{ todo.pendingInterviews }}</span>
          <span class="label">待面试</span>
        </div>
        <div class="todo-card">
          <span class="number">{{ todo.pendingOffers }}</span>
          <span class="label">待审批 Offer</span>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue';
import { useUserStore } from '@/stores/user';

const userStore = useUserStore();

const greeting = computed(() => {
  const hour = new Date().getHours();
  if (hour < 12) return '早上好';
  if (hour < 18) return '下午好';
  return '晚上好';
});

const todo = ref({
  pendingCandidates: 12,
  pendingInterviews: 5,
  pendingOffers: 3,
});
</script>

<style scoped>
.home-page {
  min-height: 100%;
  padding: 16px;
  background-color: #f7f8fa;
  box-sizing: border-box;
}

.header {
  margin-bottom: 16px;
}

.header h2 {
  margin: 0 0 4px;
  font-size: 20px;
  color: #333;
}

.subtitle {
  margin: 0;
  font-size: 13px;
  color: #666;
}

.quick-grid {
  margin-bottom: 16px;
  border-radius: 8px;
  overflow: hidden;
}

.todo-section {
  background-color: #fff;
  border-radius: 8px;
  padding: 16px;
}

.todo-section h3 {
  margin: 0 0 12px;
  font-size: 16px;
  color: #333;
}

.todo-cards {
  display: flex;
  gap: 12px;
}

.todo-card {
  flex: 1;
  background-color: #f2f3f5;
  border-radius: 8px;
  padding: 16px 8px;
  text-align: center;
  display: flex;
  flex-direction: column;
  align-items: center;
}

.todo-card .number {
  font-size: 20px;
  font-weight: 600;
  color: #1989fa;
  margin-bottom: 4px;
}

.todo-card .label {
  font-size: 12px;
  color: #666;
}
</style>
