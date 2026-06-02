import { createApp } from 'vue'
import { createPinia } from 'pinia'
import ElementPlus from 'element-plus'
import * as ElementPlusIconsVue from '@element-plus/icons-vue'
import 'element-plus/dist/index.css'
import zhCn from 'element-plus/es/locale/lang/zh-cn'
import router from './router'
import App from './App.vue'
import './style.css'
import { vPerm } from './directives/perm'
import { useUserStore } from './stores/user'

const app = createApp(App)

app.use(createPinia())
app.use(ElementPlus, { locale: zhCn })
app.directive('perm', vPerm)

for (const [name, comp] of Object.entries(ElementPlusIconsVue)) {
  app.component(name, comp)
}

// 挂载前:若已登录,用 token 拉一次最新权限,保证与菜单树同源,避免改授权后 F5 仍是旧权限
async function bootstrap() {
  const userStore = useUserStore()
  if (userStore.isLoggedIn) {
    try { await userStore.refreshUserInfo() } catch (e) { /* token 失效由请求拦截器处理 */ }
  }
  app.use(router)
  app.mount('#app')
}

bootstrap()
