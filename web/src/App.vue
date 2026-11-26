<script setup>
import { onMounted, ref, watch } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { configured, supabase } from './lib/supabase'
import { store, initAuth } from './lib/store'
import Login from './views/Login.vue'
import { ICON, SITE_NAME, SITE_TAGLINE } from './lib/util'
import { update, checkUpdate, applyUpdate, formatBuild, watchUpdates } from './lib/update'
import { toastState } from './lib/toast'
import Dialog from './components/Dialog.vue'

const router = useRouter()
const route = useRoute()

// 導覽連結：桌機側欄與窄螢幕頂欄共用同一份。icon 是 24×24 的 SVG path（線條風格）
const NAV = [
  { to: '/', label: '收貨總表', icon: 'M3 7h18M3 12h18M3 17h18' },
  { to: '/quotes', label: '報價查詢', icon: 'M11 4a7 7 0 1 0 0 14a7 7 0 0 0 0-14zM20 20l-4-4' },
  { to: '/payables', label: '應付帳款', icon: 'M3 6h18v12H3zM3 10h18M7 15h4' },
  { to: '/cost', label: '成本分析', icon: 'M4 20V10M10 20V4M16 20v-7M22 20H2' },
  { to: '/inventory', label: '庫存管理', icon: 'M21 8l-9-5-9 5v8l9 5 9-5zM3 8l9 5 9-5M12 13v8' },
  { to: '/settings', label: '系統設定', icon: 'M12 9a3 3 0 1 0 0 6a3 3 0 0 0 0-6zM12 2v3M12 19v3M2 12h3M19 12h3M4.9 4.9l2.1 2.1M17 17l2.1 2.1M4.9 19.1L7 17M17 7l2.1-2.1' },
]
// 收貨總表涵蓋品項的新增／明細／編輯頁
function isActive(to) {
  return to === '/' ? route.path === '/' || route.path.startsWith('/item/') : route.path.startsWith(to)
}
const ready = ref(false)

onMounted(async () => {
  if (configured) await initAuth()
  ready.value = true
  watchUpdates()
})

// 「已是最新版／無法連線」顯示幾秒後恢復成按鈕
let resetTimer
watch(() => update.status, (v) => {
  clearTimeout(resetTimer)
  if (v === 'latest' || v === 'error') resetTimer = setTimeout(() => (update.status = 'idle'), 4000)
})

// 登出後回到總表，下一個登入的人不會停在上一個人看的頁面
async function logout() {
  await supabase.auth.signOut()
  router.replace('/')
}
</script>

<template>
  <div v-if="!configured" class="center-box card">
    <h2>尚未設定 Supabase</h2>
    <p>請複製 <code>web/.env.example</code> 為 <code>web/.env</code>，填入 Project URL 與 anon key 後重新啟動。</p>
  </div>
  <template v-else-if="ready">
    <div v-if="update.status === 'available'" class="update-banner">
      有新版本 <button class="btn small primary" @click="applyUpdate">立即更新</button>
    </div>
    <Login v-if="!store.session" />
    <template v-else>
      <div class="shell">
        <aside class="sidebar">
          <router-link to="/" class="sidebar-brand">
            <img :src="ICON" alt="" width="28" height="28" />
            <span>
              <span class="brand-name">{{ SITE_NAME }}</span>
              <span class="brand-tagline">{{ SITE_TAGLINE }}</span>
            </span>
          </router-link>
          <nav class="side-nav">
            <router-link v-for="n in NAV" :key="n.to" :to="n.to" :class="{ active: isActive(n.to) }">
              <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path :d="n.icon" /></svg>
              {{ n.label }}
            </router-link>
          </nav>
          <div class="side-foot">
            <div class="side-user">
              <span class="role-tag" :class="store.role">{{ store.isEditor ? '編輯者' : '唯讀' }}</span>
              <button class="btn ghost small" @click="logout">登出</button>
            </div>
            <div class="side-version">
              版本 {{ formatBuild() || '開發版' }}<br />
              <span v-if="update.status === 'checking'">檢查中…</span>
              <span v-else-if="update.status === 'latest'">已是最新版</span>
              <span v-else-if="update.status === 'error'">無法連線，稍後再試</span>
              <button v-else-if="update.status === 'available'" class="btn link" @click="applyUpdate">有新版本，立即更新</button>
              <button v-else class="btn link" @click="checkUpdate()">檢查更新</button>
            </div>
          </div>
        </aside>
        <div class="shell-main">
          <header class="topbar">
            <router-link to="/" class="brand">
              <img :src="ICON" alt="" width="28" height="28" />
              <span class="brand-name">{{ SITE_NAME }}</span>
              <span class="brand-tagline">{{ SITE_TAGLINE }}</span>
            </router-link>
            <div class="topbar-right">
              <router-link v-for="n in NAV.slice(1)" :key="n.to" :to="n.to" class="btn ghost small">{{ n.label }}</router-link>
              <span class="role-tag" :class="store.role">{{ store.isEditor ? '編輯者' : '唯讀' }}</span>
              <button class="btn ghost small" @click="logout">登出</button>
            </div>
          </header>
          <main class="container">
            <router-view />
          </main>
        </div>
      </div>
    </template>
    <footer class="version-bar">
      版本 {{ formatBuild() || '開發版' }} ·
      <span v-if="update.status === 'checking'">檢查中…</span>
      <span v-else-if="update.status === 'latest'">已是最新版</span>
      <span v-else-if="update.status === 'error'">無法連線，稍後再試</span>
      <button v-else-if="update.status === 'available'" class="btn link" @click="applyUpdate">有新版本，立即更新</button>
      <button v-else class="btn link" @click="checkUpdate()">檢查更新</button>
    </footer>
  </template>
  <Transition name="toast">
    <div v-if="toastState.msg" :key="toastState.key" class="toast" :class="toastState.type" role="status" aria-live="polite">
      <span class="toast-icon" aria-hidden="true">{{ toastState.type === 'error' ? '!' : '✓' }}</span>{{ toastState.msg }}
    </div>
  </Transition>
  <Dialog />
</template>
