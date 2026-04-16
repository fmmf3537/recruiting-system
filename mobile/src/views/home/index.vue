<template>
  <div class="home-page">
    <van-search v-model="searchValue" placeholder="请输入搜索关键词" />
    <van-cell title="单元格" value="内容" />
    <van-cell title="单元格" value="内容" label="描述信息" />

    <div class="button-group">
      <van-button type="primary">主要按钮</van-button>
      <van-button type="success">成功按钮</van-button>
      <van-button type="default">默认按钮</van-button>
    </div>

    <div class="test-box">
      <p>这是一个 100px × 100px 的测试方块，用于验证 vw 适配</p>
    </div>

    <div class="router-test">
      <van-button type="primary" @click="$router.push('/test')">
        跳转到测试页
      </van-button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue';

const searchValue = ref('');
</script>

<style scoped>
.home-page {
  padding: 16px;
}

.button-group {
  margin-top: 16px;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.test-box {
  width: 100px;
  height: 100px;
  background-color: #1989fa;
  margin-top: 16px;
  border-radius: 8px;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 8px;
}

.test-box p {
  color: #fff;
  font-size: 12px;
  margin: 0;
  text-align: center;
}

.router-test {
  margin-top: 24px;
}
</style>
