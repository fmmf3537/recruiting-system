<script setup lang="ts">
import { useRouter } from 'vue-router';

const router = useRouter();

const goHome = () => {
  router.push('/');
};

const goBack = () => {
  router.back();
};
</script>

<template>
  <div class="error-page flex-center">
    <div class="error-content text-center">
      <h1 class="error-code">404</h1>
      <p class="error-desc">抱歉，您访问的页面不存在</p>
      <div class="error-actions">
        <el-button type="primary" @click="goHome">返回首页</el-button>
        <el-button @click="goBack">返回上一页</el-button>
      </div>
    </div>
  </div>
</template>

<style scoped lang="scss">
.error-page {
  min-height: 100vh;
  background-color: #f5f7fa;
}

.error-content {
  padding: 40px;
}

.error-code {
  font-size: 120px;
  font-weight: 700;
  color: #409eff;
  margin: 0 0 20px;
  line-height: 1;
}

.error-desc {
  font-size: 18px;
  color: #606266;
  margin-bottom: 32px;
}

.error-actions {
  .el-button {
    margin: 0 8px;
  }
}
</style>
