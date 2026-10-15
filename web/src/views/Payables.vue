<script setup>
import { computed, nextTick, onMounted, ref, watch } from 'vue'
import { supabase } from '../lib/supabase'
import { store } from '../lib/store'
import { fmtDate, fmtMoney, todayStr } from '../lib/util'
import { COLUMNS, buildRow, itemsText, payDueDate, copyRows } from '../lib/payables'

const invoices = ref([])
const vendorTerms = ref({})
const toast = ref('')
const err = ref('')
const busy = ref(false)

async function loadInvoices() {
  const { data, error } = await supabase.from('invoices').select('*').order('invoice_date', { ascending: false }).order('created_at', { ascending: false }).limit(100)
  if (error) err.value = '讀取發票失敗：' + error.message
  invoices.value = (data ?? []).reverse() // 取最近 100 張，畫面與總表一致由舊到新
}
onMounted(async () => {
  await loadInvoices()
  const { data } = await supabase.from('vendors').select('name, payment_terms')
  vendorTerms.value = Object.fromEntries((data ?? []).filter((v) => v.payment_terms).map((v) => [v.name, v.payment_terms]))
})

function flash(msg) {
  toast.value = msg
  setTimeout(() => (toast.value = ''), 2500)
}

// 待登打：已收貨、尚未對應發票；依 廠商＋報價單號 分組，與總表一致依到貨日由舊到新
const byReceived = (a, b) => (a.received_date || '9999').localeCompare(b.received_date || '9999') || a.created_at.localeCompare(b.created_at)
const pendingItems = computed(() => store.items.filter((i) => i.status === 'received' && !i.invoice_id).sort(byReceived))
const groups = computed(() => {
  const map = new Map()
  for (const i of pendingItems.value) {
    const key = `${i.vendor}\u0000${i.quote_no || ''}`
    if (!map.has(key)) map.set(key, { key, vendor: i.vendor, quote_no: i.quote_no || '', items: [] })
    map.get(key).items.push(i)
  }
  return [...map.values()] // pendingItems 已排序，各組依最早到貨日排列
})

// ── 發票編輯 ──
const edit = ref(null) // { id?, vendor, quote_no, ..., itemIds: Set }
const showErrors = ref(false)
let textTouched = false
let dueTouched = false

function defaultTerms(vendor) {
  return vendorTerms.value[vendor] || invoices.value.find((v) => v.vendor === vendor && v.payment_terms)?.payment_terms || ''
}

async function openEditor(data) {
  edit.value = data
  showErrors.value = false
  err.value = ''
  await nextTick()
  document.querySelector('.inv-editor')?.scrollIntoView({ behavior: 'smooth', block: 'start' })
}

function startNew(g) {
  textTouched = false
  dueTouched = false
  const terms = defaultTerms(g.vendor)
  const invoice_date = todayStr()
  openEditor({
    id: null, vendor: g.vendor, quote_no: g.quote_no,
    invoice_date, invoice_no: '', amount: null,
    items_text: itemsText(g.items), pr_no: '', payment_terms: terms, pay_method: '匯款',
    pay_due_date: payDueDate(invoice_date, terms),
    exported_at: null,
    itemIds: new Set(g.items.map((i) => i.id)),
  })
}

function startEdit(inv) {
  textTouched = true
  dueTouched = true
  openEditor({ ...inv, itemIds: new Set(store.items.filter((i) => i.invoice_id === inv.id).map((i) => i.id)) })
}

// 新增時可勾選同廠商其他待登打料件（例：一張發票含兩張報價單）
const candidateItems = computed(() => {
  if (!edit.value) return []
  const linked = store.items.filter((i) => edit.value.id && i.invoice_id === edit.value.id)
  const pending = pendingItems.value.filter((i) => i.vendor === edit.value.vendor)
  return [...linked, ...pending].sort(byReceived)
})
const selectedItems = computed(() => candidateItems.value.filter((i) => edit.value.itemIds.has(i.id)))
const quoteSum = computed(() => {
  const nums = selectedItems.value.map((i) => i.quote_amount).filter((n) => n !== null && n !== undefined)
  return nums.length ? nums.reduce((a, b) => a + Number(b), 0) : null
})

function toggleItem(i) {
  const s = new Set(edit.value.itemIds)
  s.has(i.id) ? s.delete(i.id) : s.add(i.id)
  edit.value.itemIds = s
  if (!textTouched) edit.value.items_text = itemsText(selectedItems.value)
}

watch(() => edit.value && [edit.value.invoice_date, edit.value.payment_terms], () => {
  if (edit.value && !dueTouched) edit.value.pay_due_date = payDueDate(edit.value.invoice_date, edit.value.payment_terms)
})

const preview = computed(() => (edit.value ? buildRow(edit.value) : []))

const LABELS = { invoice_date: '發票日期', invoice_no: '發票號碼', amount: '金額', items: '料件' }
const missing = computed(() => {
  if (!edit.value) return []
  const e = edit.value
  const list = ['invoice_date', 'invoice_no', 'amount'].filter((k) => e[k] === null || e[k] === undefined || String(e[k]).trim() === '')
  if (!e.itemIds.size) list.push('items')
  return list
})
const bad = (k) => showErrors.value && missing.value.includes(k)

