<script setup>
import { onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { configured, supabase } from './lib/supabase'
import { store, initAuth } from './lib/store'
import Login from './views/Login.vue'
import { ICON } from './lib/util'

const router = useRouter()
const ready = ref(false)

onMounted(async () => {
  if (configured) await initAuth()
  ready.value = true
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
    <Login v-if="!store.session" />
    <template v-else>
      <header class="topbar">
        <router-link to="/" class="brand">
          <img :src="ICON" alt="" width="28" height="28" />
          <span>PartTrail</span>
        </router-link>
        <div class="topbar-right">
          <span class="role-tag" :class="store.role">{{ store.isEditor ? '編輯者' : '唯讀' }}</span>
          <button class="btn ghost small" @click="logout">登出</button>
        </div>
      </header>
      <main class="container">
        <router-view />
      </main>
    </template>
  </template>
</template>
