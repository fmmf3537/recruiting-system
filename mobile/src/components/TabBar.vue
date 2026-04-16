<template>
  <van-tabbar v-model="active" route>
    <van-tabbar-item icon="home-o" to="/">首页</van-tabbar-item>
    <van-tabbar-item icon="friends-o" to="/candidates">候选人</van-tabbar-item>
    <van-tabbar-item icon="comment-o" to="/messages">消息</van-tabbar-item>
    <van-tabbar-item icon="user-o" to="/profile">我的</van-tabbar-item>
  </van-tabbar>
</template>

<script setup lang="ts">
import { ref } from 'vue';

const active = ref(0);
</script>
