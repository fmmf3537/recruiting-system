<script setup lang="ts">
import { onMounted } from 'vue';
import { useUserStore } from '@stores/user';

const userStore = useUserStore();

onMounted(() => {
  // 初始化用户状态
  userStore.initUser();
});
</script>

<template>
  <router-view v-slot="{ Component }">
    <transition name="fade" mode="out-in">
      <keep-alive>
        <component :is="Component" />
      </keep-alive>
    </transition>
  </router-view>
</template>

<style scoped>
.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.2s ease;
}

.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}
</style>
