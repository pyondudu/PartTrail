<script>
import { ref } from 'vue'

// 搜尋與篩選放在模組層：點進料件再回來時保留
const q = ref('')
const status = ref('in_stock')
const vendor = ref('')
</script>

<script setup>
import Skeleton from '../components/Skeleton.vue'
import { computed, onMounted, reactive, ref as vref, watch } from 'vue'
import { supabase } from '../lib/supabase'
import { store } from '../lib/store'
import { toast } from '../lib/toast'
import { fmtDate, todayStr, firstLineText } from '../lib/util'
import { promptBox } from '../lib/dialog'

const units = vref([])
const loading = vref(true)

// 只追蹤系統設定勾了「需序號」的廠商
const trackedVendors = vref(new Set())

async function load() {
  const [{ data, error }, { data: vs, error: vErr }] = await Promise.all([
    supabase.from('serial_units').select('*'),
    supabase.from('vendors').select('name').eq('need_serials', true),
  ])
  loading.value = false
  if (error || vErr) return toast('讀取庫存失敗：' + (error || vErr).message, 'error')
  trackedVendors.value = new Set((vs ?? []).map((v) => v.name))
  units.value = data ?? []
}
onMounted(load)

const itemMap = computed(() => new Map(store.items.map((i) => [i.id, i])))

// 每個序號帶上所屬料件；排序：收貨日舊到新，同日依品名、序號
const all = computed(() =>
  units.value
    .map((u) => ({ ...u, item: itemMap.value.get(u.item_id) }))
    .filter((u) => u.item && trackedVendors.value.has(u.item.vendor))
    .sort((a, b) =>
      (a.item.received_date || '9999').localeCompare(b.item.received_date || '9999')
      || String(a.item.part_name).localeCompare(String(b.item.part_name))
      || a.serial.localeCompare(b.serial, undefined, { numeric: true })))

const vendors = computed(() => [...new Set(all.value.map((u) => u.item.vendor).filter(Boolean))].sort())
const counts = computed(() => ({
  in_stock: all.value.filter((u) => u.status === 'in_stock').length,
  issued: all.value.filter((u) => u.status === 'issued').length,
}))

// 型號：報價明細第一列（去掉「（共 N 項）」），沒有明細時用品名
function modelOf(item) {
  return firstLineText(item).replace(/（共 \d+ 項）$/, '') || String(item.part_name ?? '')
}

const kw = computed(() => q.value.trim().toLowerCase())
// 廠商篩選＋搜尋（不看狀態），給彙總表與清單共用
const matched = computed(() =>
  all.value.filter((u) => {
    if (vendor.value && u.item.vendor !== vendor.value) return false
    if (!kw.value) return true
    const hay = [u.serial, u.item.part_name, u.item.spec, ...(u.item.quote_lines ?? []).map((l) => l.name), u.item.vendor, u.item.project, u.issued_project, u.note].join(' ').toLowerCase()
    return hay.includes(kw.value)
  }))
const rows = computed(() => matched.value.filter((u) => !status.value || u.status === status.value))

// 型號數量彙總
const summary = computed(() => {
  const m = new Map()
  for (const u of matched.value) {
    const model = modelOf(u.item)
    const key = model + '\u0000' + (u.item.vendor ?? '')
    let g = m.get(key)
    if (!g) m.set(key, (g = { key, model, part: u.item.part_name, vendor: u.item.vendor, in_stock: 0, issued: 0 }))
    g[u.status === 'issued' ? 'issued' : 'in_stock']++
  }
  return [...m.values()].sort((a, b) => a.model.localeCompare(b.model, 'zh-Hant', { numeric: true }))
})
function pickModel(g) {
  q.value = q.value.trim() === g.model ? '' : g.model
}

// ── 勾選（批次領用）──
const picked = vref(new Set())
const pickable = computed(() => rows.value.filter((u) => u.status === 'in_stock'))
const allPicked = computed(() => pickable.value.length > 0 && pickable.value.every((u) => picked.value.has(u.id)))
function toggle(id) {
  const s = new Set(picked.value)
  s.has(id) ? s.delete(id) : s.add(id)
  picked.value = s
}
function toggleAll() {
  picked.value = allPicked.value ? new Set() : new Set(pickable.value.map((u) => u.id))
}

// ── 編輯視窗：領用（可多筆）或修改單筆 ──
const edit = reactive({ open: false, mode: 'issue', ids: [], serials: [], status: 'issued', issued_project: '', issued_date: '', note: '', busy: false })

