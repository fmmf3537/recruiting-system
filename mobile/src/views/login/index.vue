<template>
  <div class="login-page">
    <div class="login-header">
      <h1>招聘管理系统</h1>
      <p>移动端入口</p>
    </div>

    <!-- 飞书环境提示 -->
    <div v-if="isFeishuEnv && !showForm && !showBindForm && !feishuError" class="feishu-loading">
      <van-loading type="spinner" size="24px" />
      <p>正在尝试飞书免登...</p>
    </div>

    <!-- 飞书免登错误提示 -->
    <div v-if="feishuError" class="login-form feishu-error">
      <p>{{ feishuError }}</p>
      <div class="submit-btn">
        <van-button round block type="default" @click="showForm = true; feishuError = ''">
          使用账号密码登录
        </van-button>
      </div>
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

    <!-- 飞书账号绑定表单 -->
    <van-form v-if="showBindForm" class="login-form" @submit="onBindSubmit">
      <div class="bind-tip">
        <p>首次使用飞书登录，请绑定您的系统账号</p>
      </div>
      <div v-if="bindError" class="bind-error">
        <p>{{ bindError }}</p>
      </div>
      <van-field
        v-model="bindForm.email"
        name="email"
        label="邮箱"
        placeholder="请输入系统账号邮箱"
        :rules="[{ required: true, message: '请输入邮箱' }]"
      />
      <van-field
        v-model="bindForm.password"
        type="password"
        name="password"
        label="密码"
        placeholder="请输入密码"
        :rules="[{ required: true, message: '请输入密码' }]"
      />
      <div class="submit-btn">
        <van-button round block type="primary" native-type="submit" :loading="bindLoading">
          绑定并登录
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
import { bindFeishu } from '@/api/auth';

const router = useRouter();
const userStore = useUserStore();

const form = ref({
  email: '',
  password: '',
});
const loading = ref(false);
const isFeishuEnv = ref(false);
const showForm = ref(true);
const feishuError = ref('');

// 绑定表单状态
const showBindForm = ref(false);
const pendingFeishuEmployeeId = ref('');
const bindLoading = ref(false);
const bindError = ref('');
const bindForm = ref({
  email: '',
  password: '',
});

// 尝试飞书免登
async function tryFeishuLogin() {
  isFeishuEnv.value = true;
  showForm.value = false;
  feishuError.value = '';
  try {
    await initFeishu();
    const authCode = await getAuthCode();
    const res = await userStore.feishuLoginAction({ authCode });

    if (res.success && res.token) {
      showToast('登录成功');
      router.replace('/');
      return;
    }

    if (res.code === 'USER_NOT_BOUND') {
      pendingFeishuEmployeeId.value = res.feishuEmployeeId || '';
      showBindForm.value = true;
      return;
    }

    throw new Error(res.error || '飞书免登失败');
  } catch (error) {
    const msg = error instanceof Error ? error.message : '飞书免登失败';
    // eslint-disable-next-line no-console
    console.error('[Feishu Login Error]', msg, error);
    feishuError.value = msg || '飞书免登失败，请使用账号密码登录';
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
    console.error(error);
  } finally {
    loading.value = false;
  }
}

async function onBindSubmit() {
  if (!bindForm.value.email || !bindForm.value.password) {
    bindError.value = '请输入邮箱和密码';
    return;
  }
  if (!pendingFeishuEmployeeId.value) {
    bindError.value = '系统错误：缺少飞书用户标识，请刷新重试';
    return;
  }
  bindLoading.value = true;
  bindError.value = '';
  try {
    const res = await bindFeishu({
      email: bindForm.value.email,
      password: bindForm.value.password,
      feishuEmployeeId: pendingFeishuEmployeeId.value,
    });

    if (res.success && res.token) {
      userStore.setToken(res.token);
      userStore.setUserInfo(res.user);
      showToast('绑定成功');
      router.replace('/');
    } else {
      bindError.value = res.error || '绑定失败';
    }
  } catch (error: any) {
    bindError.value = error?.error || '绑定失败，请检查账号密码';
    // eslint-disable-next-line no-console
    console.error('[Bind Feishu Error]', error);
  } finally {
    bindLoading.value = false;
  }
}

onMounted(() => {
  const ua = navigator.userAgent;
  const feishuFlag = isFeishu();
  const appId = import.meta.env.VITE_FEISHU_APP_ID;

  // eslint-disable-next-line no-console
  console.log('[Login] UA:', ua);
  // eslint-disable-next-line no-console
  console.log('[Login] isFeishu:', feishuFlag);
  // eslint-disable-next-line no-console
  console.log('[Login] VITE_FEISHU_APP_ID:', appId);
  // eslint-disable-next-line no-console
  console.log('[Login] h5sdk:', (window as any).h5sdk);
  // eslint-disable-next-line no-console
  console.log('[Login] tt:', (window as any).tt);

  if (userStore.isLogin) {
    router.replace('/');
    return;
  }
  if (feishuFlag) {
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

.bind-tip {
  text-align: center;
  margin-bottom: 16px;
  color: #666;
  font-size: 14px;
}

.bind-error {
  text-align: center;
  margin-bottom: 12px;
  color: #f56c6c;
  font-size: 14px;
}

.feishu-error {
  text-align: center;
  color: #666;
  font-size: 14px;
}

.feishu-error p {
  margin-bottom: 16px;
}
</style>
