<script setup>
import { computed, ref, watch } from 'vue'
import { store } from '../lib/store'
import { STATUS, STATUS_KEYS, urgency, daysText, fmtDate, todayStr } from '../lib/util'

const FILTER_KEY = 'parttrail.filters'
function loadFilters() {
  try { return JSON.parse(localStorage.getItem(FILTER_KEY)) || {} } catch { return {} }
}
const saved = loadFilters()
const q = ref('')
const status = ref(saved.status ?? 'active') // active | all | quoted | ordered | received
const project = ref(saved.project ?? '')
const vendor = ref(saved.vendor ?? '')
const requester = ref(saved.requester ?? '')
const quick = ref('') // overdue | soon | ''

watch([status, project, vendor, requester], () => {
  try {
    localStorage.setItem(FILTER_KEY, JSON.stringify({ status: status.value, project: project.value, vendor: vendor.value, requester: requester.value }))
  } catch {}
})

const projects = computed(() => [...new Set(store.items.map((i) => i.project).filter(Boolean))].sort())
const vendors = computed(() => [...new Set(store.items.map((i) => i.vendor).filter(Boolean))].sort())
const requesters = computed(() => [...new Set(store.items.map((i) => i.requester).filter(Boolean))].sort())

const stats = computed(() => {
  const month = todayStr().slice(0, 7)
  const s = { overdue: 0, soon: 0, active: 0, receivedMonth: 0 }
  for (const i of store.items) {
    const u = urgency(i)
    if (u === 'overdue') s.overdue++
    if (u === 'soon') s.soon++
    if (i.status !== 'received') s.active++
    if (i.status === 'received' && i.received_date?.startsWith(month)) s.receivedMonth++
  }
  return s
})

const URG_ORDER = { overdue: 0, soon: 1, normal: 2, none: 3, done: 4 }

const list = computed(() => {
  const kw = q.value.trim().toLowerCase()
  return store.items
    .filter((i) => {
      if (status.value === 'active' && i.status === 'received') return false
      if (STATUS_KEYS.includes(status.value) && i.status !== status.value) return false
      if (project.value && i.project !== project.value) return false
      if (vendor.value && i.vendor !== vendor.value) return false
      if (requester.value && i.requester !== requester.value) return false
      if (quick.value && urgency(i) !== quick.value) return false
      if (kw) {
        const hay = [i.part_name, i.spec, i.vendor, i.requester, i.quote_no, i.note].join(' ').toLowerCase()
        if (!hay.includes(kw)) return false
      }
      return true
    })
    .sort((a, b) => {
      const ua = URG_ORDER[urgency(a)], ub = URG_ORDER[urgency(b)]
      if (ua !== ub) return ua - ub
      if (a.status === 'received') return (b.received_date || '').localeCompare(a.received_date || '')
      return (a.due_date || '9999').localeCompare(b.due_date || '9999') || b.created_at.localeCompare(a.created_at)
    })
})

function toggleQuick(k) {
  quick.value = quick.value === k ? '' : k
  if (quick.value) status.value = 'active'
}
</script>

<template>
  <section class="stats">
    <button class="stat overdue" :class="{ on: quick === 'overdue' }" @click="toggleQuick('overdue')">
      <span class="num">{{ stats.overdue }}</span><span class="lbl">已逾期</span>
    </button>
    <button class="stat soon" :class="{ on: quick === 'soon' }" @click="toggleQuick('soon')">
      <span class="num">{{ stats.soon }}</span><span class="lbl">3 日內到貨</span>
    </button>
    <button class="stat" @click="quick = ''; status = 'active'">
      <span class="num">{{ stats.active }}</span><span class="lbl">進行中</span>
    </button>
    <button class="stat" @click="quick = ''; status = 'received'">
      <span class="num">{{ stats.receivedMonth }}</span><span class="lbl">本月已收貨</span>
    </button>
  </section>

  <section class="toolbar">
    <input v-model="q" type="search" placeholder="搜尋品名、廠商、需求人、報價單號…" class="search" />
    <select v-model="status">
      <option value="active">進行中</option>
      <option value="all">全部</option>
      <option v-for="k in STATUS_KEYS" :key="k" :value="k">{{ STATUS[k].label }}</option>
    </select>
    <select v-model="project">
      <option value="">所有專案</option>
      <option v-for="p in projects" :key="p">{{ p }}</option>
    </select>
    <select v-model="vendor">
      <option value="">所有廠商</option>
      <option v-for="v in vendors" :key="v">{{ v }}</option>
    </select>
    <select v-model="requester">
      <option value="">所有需求人</option>
      <option v-for="r in requesters" :key="r">{{ r }}</option>
    </select>
    <router-link v-if="store.isEditor" to="/item/new" class="btn primary">＋ 新增料件</router-link>
  </section>

  <p v-if="quick" class="filter-note">
    只顯示「{{ quick === 'overdue' ? '已逾期' : '3 日內到貨' }}」<button class="btn link" @click="quick = ''">清除</button>
  </p>

  <p v-if="store.loading" class="muted center">載入中…</p>
  <p v-else-if="!list.length" class="muted center empty">沒有符合條件的料件</p>

  <!-- 電腦：表格 -->
  <table v-if="list.length" class="items-table">
    <thead>
      <tr>
        <th>交期</th><th>狀態</th><th>專案</th><th>品名</th><th>廠商</th><th>需求人</th><th class="num">數量</th>
      </tr>
    </thead>
    <tbody>
      <tr v-for="i in list" :key="i.id" :class="'u-' + urgency(i)" @click="$router.push('/item/' + i.id)">
        <td>
          <div class="due">{{ fmtDate(i.due_date) }}</div>
          <div class="days">{{ daysText(i) }}</div>
        </td>
        <td><span class="pill" :class="i.status">{{ STATUS[i.status].label }}</span></td>
        <td>{{ i.project || '—' }}</td>
        <td>
          <div class="name">{{ i.part_name }}</div>
          <div v-if="i.spec" class="sub">{{ i.spec }}</div>
        </td>
        <td>{{ i.vendor }}</td>
        <td>{{ i.requester || '—' }}</td>
        <td class="num">{{ i.qty ?? '—' }} <span class="sub">{{ i.unit }}</span></td>
      </tr>
    </tbody>
  </table>

  <!-- 手機：卡片 -->
  <div v-if="list.length" class="items-cards">
    <router-link v-for="i in list" :key="i.id" :to="'/item/' + i.id" class="item-card" :class="'u-' + urgency(i)">
      <div class="row1">
        <span class="name">{{ i.part_name }}</span>
        <span class="pill" :class="i.status">{{ STATUS[i.status].label }}</span>
      </div>
      <div class="row2">
        <span v-if="i.project">{{ i.project }} · </span>
        <span>{{ i.vendor }}</span>
        <span v-if="i.requester"> · {{ i.requester }}</span>
        <span v-if="i.qty"> · {{ i.qty }} {{ i.unit }}</span>
      </div>
      <div class="row3">
        <span class="due">交期 {{ fmtDate(i.due_date) }}</span>
        <span class="days">{{ daysText(i) }}</span>
      </div>
    </router-link>
  </div>
</template>
