<script setup>
import { computed, onMounted, ref } from 'vue'
import { supabase } from '../lib/supabase'
import { store } from '../lib/store'
import { TERMS } from '../lib/payables'
import { toast } from '../lib/toast'
import { confirmBox } from '../lib/dialog'
import { shake } from '../lib/util'

// 廠商與交易條件：在這裡新增廠商、修改交易條件；登打發票時自動帶入
const vendors = ref([])
const err = ref('')
const newName = ref('')
const newTerms = ref('')
const busy = ref(false)
const added = ref(false) // 新增成功後按鈕短暫顯示 ✓
const nameInput = ref(null)

async function load() {
  const { data, error } = await supabase.from('vendors').select('id, name, payment_terms, need_serials')
  if (error) err.value = '讀取廠商失敗：' + error.message
  vendors.value = (data ?? []).sort((a, b) => a.name.localeCompare(b.name, 'zh-Hant'))
}
onMounted(load)

// 料件數：有料件在用的廠商不能刪（料件存的是廠商名稱）
const itemCount = computed(() => {
  const m = {}
  for (const i of store.items) if (i.vendor) m[i.vendor] = (m[i.vendor] ?? 0) + 1
  return m
})
// 選單含舊資料的其他寫法
const termOptions = (v) => [...new Set([...TERMS, v].filter(Boolean))]

async function addVendor() {
  const name = newName.value.trim()
  if (!name) return
  if (vendors.value.some((v) => v.name === name)) {
    shake(nameInput.value)
    return toast(`「${name}」已經在清單裡`, 'error')
  }
  busy.value = true
  const { error } = await supabase.from('vendors').insert({ name, payment_terms: newTerms.value || null })
  busy.value = false
  if (error) return toast('新增廠商失敗：' + error.message, 'error')
  newName.value = ''
  newTerms.value = ''
  await load()
  toast(`已新增 ${name}`)
  added.value = true
  setTimeout(() => (added.value = false), 900)
}

async function setTerms(v, terms) {
  const prev = v.payment_terms
  v.payment_terms = terms || null
  const { error } = await supabase.from('vendors').update({ payment_terms: v.payment_terms }).eq('id', v.id)
  if (error) { v.payment_terms = prev; return toast('儲存失敗：' + error.message, 'error') }
  toast(`${v.name}：${terms || '未設定'}`)
}

async function setNeedSerials(v, on) {
  const prev = v.need_serials
  v.need_serials = on
  const { error } = await supabase.from('vendors').update({ need_serials: on }).eq('id', v.id)
  if (error) { v.need_serials = prev; return toast('儲存失敗：' + error.message, 'error') }
  toast(`${v.name}：${on ? '收貨時需記錄序號' : '不需記錄序號'}`)
}

async function removeVendor(v) {
  if (!(await confirmBox(`刪除廠商「${v.name}」？`, { ok: '刪除', danger: true }))) return
  const { error } = await supabase.from('vendors').delete().eq('id', v.id)
  if (error) return toast('刪除失敗：' + error.message, 'error')
  vendors.value = vendors.value.filter((x) => x.id !== v.id)
  toast(`已刪除 ${v.name}`)
}
</script>

<template>
  <div class="detail">
    <div class="page-head">
      <router-link to="/" class="btn ghost small">← 收貨總表</router-link>
      <h2>設定</h2>
    </div>

    <section class="card">
      <div class="section-head"><h3>廠商與交易條件</h3></div>
      <p class="muted">新增料件時的廠商下拉選單來自這裡；交易條件會在登打發票時自動帶入並計算預計付款日。勾「需序號」的廠商，料件標為已收貨時必須填貨件序號。</p>

      <form v-if="store.isEditor" class="vendor-add" @submit.prevent="addVendor">
        <label>新增廠商<input ref="nameInput" v-model="newName" placeholder="廠商名稱" /></label>
        <label>交易條件
          <select v-model="newTerms">
            <option value="">未設定</option>
            <option v-for="t in TERMS" :key="t" :value="t">{{ t }}</option>
          </select>
        </label>
        <button class="btn primary" :class="{ loading: busy, done: added }" :disabled="busy || !newName.trim()">新增</button>
      </form>

      <p v-if="err" class="msg error">{{ err }}</p>
      <p v-else-if="!vendors.length" class="muted">尚無廠商</p>
      <ul class="vendor-list">
        <li v-for="v in vendors" :key="v.id">
          <div class="vendor-name">
            <strong>{{ v.name }}</strong>
            <span class="muted small">{{ itemCount[v.name] ? `${itemCount[v.name]} 筆料件` : '尚無料件' }}</span>
          </div>
          <select v-if="store.isEditor" :value="v.payment_terms || ''" :class="{ unset: !v.payment_terms }" aria-label="交易條件" @change="setTerms(v, $event.target.value)">
            <option value="">未設定</option>
            <option v-for="t in termOptions(v.payment_terms)" :key="t" :value="t">{{ t }}</option>
          </select>
          <span v-else :class="{ unset: !v.payment_terms }">{{ v.payment_terms || '未設定' }}</span>
          <label v-if="store.isEditor" class="switch serial-flag" title="收貨時必填序號">
            <input type="checkbox" :checked="v.need_serials" @change="setNeedSerials(v, $event.target.checked)" />需序號
          </label>
          <span v-else class="small">{{ v.need_serials ? '需序號' : '' }}</span>
          <button v-if="store.isEditor && !itemCount[v.name]" class="btn link danger" title="刪除" @click="removeVendor(v)">刪除</button>
          <span v-else class="vendor-del-gap" />
        </li>
      </ul>
    </section>

  </div>
</template>

<style scoped>
.vendor-add { display: grid; grid-template-columns: 2fr 1fr auto; gap: 10px; align-items: end; margin: 12px 0 16px; }
.vendor-list { list-style: none; margin: 0; padding: 0; }
.vendor-list li { display: grid; grid-template-columns: 1fr 160px 96px 48px; gap: 10px; align-items: center; padding: 8px 0; border-top: 1px solid var(--border); }
.vendor-name { display: flex; flex-direction: column; min-width: 0; }
.vendor-list .unset { color: var(--soon); }
.small { font-size: 0.8rem; }
.serial-flag { gap: 6px; font-size: 0.85rem; white-space: nowrap; }
@media (max-width: 640px) {
  .vendor-add { grid-template-columns: 1fr; }
  .vendor-list li { grid-template-columns: 1fr 110px 90px 40px; gap: 6px; }
}
</style>
