import { createApp } from 'vue';
import { createPinia } from 'pinia';
// 引入 Vant 函数式组件样式（unplugin-vue-components 无法自动引入）
import 'vant/es/toast/style';
import 'vant/es/dialog/style';
import 'vant/es/notify/style';
import 'vant/es/image-preview/style';
import App from './App.vue';
import router from './router';
import { useUserStore } from './stores/user';

const app = createApp(App);
app.use(createPinia());
app.use(router);

// 恢复用户状态：有 token 但无用户信息时，自动拉取
const userStore = useUserStore();
if (userStore.token && !userStore.userInfo) {
  userStore.fetchUserInfo().catch(() => {
    // 静默失败，不影响启动
  });
}

app.mount('#app');