function openIssue(list) {
  Object.assign(edit, {
    open: true, mode: 'issue', ids: list.map((u) => u.id), serials: list.map((u) => u.serial),
    status: 'issued', issued_project: list[0]?.item.project || '', issued_date: todayStr(),
    note: list.length === 1 ? list[0].note || '' : '', busy: false,
  })
}
function openEdit(u) {
  Object.assign(edit, {
    open: true, mode: 'edit', ids: [u.id], serials: [u.serial], status: u.status,
    issued_project: u.issued_project || '', issued_date: u.issued_date || todayStr(),
    note: u.note || '', busy: false,
  })
}

// 專案：料件與既有領用用過的專案；「＋ 新增專案…」當場輸入
const ADD_NEW = '__add__'
const extraProjects = vref([])
const projects = computed(() =>
  [...new Set([...store.items.map((i) => i.project), ...units.value.map((u) => u.issued_project), ...extraProjects.value, edit.issued_project].filter(Boolean))]
    .sort((a, b) => a.localeCompare(b, 'zh-Hant')))
watch(() => edit.issued_project, async (v, prev) => {
  if (v !== ADD_NEW) return
  edit.issued_project = prev
  const name = (await promptBox('新增專案名稱：'))?.trim()
  if (!name) return
  if (!projects.value.includes(name)) extraProjects.value.push(name)
  edit.issued_project = name
})

async function saveEdit() {
  const issued = edit.status === 'issued'
  const patch = {
    status: edit.status,
    issued_project: issued ? edit.issued_project.trim() || null : null,
    issued_date: issued ? edit.issued_date || null : null,
  }
  // 批次領用時備註空白就不覆蓋各自原本的備註
  if (edit.ids.length === 1 || edit.note.trim()) patch.note = edit.note.trim() || null
  edit.busy = true
  const { error } = await supabase.from('serial_units').update(patch).in('id', edit.ids)
  edit.busy = false
  if (error) return toast('儲存失敗：' + error.message, 'error')
  units.value = units.value.map((u) => (edit.ids.includes(u.id) ? { ...u, ...patch } : u))
  toast(issued ? `已領用 ${edit.ids.length} 個序號` : '已存為在庫')
  picked.value = new Set()
  edit.open = false
}
</script>

