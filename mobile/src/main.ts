import { createApp } from 'vue';
import { createPinia } from 'pinia';
// 引入 Vant 函数式组件样式（unplugin-vue-components 无法自动引入）
import 'vant/es/toast/style';
import 'vant/es/dialog/style';
import 'vant/es/notify/style';
import 'vant/es/image-preview/style';
import App from './App.vue';
import router from './router';

const app = createApp(App);
app.use(createPinia());
app.use(router);
app.mount('#app');
