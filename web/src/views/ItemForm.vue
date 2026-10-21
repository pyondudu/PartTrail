<script setup>
import { computed, nextTick, onBeforeUnmount, onMounted, reactive, ref, watch, watchEffect } from 'vue'
import { useRouter } from 'vue-router'
import { supabase } from '../lib/supabase'
import { store, getItem } from '../lib/store'
import { uploadAttachments, renameDuplicates } from '../lib/attachments'
import { STATUS, STATUS_KEYS, todayStr, fmtMoney, lineAmount, quoteTotals } from '../lib/util'

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
const blankLine = (unit = 'pcs') => ({ name: '', qty: null, unit, price: null })
const form = reactive({ ...EMPTY, quote_lines: [blankLine()] })
const original = ref(null)
const reason = ref('')
const err = ref('')
const busy = ref(false)
const amountTouched = ref(false) // 報價金額手動改過就不再依明細覆蓋

watchEffect(() => {
  if (isNew.value || original.value) return
  const item = getItem(props.id)
  if (item) {
    original.value = item
    for (const k of Object.keys(EMPTY)) form[k] = item[k] ?? EMPTY[k]
    form.quote_lines = item.quote_lines?.length ? JSON.parse(JSON.stringify(item.quote_lines)) : [blankLine()]
    // 舊資料的報價金額與明細總計不同時，視為手動輸入，不自動覆蓋
    amountTouched.value = item.quote_amount !== null && item.quote_amount !== quoteTotals(item.quote_lines).total
  }
})

// 報價明細（未稅單價）：有填明細時，數量、單位、報價金額（含稅）與空白品名自動帶入
const filledLines = computed(() => form.quote_lines.filter((l) => String(l.name ?? '').trim() || l.qty || l.price))
const hasLines = computed(() => filledLines.value.length > 0)
const totals = computed(() => quoteTotals(filledLines.value))
const autoName = computed(() => {
  const list = filledLines.value
  if (!list.length) return ''
  const first = String(list[0].name ?? '').trim().split('\n')[0]
  return list.length > 1 ? `${first} 等 ${list.length} 項` : first
})
const LINE_UNITS = ['pcs', 'set', 'EA', '支', '個', '組']

function addLine() {
  form.quote_lines.push(blankLine(form.quote_lines.at(-1)?.unit || 'pcs'))
}
function removeLine(i) {
  form.quote_lines.splice(i, 1)
  if (!form.quote_lines.length) form.quote_lines.push(blankLine())
}