<template>
  <div class="inventory">
    <div class="page-head">
      <router-link to="/" class="btn ghost small back-home">← 收貨總表</router-link>
      <h2>庫存管理</h2>
      <span class="muted small">在庫 {{ counts.in_stock }} · 已領用 {{ counts.issued }}</span>
    </div>

    <section class="toolbar">
      <input v-model="q" type="search" placeholder="搜尋序號、品名、廠商、專案、備註…" class="search" />
      <select v-model="status">
        <option value="in_stock">在庫</option>
        <option value="issued">已領用</option>
        <option value="">全部</option>
      </select>
      <select v-model="vendor">
        <option value="">所有廠商</option>
        <option v-for="v in vendors" :key="v">{{ v }}</option>
      </select>
      <button v-if="store.isEditor && picked.size" class="btn primary" @click="openIssue(all.filter((u) => picked.has(u.id)))">
        領用所選（{{ picked.size }}）
      </button>
    </section>

    <div v-if="!loading && !store.loading && summary.length" class="lines-wrap sum-wrap">
      <table class="lines-table sum-table">
        <thead>
          <tr><th>型號</th><th>品名</th><th>廠商</th><th class="num">在庫</th><th class="num">已領用</th><th class="num">合計</th></tr>
        </thead>
        <tbody>
          <tr v-for="g in summary" :key="g.key" :class="{ on: q.trim() === g.model }" title="點一下只列這個型號的序號" @click="pickModel(g)">
            <td class="strong">{{ g.model }}</td>
            <td>{{ g.part }}</td>
            <td>{{ g.vendor }}</td>
            <td class="num strong">{{ g.in_stock }}</td>
            <td class="num muted">{{ g.issued }}</td>
            <td class="num">{{ g.in_stock + g.issued }}</td>
          </tr>
        </tbody>
      </table>
    </div>

    <Skeleton v-if="loading || store.loading" />
    <p v-else-if="!all.length" class="muted center empty">還沒有序號。系統設定勾選「需序號」的廠商，料件填寫序號後會自動出現在這裡。</p>
    <p v-else-if="!rows.length" class="muted center empty">沒有符合條件的序號</p>

    <div v-else class="lines-wrap">
      <table class="lines-table inv-table">
        <thead>
          <tr>
            <th v-if="store.isEditor" class="pick">
              <input type="checkbox" :checked="allPicked" :disabled="!pickable.length" title="全選在庫" @change="toggleAll" />
            </th>
            <th>序號</th><th>品名</th><th>廠商</th><th>收貨日</th><th>狀態</th><th>領用</th><th>備註</th>
            <th v-if="store.isEditor"></th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="u in rows" :key="u.id">
            <td v-if="store.isEditor" class="pick">
              <input v-if="u.status === 'in_stock'" type="checkbox" :checked="picked.has(u.id)" @change="toggle(u.id)" />
            </td>
            <td class="mono nowrap">{{ u.serial }}</td>
            <td>
              <router-link :to="{ path: '/item/' + u.item_id, query: { from: 'inventory' } }" class="item-link">{{ u.item.part_name }}</router-link>
              <div v-if="firstLineText(u.item) || u.item.spec" class="sub">{{ firstLineText(u.item) || u.item.spec }}</div>
            </td>
            <td>{{ u.item.vendor }}</td>
            <td class="nowrap">{{ fmtDate(u.item.received_date) }}</td>
            <td><span class="inv-tag" :class="u.status">{{ u.status === 'issued' ? '已領用' : '在庫' }}</span></td>
            <td>
              <template v-if="u.status === 'issued'">
                {{ u.issued_project || '—' }}
                <div class="sub">{{ fmtDate(u.issued_date) }}</div>
              </template>
              <span v-else class="muted">—</span>
            </td>
            <td class="pre note">{{ u.note || '' }}</td>
            <td v-if="store.isEditor" class="nowrap">
              <button v-if="u.status === 'in_stock'" class="btn small" @click="openIssue([u])">領用</button>
              <button class="btn ghost small" @click="openEdit(u)">編輯</button>
            </td>
          </tr>
        </tbody>
      </table>
    </div>

    <Transition name="dialog">
      <div v-if="edit.open" class="dialog-backdrop" @click.self="edit.open = false" @keydown.esc="edit.open = false">
        <form class="dialog inv-dialog" role="dialog" aria-modal="true" @submit.prevent="saveEdit">
          <h3>{{ edit.mode === 'edit' ? '編輯序號 ' + edit.serials[0] : edit.ids.length > 1 ? `領用 ${edit.ids.length} 個序號` : '領用 ' + edit.serials[0] }}</h3>
          <p v-if="edit.ids.length > 1" class="muted small serial-list">{{ edit.serials.join('、') }}</p>
          <label v-if="edit.mode === 'edit'">狀態
            <select v-model="edit.status">
              <option value="in_stock">在庫</option>
              <option value="issued">已領用</option>
            </select>
          </label>
          <template v-if="edit.status === 'issued'">
            <label>專案
              <select v-model="edit.issued_project">
                <option value="">（不指定）</option>
                <option v-for="p in projects" :key="p" :value="p">{{ p }}</option>
                <option :value="ADD_NEW">＋ 新增專案…</option>
              </select>
            </label>
            <label>領用日
              <input v-model="edit.issued_date" type="date" />
            </label>
          </template>
          <label>備註
            <textarea v-model="edit.note" rows="2" :placeholder="edit.ids.length > 1 ? '空白則不更動各序號原本的備註' : ''" />
          </label>
          <div class="dialog-actions">
            <button type="button" class="btn ghost" @click="edit.open = false">取消</button>
            <button type="submit" class="btn primary" :disabled="edit.busy">{{ edit.busy ? '儲存中…' : '儲存' }}</button>
          </div>
        </form>
      </div>
    </Transition>
  </div>
</template>

<style scoped>
.page-head { justify-content: flex-start; margin-bottom: 12px; }
.inv-table { min-width: 820px; background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius); }
.inv-table .pick { width: 32px; }
.inv-table .pick input { width: auto; }
.inv-table .mono { font-family: ui-monospace, "Cascadia Mono", Consolas, monospace; }
.inv-table .note { max-width: 220px; color: var(--muted); }
.inv-table .btn + .btn { margin-left: 4px; }
.item-link { color: var(--accent); }
.item-link:hover { text-decoration: underline; }
.inv-tag { font-size: 0.75rem; padding: 2px 8px; border-radius: 999px; white-space: nowrap; }
.inv-tag.in_stock { background: var(--done-bg); color: var(--done); }
.inv-tag.issued { background: var(--quoted-bg); color: var(--quoted); }
.inv-dialog { display: flex; flex-direction: column; gap: 12px; }
.inv-dialog h3 { margin: 0; }
.serial-list { margin: -6px 0 0; max-height: 80px; overflow-y: auto; }
.small { font-size: 0.85rem; }
.sum-wrap { margin-bottom: 16px; }
.sum-table { background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius); }
.sum-table tbody tr { cursor: pointer; }
.sum-table tbody tr:hover { background: var(--bg); }
.sum-table tbody tr.on { background: color-mix(in srgb, var(--accent) 12%, transparent); }
.sum-table .num { text-align: right; width: 72px; font-variant-numeric: tabular-nums; }
.sum-table .strong { font-weight: 600; }
</style>
