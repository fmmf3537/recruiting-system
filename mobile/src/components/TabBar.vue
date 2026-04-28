<template>
  <van-tabbar v-model="active" route safe-area-inset-bottom>
    <van-tabbar-item icon="home-o" to="/">首页</van-tabbar-item>
    <van-tabbar-item icon="friends-o" to="/candidates">候选人</van-tabbar-item>
    <van-tabbar-item icon="chart-trending-o" to="/stats">看板</van-tabbar-item>
    <van-tabbar-item icon="user-o" to="/profile">我的</van-tabbar-item>
  </van-tabbar>
</template>

<script setup lang="ts">
import { ref, watch } from 'vue';
import { useRoute } from 'vue-router';

const route = useRoute();
const active = ref(0);

const tabRoutes = ['/', '/candidates', '/stats', '/profile'];

watch(
  () => route.path,
  (path) => {
    const index = tabRoutes.indexOf(path);
    active.value = index >= 0 ? index : 0;
  },
  { immediate: true }
);
</script>
