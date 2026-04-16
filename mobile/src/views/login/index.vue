<template>
  <div class="login-page">
    <div class="login-header">
      <h1>招聘管理系统</h1>
      <p>移动端入口</p>
    </div>

    <!-- 飞书环境提示 -->
    <div v-if="isFeishuEnv && !showForm" class="feishu-loading">
      <van-loading type="spinner" size="24px" />
      <p>正在尝试飞书免登...</p>
    </div>

    <!-- 账号密码表单 -->
    <van-form v-if="showForm" class="login-form" @submit="onSubmit">
      <van-field
        v-model="form.email"
        name="email"
        label="邮箱"
        placeholder="请输入邮箱"
        :rules="[{ required: true, message: '请输入邮箱' }]"
      />
      <van-field
        v-model="form.password"
        type="password"
        name="password"
        label="密码"
        placeholder="请输入密码"
        :rules="[{ required: true, message: '请输入密码' }]"
      />
      <div class="submit-btn">
        <van-button round block type="primary" native-type="submit" :loading="loading">
          登录
        </van-button>
      </div>
    </van-form>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue';
import { useRouter } from 'vue-router';
import { showToast } from 'vant';
import { useUserStore } from '@/stores/user';
import { isFeishu, initFeishu, getAuthCode } from '@/lib/feishu';

const router = useRouter();
const userStore = useUserStore();

const form = ref({
  email: '',
  password: '',
});
const loading = ref(false);
const isFeishuEnv = ref(false);
const showForm = ref(true);

// 尝试飞书免登
async function tryFeishuLogin() {
  isFeishuEnv.value = true;
  showForm.value = false;
  try {
    await initFeishu();
    const authCode = await getAuthCode();
    await userStore.feishuLoginAction({ authCode });
    showToast('登录成功');
    router.replace('/');
  } catch (error) {
    // 免登失败，降级到账号密码登录
    showForm.value = true;
    showToast(error instanceof Error ? error.message : '飞书免登失败，请使用账号密码登录');
  }
}

async function onSubmit() {
  loading.value = true;
  try {
    await userStore.login({
      email: form.value.email,
      password: form.value.password,
    });
    showToast('登录成功');
    router.replace('/');
  } catch (error) {
    // 错误已由 request.ts 统一拦截提示
    console.error(error);
  } finally {
    loading.value = false;
  }
}

onMounted(() => {
  if (userStore.isLogin) {
    router.replace('/');
    return;
  }
  if (isFeishu()) {
    tryFeishuLogin();
  }
});
</script>

<style scoped>
.login-page {
  min-height: 100vh;
  padding: 48px 24px;
  background-color: #f7f8fa;
  box-sizing: border-box;
}

.login-header {
  text-align: center;
  margin-bottom: 48px;
}

.login-header h1 {
  font-size: 24px;
  margin: 0 0 8px;
  color: #333;
}

.login-header p {
  font-size: 14px;
  color: #666;
  margin: 0;
}

.login-form {
  background-color: #fff;
  padding: 24px;
  border-radius: 12px;
}

.submit-btn {
  margin-top: 24px;
}

.feishu-loading {
  text-align: center;
  padding: 48px 0;
  color: #666;
}

.feishu-loading p {
  margin-top: 12px;
  font-size: 14px;
}
</style>
