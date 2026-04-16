<template>
  <div class="messages-page">
    <van-nav-bar title="消息" fixed placeholder />
    <div class="page-content">
      <van-empty description="暂无消息" />
    </div>
  </div>
</template>

<script setup lang="ts"></script>

<style scoped>
.messages-page {
  min-height: 100%;
  background-color: #f7f8fa;
}

.page-content {
  padding: 16px;
}
</style>
