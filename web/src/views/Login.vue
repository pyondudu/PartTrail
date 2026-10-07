<script setup>
import { ref } from 'vue'
import { supabase } from '../lib/supabase'
import { ICON, toLoginEmail } from '../lib/util'

const email = ref('')
const password = ref('')
const mode = ref('password') // password | magic
const msg = ref('')
const busy = ref(false)

async function submit() {
  msg.value = ''
  busy.value = true
  try {
    if (mode.value === 'password') {
      const { error } = await supabase.auth.signInWithPassword({ email: toLoginEmail(email.value), password: password.value })
      if (error) msg.value = '登入失敗：' + error.message
    } else {
      const { error } = await supabase.auth.signInWithOtp({
        email: email.value,
        options: { shouldCreateUser: false, emailRedirectTo: location.href.split('#')[0] },
      })
      msg.value = error ? '寄送失敗：' + error.message : '已寄出登入連結，請到信箱點擊。'
    }
  } finally {
    busy.value = false
  }
}
</script>

<template>
  <div class="center-box card login">
    <img :src="ICON" alt="" width="56" height="56" />
    <h1>PartTrail</h1>
    <p class="muted">料件交期追蹤</p>
    <form @submit.prevent="submit">
      <label v-if="mode === 'password'" key="account">帳號或 Email<input v-model="email" type="text" required autocomplete="username" autocapitalize="none" spellcheck="false" /></label>
      <label v-else key="email">Email<input v-model="email" type="email" required autocomplete="email" /></label>
      <label v-if="mode === 'password'">密碼<input v-model="password" type="password" required autocomplete="current-password" /></label>
      <button class="btn primary block" :disabled="busy">{{ mode === 'password' ? '登入' : '寄送登入連結' }}</button>
    </form>
    <button class="btn link" @click="mode = mode === 'password' ? 'magic' : 'password'">
      {{ mode === 'password' ? '改用 Email 連結登入（免密碼）' : '改用密碼登入' }}
    </button>
    <p v-if="msg" class="msg">{{ msg }}</p>
  </div>
</template>