// 存發票、連結料件、記住廠商交易條件；回傳存好的發票
async function saveInvoice() {
  if (missing.value.length) {
    showErrors.value = true
    err.value = '還有欄位沒填：' + missing.value.map((k) => LABELS[k]).join('、')
    return null
  }
  err.value = ''
  const e = edit.value
  const payload = {
    vendor: e.vendor, quote_no: e.quote_no?.trim() || null,
    invoice_date: e.invoice_date, invoice_no: e.invoice_no.trim(), amount: e.amount,
    items_text: e.items_text || null, pr_no: e.pr_no?.trim() || null,
    payment_terms: e.payment_terms?.trim() || null, pay_method: e.pay_method?.trim() || null,
    pay_due_date: e.pay_due_date || null,
  }
  const q = e.id
    ? supabase.from('invoices').update(payload).eq('id', e.id).select().single()
    : supabase.from('invoices').insert(payload).select().single()
  const { data, error } = await q
  if (error) { err.value = '儲存發票失敗：' + error.message; return null }

  // 只動這張發票相關料件的 invoice_id
  const ids = [...e.itemIds]
  const removed = candidateItems.value.filter((i) => i.invoice_id === data.id && !e.itemIds.has(i.id)).map((i) => i.id)
  const r1 = await supabase.from('items').update({ invoice_id: data.id }).in('id', ids)
  const r2 = removed.length ? await supabase.from('items').update({ invoice_id: null }).in('id', removed) : {}
  if (r1.error || r2.error) { err.value = '發票已儲存，但料件連結失敗：' + (r1.error || r2.error).message }

  if (payload.payment_terms && vendorTerms.value[e.vendor] !== payload.payment_terms) {
    await supabase.from('vendors').update({ payment_terms: payload.payment_terms }).eq('name', e.vendor)
    vendorTerms.value = { ...vendorTerms.value, [e.vendor]: payload.payment_terms }
  }
  edit.value = { ...edit.value, ...data }
  await loadInvoices()
  return data
}

async function save() {
  busy.value = true
  const inv = await saveInvoice()
  busy.value = false
  if (inv) { flash('發票已儲存'); edit.value = null }
}

// 已貼上：用 exported_at 記錄，避免漏貼或重複貼
async function setPasted(invs, pasted) {
  const ids = invs.map((v) => v.id).filter(Boolean)
  if (!ids.length) return
  const { error } = await supabase.from('invoices').update({ exported_at: pasted ? new Date().toISOString() : null }).in('id', ids)
  if (error) return alert(error.message)
  await loadInvoices()
  if (edit.value?.id && ids.includes(edit.value.id)) edit.value.exported_at = pasted ? new Date().toISOString() : null
  checked.value = new Set()
  flash(pasted ? `已標記 ${ids.length} 張為已貼上` : '已取消標記')
}

async function copy(invs) {
  await copyRows(invs)
  flash(`已複製 ${invs.length} 列，到試算表最下方空白列的 A 欄貼上`)
}

// 已登打清單勾選：一次複製多列（依發票日期排序）或一起標記
const checked = ref(new Set())
const checkedList = computed(() =>
  invoices.value.filter((v) => checked.value.has(v.id))
    .sort((a, b) => a.invoice_date.localeCompare(b.invoice_date) || a.created_at.localeCompare(b.created_at)),
)
function toggleChecked(id) {
  const s = new Set(checked.value)
  s.has(id) ? s.delete(id) : s.add(id)
  checked.value = s
}
function checkUnpasted() {
  checked.value = new Set(invoices.value.filter((v) => !v.exported_at).map((v) => v.id))
}

async function removeInvoice() {
  if (!confirm(`刪除發票「${edit.value.invoice_no}」？\n料件會回到待登打；已貼到試算表的那列請自行刪除。`)) return
  const { error } = await supabase.from('invoices').delete().eq('id', edit.value.id)
  if (error) return alert(error.message)
  edit.value = null
  await loadInvoices()
}

</script>

