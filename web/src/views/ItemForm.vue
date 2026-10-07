<script setup>
import { computed, nextTick, onMounted, reactive, ref, watch, watchEffect } from 'vue'
import { useRouter } from 'vue-router'
import { supabase } from '../lib/supabase'
import { store, getItem } from '../lib/store'
import { uploadAttachments } from '../lib/attachments'
import { STATUS, STATUS_KEYS, todayStr } from '../lib/util'

const props = defineProps({ id: String })
const router = useRouter()
const isNew = computed(() => !props.id)

const EMPTY = {
  project: '', part_name: '', spec: '', qty: null, unit: 'pcs',
  vendor: '', requester: '',
  quote_no: '', quote_amount: null, quote_date: todayStr(),
  status: 'quoted', order_date: null, due_date: null,
  received_date: null, note: '',
}
const form = reactive({ ...EMPTY })
const original = ref(null)
const reason = ref('')
const err = ref('')
const busy = ref(false)

watchEffect(() => {
  if (isNew.value || original.value) return
  const item = getItem(props.id)
  if (item) {
    original.value = item
    for (const k of Object.keys(EMPTY)) form[k] = item[k] ?? EMPTY[k]
  }
})

const dueChanged = computed(() => original.value?.due_date && form.due_date !== original.value.due_date)

// 下拉選單：名單來自 Supabase 表（不寫進公開程式碼）；選「＋ 新增…」可當場加入。
// 編輯舊資料時，不在名單上的值也保留顯示
const ADD_NEW = '__add__'
function nameList(table, field, label) {
  const list = ref([])
  onMounted(async () => {
    const { data, error } = await supabase.from(table).select('name')
    if (error) err.value = `讀取${label}清單失敗：` + error.message
    list.value = (data ?? []).map((r) => r.name)
  })
  watch(() => form[field], async (v, prev) => {
    if (v !== ADD_NEW) return
    form[field] = prev
    const name = window.prompt(`新增${label}名稱：`)?.trim()
    if (!name) return
    const { error } = await supabase.from(table).insert({ name })
    if (error && error.code !== '23505') return alert(`新增${label}失敗：` + error.message)
    if (!list.value.includes(name)) list.value.push(name)
    form[field] = name
  })
  return computed(() => [...new Set([...list.value, form[field]].filter(Boolean))].sort((a, b) => a.localeCompare(b, 'zh-Hant')))
}
const vendors = nameList('vendors', 'vendor', '廠商')
const requesters = nameList('requesters', 'requester', '需求人')

// 儲存時一併上傳的附檔
const pending = ref([])
function addFiles(e) {
  pending.value.push(...e.target.files)
  e.target.value = ''
}

function setStatus(k) {
  form.status = k
  if (k === 'ordered' && !form.order_date) form.order_date = todayStr()
  if (k === 'received' && !form.received_date) form.received_date = todayStr()
}

// 必填欄位：追交期必要的資訊；依狀態只檢查目前顯示的區塊
const LABELS = {
  project: '專案', part_name: '品名', requester: '需求人', qty: '數量', vendor: '廠商',
  due_date: '交期', reason: '交期變更原因', received_date: '到貨日',
}
const showErrors = ref(false)

function isEmpty(v) {
  return v === null || v === undefined || String(v).trim() === ''
}

const missing = computed(() => {
  const keys = ['project', 'part_name', 'requester', 'qty', 'vendor']
  if (form.status !== 'quoted') keys.push('due_date')
  if (form.status === 'received') keys.push('received_date')
  const list = keys.filter((k) => isEmpty(form[k]))
  if (dueChanged.value && isEmpty(reason.value)) list.push('reason')
  return list
})

watch(missing, (m) => {
  if (!showErrors.value) return
  err.value = m.length ? '還有欄位沒填：' + m.map((k) => LABELS[k]).join('、') : ''
})

const bad = (k) => showErrors.value && missing.value.includes(k)

async function save() {
  if (missing.value.length) {
    showErrors.value = true
    err.value = '還有欄位沒填：' + missing.value.map((k) => LABELS[k]).join('、')
    await nextTick()
    const first = document.querySelector('.form .invalid')
    first?.scrollIntoView({ behavior: 'smooth', block: 'center' })
    first?.querySelector('input, textarea, select')?.focus({ preventScroll: true })
    return
  }
  err.value = ''
  busy.value = true
  const payload = { ...form }
  for (const k of Object.keys(payload)) if (payload[k] === '') payload[k] = null
  if (dueChanged.value) payload.due_change_reason = reason.value.trim()

  const q = isNew.value
    ? supabase.from('items').insert(payload).select().single()
    : supabase.from('items').update(payload).eq('id', props.id).select().single()
  const { data, error } = await q
  if (error) { busy.value = false; err.value = '儲存失敗：' + error.message; return }
  if (pending.value.length) {
    try {
      await uploadAttachments(data.id, pending.value)
    } catch (e) {
      alert('料件已儲存，但附檔上傳失敗：' + e.message + '\n請到詳細頁重新上傳。')
    }
  }
  busy.value = false
  router.replace('/item/' + data.id)
}
</script>

