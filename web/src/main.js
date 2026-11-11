import { createApp } from 'vue'
import { createRouter, createWebHashHistory } from 'vue-router'
import App from './App.vue'
import Dashboard from './views/Dashboard.vue'
import ItemDetail from './views/ItemDetail.vue'
import ItemForm from './views/ItemForm.vue'
import Cost from './views/Cost.vue'
import Payables from './views/Payables.vue'
import Quotes from './views/Quotes.vue'
import Settings from './views/Settings.vue'
import './style.css'

const router = createRouter({
  history: createWebHashHistory(),
  routes: [
    { path: '/', component: Dashboard },
    { path: '/item/new', component: ItemForm },
    { path: '/item/:id', component: ItemDetail, props: true },
    { path: '/item/:id/edit', component: ItemForm, props: true },
    { path: '/payables', component: Payables },
    { path: '/quotes', component: Quotes },
    { path: '/cost', component: Cost },
    { path: '/settings', component: Settings },
  ],
  scrollBehavior: (to, from, saved) => saved || { top: 0 },
})

createApp(App).use(router).mount('#app')

if ('serviceWorker' in navigator && import.meta.env.PROD) {
  navigator.serviceWorker.register('./sw.js').catch(() => {})
}
