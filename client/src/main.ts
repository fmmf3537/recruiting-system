import { createApp } from 'vue';
import { createPinia } from 'pinia';
import App from './App.vue';
import router from './router';

import './assets/css/main.scss';
// 显式导入命令式组件的样式（unplugin-vue-components 无法自动检测）
import 'element-plus/es/components/message/style/css';
import 'element-plus/es/components/message-box/style/css';

const app = createApp(App);

const pinia = createPinia();
app.use(pinia);
app.use(router);

app.mount('#app');

console.log('[Main] App mounted');
