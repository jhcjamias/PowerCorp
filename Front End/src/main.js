import './assets/main.css'
import './admin/styles/admin.css'

import { createApp } from 'vue'
import App from './App.vue'
import router from './admin/router'

createApp(App).use(router).mount('#app')