watch(totals, (t) => {
  if (!hasLines.value) return
  // 總表以整張報價單為一筆：1 set，細項點進去看報價明細
  form.qty = 1
  form.unit = 'set'
  if (!amountTouched.value) form.quote_amount = t.total
})
watch(autoName, (v, prev) => {
  if (v && (!form.part_name || form.part_name === prev)) form.part_name = v
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

// 專案：列出進行中（未收貨）料件的專案；新專案當場輸入，存檔後自然出現在清單
const extraProjects = ref([])
const projects = computed(() => {
  const active = store.items.filter((i) => i.status !== 'received').map((i) => i.project)
  return [...new Set([...active, ...extraProjects.value, form.project].filter(Boolean))].sort((a, b) => a.localeCompare(b, 'zh-Hant'))
})
watch(() => form.project, (v, prev) => {
  if (v !== ADD_NEW) return
  form.project = prev
  const name = window.prompt('新增專案名稱：')?.trim()
  if (!name) return
  if (!projects.value.includes(name)) extraProjects.value.push(name)
  form.project = name
})

// 單位：常用的直接選，其他可當場輸入；編輯舊資料時不在清單上的值也保留顯示
const UNITS = ['pcs', 'set']
const extraUnits = ref([])
const units = computed(() => [...new Set([...UNITS, ...extraUnits.value, form.unit].filter(Boolean))])
watch(() => form.unit, (v, prev) => {
  if (v !== ADD_NEW) return
  form.unit = prev
  const name = window.prompt('輸入單位：')?.trim()
  if (!name) return
  if (!units.value.includes(name)) extraUnits.value.push(name)
  form.unit = name
})

// 儲存時一併上傳的附檔（多頁報價單可連續拍照或多選）；圖片附縮圖預覽
const pending = ref([])
function addFiles(e) {
  const files = renameDuplicates([...e.target.files], pending.value.map((p) => p.file.name))
  e.target.value = ''
  for (const file of files) {
    pending.value.push({ file, url: file.type.startsWith('image/') ? URL.createObjectURL(file) : null })
  }
}
function removePending(i) {
  const [p] = pending.value.splice(i, 1)
  if (p.url) URL.revokeObjectURL(p.url)
}
onBeforeUnmount(() => pending.value.forEach((p) => p.url && URL.revokeObjectURL(p.url)))

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
  const keys = ['project', 'part_name', 'requester', 'vendor']
  if (!hasLines.value) keys.push('qty')
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
  payload.quote_lines = hasLines.value
    ? filledLines.value.map((l) => ({ name: String(l.name ?? '').trim(), qty: l.qty ?? null, unit: l.unit || null, price: l.price ?? null }))
    : null

  const q = isNew.value
    ? supabase.from('items').insert(payload).select().single()
    : supabase.from('items').update(payload).eq('id', props.id).select().single()
  const { data, error } = await q
  if (error) { busy.value = false; err.value = '儲存失敗：' + error.message; return }
  if (pending.value.length) {
    try {
      await uploadAttachments(data.id, pending.value.map((p) => p.file))
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
        <label class="span2" :class="{ invalid: bad('project') }">專案 *
          <select v-model="form.project">
            <option value="" disabled>請選擇專案</option>
            <option v-for="p in projects" :key="p" :value="p">{{ p }}</option>
            <option :value="ADD_NEW">＋ 新增專案…</option>
          </select>
        </label>
        <label class="span2" :class="{ invalid: bad('part_name') }">品名 *<input v-model="form.part_name" /></label>
        <label class="span2" :class="{ invalid: bad('requester') }">需求人 *
          <select v-model="form.requester">
            <option value="" disabled>請選擇需求人</option>
            <option v-for="r in requesters" :key="r" :value="r">{{ r }}</option>
            <option :value="ADD_NEW">＋ 新增需求人…</option>
          </select>
        </label>
        <label v-if="original?.spec" class="span2">規格 / 說明（舊資料）<textarea v-model="form.spec" rows="2" /></label>
        <template v-if="!hasLines">
          <label :class="{ invalid: bad('qty') }">數量 *<input v-model.number="form.qty" type="number" min="0" step="any" inputmode="decimal" /></label>
          <label>單位
            <select v-model="form.unit">
              <option v-for="u in units" :key="u" :value="u">{{ u }}</option>
              <option :value="ADD_NEW">＋ 其他…</option>
            </select>
          </label>
        </template>
        <p v-else class="span2 muted">數量：1 set（共 {{ filledLines.length }} 項，細項見報價明細）</p>
      </div>
    </fieldset>

    <fieldset class="card">
      <legend>報價明細（單價未稅）</legend>
      <p class="muted">依報價單逐列輸入；有填明細時，數量與報價金額（含稅）自動計算。</p>
      <datalist id="line-units"><option v-for="u in LINE_UNITS" :key="u" :value="u" /></datalist>
      <div class="qlines">
        <div class="qline qline-head">
          <span>品名規格</span><span>數量</span><span>單位</span><span>單價</span><span class="num">金額</span><span />
        </div>
        <div v-for="(l, i) in form.quote_lines" :key="i" class="qline">
          <textarea v-model="l.name" rows="1" placeholder="品名規格" aria-label="品名規格" />
          <input v-model.number="l.qty" type="number" min="0" step="any" inputmode="decimal" placeholder="數量" aria-label="數量" />
          <input v-model="l.unit" list="line-units" placeholder="單位" aria-label="單位" />
          <input v-model.number="l.price" type="number" min="0" step="any" inputmode="decimal" placeholder="單價" aria-label="單價" />
          <span class="num amount">{{ fmtMoney(lineAmount(l)) }}</span>
          <button type="button" class="btn link danger" aria-label="刪除此列" @click="removeLine(i)">✕</button>
        </div>
      </div>
      <button type="button" class="btn ghost small" @click="addLine">＋ 新增一列</button>
      <dl v-if="hasLines" class="qtotals">
        <dt>數量合計</dt><dd>{{ totals.qty }}</dd>
        <dt>合計</dt><dd>{{ fmtMoney(totals.subtotal) }}</dd>
        <dt>稅金 5%</dt><dd>{{ fmtMoney(totals.tax) }}</dd>
        <dt>總計</dt><dd><strong>{{ fmtMoney(totals.total) }}</strong></dd>
      </dl>
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
        <label>報價金額（含稅）<input v-model.number="form.quote_amount" type="number" min="0" step="any" inputmode="decimal" @input="amountTouched = true" />
          <small v-if="hasLines && form.quote_amount !== totals.total" class="muted">
            依明細 {{ fmtMoney(totals.total) }} <button type="button" class="btn link" @click="amountTouched = false; form.quote_amount = totals.total">套用</button>
          </small>
        </label>
        <label>報價日期<input v-model="form.quote_date" type="date" /></label>
      </div>
      <div class="section-head attach-head">
        <span>附檔（報價單等）</span>
        <div class="head-actions">
          <label class="btn ghost small">
            📷 {{ pending.length ? '再拍一頁' : '拍照' }}<input type="file" accept="image/*" capture="environment" hidden @change="addFiles" />
          </label>
          <label class="btn ghost small">
            📎 {{ pending.length ? '再加檔案' : '選擇檔案' }}<input type="file" accept="image/*,application/pdf" multiple hidden @change="addFiles" />
          </label>
        </div>
      </div>
      <p v-if="!pending.length" class="muted">{{ isNew ? '尚未選擇附檔' : '已上傳的附檔請到詳細頁查看' }}</p>
      <ul class="files">
        <li v-for="(p, i) in pending" :key="p.file.name">
          <span class="file">
            <img v-if="p.url" :src="p.url" alt="" />
            <span v-else class="file-icon">PDF</span>
            <span class="file-name">{{ p.file.name }}</span>
          </span>
          <button type="button" class="btn link danger" @click="removePending(i)">移除</button>
        </li>
      </ul>
      <p v-if="pending.length" class="muted">已選 {{ pending.length }} 個檔案，儲存時一起上傳。多頁報價單可連續拍照，或一次選取多個檔案。</p>
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
