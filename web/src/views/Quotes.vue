<script>
import { ref } from 'vue'

// 搜尋與篩選放在模組層：點進料件再回來時保留
const q = ref('')
const vendor = ref('')
const project = ref('')
</script>

<script setup>
import { computed } from 'vue'
import { store } from '../lib/store'
import { fmtDate, fmtMoney } from '../lib/util'

const vendors = computed(() => [...new Set(store.items.map((i) => i.vendor).filter(Boolean))].sort())
const projects = computed(() => [...new Set(store.items.map((i) => i.project).filter(Boolean))].sort())

// 依報價日由舊到新（同日依建立時間）
const items = computed(() =>
  [...store.items].sort((a, b) =>
    (a.quote_date || '9999').localeCompare(b.quote_date || '9999') || a.created_at.localeCompare(b.created_at)))

const kw = computed(() => q.value.trim().toLowerCase())

// 一張報價單（一筆料件）一列；搜尋含明細品名，命中的明細另外列出
const rows = computed(() =>
  items.value.flatMap((i) => {
    if (vendor.value && i.vendor !== vendor.value) return []
    if (project.value && i.project !== project.value) return []
    const lines = i.quote_lines ?? []
    const hits = kw.value ? lines.filter((l) => String(l.name ?? '').toLowerCase().includes(kw.value)) : []
    if (kw.value) {
      const hay = [i.part_name, i.spec, i.vendor, i.quote_no, i.project].join(' ').toLowerCase()
      if (!hits.length && !hay.includes(kw.value)) return []
    }
    return [{ item: i, count: lines.length, hits }]
  }))
</script>

<template>
  <div class="quotes">
    <div class="page-head">
      <router-link to="/" class="btn ghost small">← 收貨總表</router-link>
      <h2>報價查詢</h2>
    </div>

    <section class="toolbar">
      <input v-model="q" type="search" placeholder="搜尋品名規格、廠商、報價單號、專案…" class="search" />
      <select v-model="vendor">
        <option value="">所有廠商</option>
        <option v-for="v in vendors" :key="v">{{ v }}</option>
      </select>
      <select v-model="project">
        <option value="">所有專案</option>
        <option v-for="p in projects" :key="p">{{ p }}</option>
      </select>
    </section>

    <p v-if="store.loading" class="muted center">載入中…</p>
    <p v-else-if="!rows.length" class="muted center empty">沒有符合條件的報價</p>

    <div v-else class="lines-wrap">
      <table class="lines-table clickable">
        <thead>
          <tr>
            <th>報價日</th><th>廠商</th><th>專案</th><th>報價單號</th><th>品名</th>
            <th class="num">金額（含稅）</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="r in rows" :key="r.item.id" @click="$router.push({ path: '/item/' + r.item.id, query: { from: 'quotes' } })">
            <td class="nowrap">{{ fmtDate(r.item.quote_date) }}</td>
            <td>{{ r.item.vendor }}</td>
            <td>{{ r.item.project || '—' }}</td>
            <td>{{ r.item.quote_no || '—' }}</td>
            <td>
              {{ r.item.part_name || '—' }}<span v-if="r.count" class="muted"> · {{ r.count }} 項</span>
              <div v-for="(l, n) in r.hits" :key="n" class="sub pre">・{{ l.name }} {{ l.qty ?? '' }} {{ l.unit || '' }}</div>
            </td>
            <td class="num nowrap">{{ fmtMoney(r.item.quote_amount) }}</td>
          </tr>
        </tbody>
      </table>
    </div>
  </div>
</template>
