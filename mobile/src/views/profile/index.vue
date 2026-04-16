<template>
  <div class="profile-page">
    <van-nav-bar title="我的" fixed placeholder />

    <div class="user-card">
      <van-image round width="64px" height="64px" src="https://img.yzcdn.cn/vant/cat.jpeg" />
      <div class="user-info">
        <h3>{{ userStore.userInfo?.name || '未登录' }}</h3>
        <p>{{ userStore.userInfo?.email || '-' }}</p>
        <van-tag v-if="userStore.isAdmin" type="danger">管理员</van-tag>
        <van-tag v-else type="primary">成员</van-tag>
      </div>
    </div>

    <van-cell-group inset class="settings-group">
      <van-cell title="修改密码" is-link />
      <van-cell title="清除缓存" is-link @click="onClearCache" />
      <van-cell title="关于我们" is-link />
    </van-cell-group>

    <div class="logout-area">
      <van-button round block type="danger" plain @click="onLogout">
        退出登录
      </van-button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { useRouter } from 'vue-router';
import { showToast, showSuccessToast } from 'vant';
import { useUserStore } from '@/stores/user';

const router = useRouter();
const userStore = useUserStore();

function onClearCache() {
  showSuccessToast('缓存已清除');
}

function onLogout() {
  userStore.logout();
  showToast('已退出登录');
  router.replace('/login');
}
</script>

<style scoped>
.profile-page {
  min-height: 100%;
  padding-bottom: 24px;
  background-color: #f7f8fa;
}

.user-card {
  display: flex;
  align-items: center;
  padding: 24px 16px;
  background-color: #fff;
  margin-bottom: 12px;
}

.user-info {
  margin-left: 16px;
}

.user-info h3 {
  margin: 0 0 4px;
  font-size: 18px;
  color: #333;
}

.user-info p {
  margin: 0 0 8px;
  font-size: 13px;
  color: #666;
}

.settings-group {
  margin-bottom: 24px;
}

.logout-area {
  padding: 0 16px;
}
</style>
