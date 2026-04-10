<script setup lang="ts">
import { useRouter } from 'vue-router';
import { useUserStore } from '@stores/user';

const router = useRouter();
const userStore = useUserStore();

const handleLogout = () => {
  userStore.logout();
  router.push('/login');
};

const handleCommand = (command: string) => {
  if (command === 'profile') {
    router.push('/profile');
  } else if (command === 'logout') {
    handleLogout();
  }
};
</script>

<template>
  <div class="navbar-container flex-between">
    <breadcrumb />
    <div class="right-menu flex">
      <el-dropdown @command="handleCommand">
        <span class="user-info flex">
          <el-avatar :size="32" :src="userStore.userInfo?.avatar">
            {{ userStore.userInfo?.name?.charAt(0) }}
          </el-avatar>
          <span class="username">{{ userStore.userInfo?.name }}</span>
          <el-icon><i-ep-arrow-down /></el-icon>
        </span>
        <template #dropdown>
          <el-dropdown-menu>
            <el-dropdown-item command="profile">个人中心</el-dropdown-item>
            <el-dropdown-item divided command="logout">退出登录</el-dropdown-item>
          </el-dropdown-menu>
        </template>
      </el-dropdown>
    </div>
  </div>
</template>

<style scoped lang="scss">
.navbar-container {
  height: 100%;
}

.right-menu {
  align-items: center;
}

.user-info {
  align-items: center;
  cursor: pointer;
  padding: 0 8px;

  &:hover {
    background-color: rgba(0, 0, 0, 0.025);
  }

  .username {
    margin: 0 8px;
    font-size: 14px;
    color: #606266;
  }
}
</style>
