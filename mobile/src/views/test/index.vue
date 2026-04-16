<template>
  <div class="test-page">
    <van-nav-bar title="测试页面" left-arrow @click-left="$router.back()" />
    <div class="content">
      <p>路由跳转测试成功</p>
      <van-button type="primary" @click="$router.push('/')">
        返回首页
      </van-button>
    </div>
  </div>
</template>

<script setup lang="ts"></script>

<style scoped>
.test-page {
  height: 100vh;
  background-color: #f7f8fa;
}

.content {
  padding: 16px;
  text-align: center;
}

.content p {
  margin-bottom: 16px;
  font-size: 16px;
  color: #333;
}
</style>
