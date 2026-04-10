<script setup lang="ts">
import { computed } from 'vue';
import { useUserStore } from '@stores/user';

const userStore = useUserStore();
const userInfo = computed(() => userStore.userInfo);
</script>

<template>
  <div class="profile-page">
    <h1 class="page-title">个人中心</h1>

    <el-row :gutter="20">
      <el-col :span="8">
        <el-card shadow="never">
          <div class="user-info text-center">
            <el-avatar :size="100" :src="userInfo?.avatar">
              {{ userInfo?.name?.charAt(0) }}
            </el-avatar>
            <h3 class="user-name">{{ userInfo?.name }}</h3>
            <p class="user-role">{{ userInfo?.role }}</p>
          </div>
        </el-card>
      </el-col>
      <el-col :span="16">
        <el-card shadow="never" title="基本信息">
          <el-descriptions :column="2">
            <el-descriptions-item label="邮箱">{{ userInfo?.email }}</el-descriptions-item>
            <el-descriptions-item label="电话">{{ userInfo?.phone || '未设置' }}</el-descriptions-item>
            <el-descriptions-item label="注册时间">{{ userInfo?.createdAt }}</el-descriptions-item>
          </el-descriptions>
        </el-card>
      </el-col>
    </el-row>
  </div>
</template>

<style scoped lang="scss">
.page-title {
  margin: 0 0 24px;
  font-size: 20px;
  font-weight: 500;
}

.user-info {
  padding: 20px;

  .user-name {
    margin: 16px 0 8px;
    font-size: 20px;
  }

  .user-role {
    margin: 0;
    color: #909399;
  }
}
</style>