<template>
  <div v-if="!store.isEditor" class="card center">唯讀帳號無法使用應付帳款。</div>
  <div v-else class="detail payables">
    <div class="page-head">
      <router-link to="/" class="btn ghost small">← 總表</router-link>
      <h2>應付帳款</h2>
    </div>

    <section v-if="edit" class="card inv-editor">
      <div class="section-head">
        <h3>{{ edit.id ? '編輯發票' : '輸入發票' }}：{{ edit.vendor }}</h3>
        <button class="btn link" @click="edit = null">取消</button>
      </div>

      <div class="inv-items" :class="{ invalid: bad('items') }">
        <span class="muted">對應料件（同廠商待登打的可一起勾選）</span>
        <label v-for="i in candidateItems" :key="i.id" class="check" :class="{ on: edit.itemIds.has(i.id) }">
          <input type="checkbox" :checked="edit.itemIds.has(i.id)" @change="toggleItem(i)" />
          <span>{{ i.part_name }} <span class="muted">· {{ i.qty }} {{ i.unit }} · {{ i.quote_no || '無報價單號' }} · {{ fmtDate(i.received_date) }} 到貨</span></span>
        </label>
      </div>

      <div class="grid">
        <label :class="{ invalid: bad('invoice_date') }">發票日期 *<input v-model="edit.invoice_date" type="date" /></label>
        <label :class="{ invalid: bad('invoice_no') }">發票號碼 *<input v-model="edit.invoice_no" placeholder="FM05642853" /></label>
        <label :class="{ invalid: bad('amount') }">金額（含稅）*
          <input v-model.number="edit.amount" type="number" min="0" step="any" inputmode="decimal" :placeholder="quoteSum !== null ? `報價合計 ${fmtMoney(quoteSum)}` : ''" />
        </label>
        <label>請購單號<input v-model="edit.pr_no" placeholder="V2026100005" /></label>
        <label>報價單編號<input v-model="edit.quote_no" /></label>
        <label>交易條件<input v-model="edit.payment_terms" placeholder="Net 90days" /></label>
        <label>預計付款日<input v-model="edit.pay_due_date" type="date" @input="dueTouched = true" />
          <small class="muted">依交易條件自動計算（發票月底 + 天數），可修改</small>
        </label>
        <label>付款方式（接在付款日後）<input v-model="edit.pay_method" placeholder="匯款" /></label>
        <label class="span2">品項<textarea v-model="edit.items_text" rows="4" @input="textTouched = true" /></label>
      </div>

      <h3 class="preview-title">貼到試算表的內容</h3>
      <div class="sheet-preview">
        <table>
          <thead><tr><th v-for="c in COLUMNS" :key="c">{{ c }}</th></tr></thead>
          <tbody><tr><td v-for="(c, idx) in preview" :key="idx" class="pre">{{ c }}</td></tr></tbody>
        </table>
      </div>

      <p v-if="edit.exported_at" class="muted">已於 {{ fmtDate(edit.exported_at.slice(0, 10)) }} 標記為已貼上。</p>
      <p v-if="err" class="msg error">{{ err }}</p>
      <div class="form-actions wrap">
        <button v-if="edit.id" class="btn link danger" :disabled="busy" @click="removeInvoice">刪除發票</button>
        <span class="spacer" />
        <button v-if="edit.id" class="btn ghost" :disabled="busy" @click="setPasted([edit], !edit.exported_at)">{{ edit.exported_at ? '取消已貼上' : '✓ 標記已貼上' }}</button>
        <button class="btn ghost" :disabled="busy" @click="copy([edit])">📋 複製這列</button>
        <button class="btn primary" :disabled="busy" @click="save">{{ busy ? '儲存中…' : '儲存' }}</button>
      </div>
    </section>

    <section class="card">
      <h3>待登打（已收貨、尚未輸入發票）</h3>
      <p v-if="!groups.length" class="muted">沒有待登打的料件</p>
      <ul class="inv-list">
        <li v-for="g in groups" :key="g.key">
          <div>
            <strong>{{ g.vendor }}</strong> <span class="muted">{{ g.quote_no || '無報價單號' }}</span>
            <div class="muted small">{{ g.items.map((i) => i.part_name).join('、') }}</div>
          </div>
          <button class="btn small primary" @click="startNew(g)">輸入發票</button>
        </li>
      </ul>
    </section>

    <section class="card">
      <div class="section-head">
        <h3>已登打發票</h3>
        <button v-if="invoices.some((v) => !v.exported_at)" class="btn link" @click="checkUnpasted">勾選全部未貼上</button>
      </div>
      <div v-if="checked.size" class="batch-bar">
        <span>已勾選 {{ checked.size }} 張</span>
        <button class="btn small primary" @click="copy(checkedList)">📋 複製 {{ checked.size }} 列</button>
        <button class="btn small ghost" @click="setPasted(checkedList, true)">✓ 標記已貼上</button>
        <button class="btn link" @click="checked = new Set()">清除</button>
      </div>
      <p v-if="!invoices.length" class="muted">尚無發票</p>
      <ul class="inv-list">
        <li v-for="inv in invoices" :key="inv.id">
          <input type="checkbox" class="inv-check" :checked="checked.has(inv.id)" @change="toggleChecked(inv.id)" />
          <div class="inv-main">
            <strong>{{ inv.vendor }}</strong> <span class="muted">{{ inv.invoice_no }} · {{ fmtDate(inv.invoice_date) }}</span>
            <div class="muted small">
              NT${{ fmtMoney(inv.amount) }} · 預計付款 {{ fmtDate(inv.pay_due_date) }} ·
              <span :class="inv.exported_at ? 'ok' : 'warn'">{{ inv.exported_at ? '已貼上' : '未貼上' }}</span>
            </div>
          </div>
          <div class="head-actions">
            <button class="btn small ghost" title="複製這列" @click="copy([inv])">📋</button>
            <button class="btn small ghost" @click="startEdit(inv)">編輯</button>
          </div>
        </li>
      </ul>
    </section>

    <div v-if="toast" class="toast">{{ toast }}</div>
  </div>
</template>
