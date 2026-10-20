<script setup>
import { onMounted, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import { configured, supabase } from './lib/supabase'
import { store, initAuth } from './lib/store'
import Login from './views/Login.vue'
import { ICON, SITE_NAME } from './lib/util'
import { update, checkUpdate, applyUpdate, formatBuild, watchUpdates } from './lib/update'

const router = useRouter()
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
      <header class="topbar">
        <router-link to="/" class="brand">
          <img :src="ICON" alt="" width="28" height="28" />
          <span>{{ SITE_NAME }}</span>
        </router-link>
        <div class="topbar-right">
          <router-link to="/quotes" class="btn ghost small">報價查詢</router-link>
          <router-link v-if="store.isEditor" to="/payables" class="btn ghost small">應付帳款</router-link>
          <span class="role-tag" :class="store.role">{{ store.isEditor ? '編輯者' : '唯讀' }}</span>
          <button class="btn ghost small" @click="logout">登出</button>
        </div>
      </header>
      <main class="container">
        <router-view />
      </main>
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
</template>
