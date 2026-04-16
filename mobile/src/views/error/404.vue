<template>
  <div class="not-found">
    <van-empty image="error" description="页面不存在" />
    <van-button type="primary" @click="$router.replace('/')">
      返回首页
    </van-button>
  </div>
</template>

<script setup lang="ts"></script>

<style scoped>
.not-found {
  height: 100vh;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  background-color: #f7f8fa;
}
</style>