<template>
  <div v-if="!store.isEditor" class="card center">唯讀帳號無法編輯。</div>
  <div v-else-if="!isNew && !original" class="muted center">載入中…</div>
  <form v-else class="form" novalidate @submit.prevent="save">
    <div class="page-head">
      <button type="button" class="btn ghost small" @click="router.back()">← 返回</button>
      <h2>{{ isNew ? '新增料件' : '編輯料件' }}</h2>
    </div>

    <fieldset class="card">
      <legend>狀態</legend>
      <div class="status-steps">
        <button v-for="k in STATUS_KEYS" :key="k" type="button" class="step" :class="{ on: form.status === k }" @click="setStatus(k)">
          <strong>{{ STATUS[k].label }}</strong><small>{{ STATUS[k].hint }}</small>
        </button>
      </div>
    </fieldset>

    <fieldset class="card">
      <legend>料件資訊</legend>
      <div class="grid">
        <label class="span2" :class="{ invalid: bad('project') }">專案 *<input v-model="form.project" /></label>
        <label class="span2" :class="{ invalid: bad('part_name') }">品名 *<input v-model="form.part_name" /></label>
        <label class="span2" :class="{ invalid: bad('requester') }">需求人 *
          <select v-model="form.requester">
            <option value="" disabled>請選擇需求人</option>
            <option v-for="r in requesters" :key="r" :value="r">{{ r }}</option>
            <option :value="ADD_NEW">＋ 新增需求人…</option>
          </select>
        </label>
        <label class="span2">規格 / 說明<textarea v-model="form.spec" rows="2" placeholder="細節可直接看報價單附檔" /></label>
        <label :class="{ invalid: bad('qty') }">數量 *<input v-model.number="form.qty" type="number" min="0" step="any" inputmode="decimal" /></label>
        <label>單位<input v-model="form.unit" /></label>
      </div>
    </fieldset>

    <fieldset class="card">
      <legend>廠商與報價</legend>
      <div class="grid">
        <label :class="{ invalid: bad('vendor') }">廠商 *
          <select v-model="form.vendor">
            <option value="" disabled>請選擇廠商</option>
            <option v-for="v in vendors" :key="v" :value="v">{{ v }}</option>
            <option :value="ADD_NEW">＋ 新增廠商…</option>
          </select>
        </label>
        <label>報價單號<input v-model="form.quote_no" placeholder="LINE 報價可留空" /></label>
        <label>報價金額（含稅）<input v-model.number="form.quote_amount" type="number" min="0" step="any" inputmode="decimal" /></label>
        <label>報價日期<input v-model="form.quote_date" type="date" /></label>
      </div>
      <div class="section-head attach-head">
        <span>附檔（報價單等）</span>
        <div class="head-actions">
          <label class="btn ghost small">
            📷 拍照<input type="file" accept="image/*" capture="environment" hidden @change="addFiles" />
          </label>
          <label class="btn ghost small">
            📎 選擇檔案<input type="file" accept="image/*,application/pdf" multiple hidden @change="addFiles" />
          </label>
        </div>
      </div>
      <p v-if="!pending.length" class="muted">{{ isNew ? '尚未選擇附檔' : '已上傳的附檔請到詳細頁查看' }}</p>
      <ul class="files">
        <li v-for="(f, i) in pending" :key="i">
          <span class="file-name">{{ f.name }}</span>
          <button type="button" class="btn link danger" @click="pending.splice(i, 1)">移除</button>
        </li>
      </ul>
    </fieldset>

    <fieldset v-if="form.status !== 'quoted'" class="card">
      <legend>下單與交期</legend>
      <div class="grid">
        <label>下單（用印回傳）日<input v-model="form.order_date" type="date" /></label>
        <label :class="{ invalid: bad('due_date') }">交期 *<input v-model="form.due_date" type="date" /></label>
        <label v-if="dueChanged" class="span2 warn" :class="{ invalid: bad('reason') }">
          交期變更原因 *（原交期 {{ original.due_date }}）
          <input v-model="reason" placeholder="例：廠商材料延遲" />
        </label>
      </div>
    </fieldset>

    <fieldset v-if="form.status === 'received'" class="card">
      <legend>到貨</legend>
      <div class="grid">
        <label :class="{ invalid: bad('received_date') }">到貨日 *<input v-model="form.received_date" type="date" /></label>
      </div>
    </fieldset>

    <fieldset class="card">
      <legend>備註</legend>
      <textarea v-model="form.note" rows="3" placeholder="追問紀錄、催貨情況…" />
    </fieldset>


    <p v-if="err" class="msg error">{{ err }}</p>
    <div class="form-actions">
      <button type="button" class="btn ghost" @click="router.back()">取消</button>
      <button class="btn primary" :disabled="busy">{{ busy ? (pending.length ? '儲存並上傳中…' : '儲存中…') : '儲存' }}</button>
    </div>
  </form>
</template>
