<script setup>
import { computed, ref } from 'vue'
import { store } from '../lib/store'
import { fmtDate, fmtMoney, lineAmount } from '../lib/util'
import QuoteLines from '../components/QuoteLines.vue'

const q = ref('')
const vendor = ref('')
const mode = ref('line') // line 單項 | sheet 整張

const vendors = computed(() => [...new Set(store.items.map((i) => i.vendor).filter(Boolean))].sort())

// 依報價日由舊到新（同日依建立時間）
const items = computed(() =>
  [...store.items].sort((a, b) =>
    (a.quote_date || '9999').localeCompare(b.quote_date || '9999') || a.created_at.localeCompare(b.created_at)))

// 每列明細攤平成一列；沒有明細的舊料件以品名＋報價金額（含稅）帶入一列
const rows = computed(() =>
  items.value.flatMap((i) => {
    const lines = i.quote_lines?.length
      ? i.quote_lines.map((l) => ({ name: l.name, qty: l.qty, unit: l.unit, price: l.price, amount: lineAmount(l), legacy: false }))
      : [{ name: i.part_name, qty: i.qty, unit: i.unit, price: null, amount: i.quote_amount, legacy: true }]
    return lines.map((l, n) => ({ ...l, key: `${i.id}-${n}`, item: i }))
  }))

const filtered = computed(() => {
  const kw = q.value.trim().toLowerCase()
  return rows.value.filter((r) => {
    if (vendor.value && r.item.vendor !== vendor.value) return false
    if (kw) {
      const hay = [r.name, r.item.part_name, r.item.vendor, r.item.quote_no, r.item.project].join(' ').toLowerCase()
      if (!hay.includes(kw)) return false
    }
    return true
  })
})

// 整張：有任一列符合就列出整張報價單
const sheets = computed(() => {
  const ids = new Set(filtered.value.map((r) => r.item.id))
  return items.value.filter((i) => ids.has(i.id))
})
</script>

<template>
  <div class="quotes">
    <div class="page-head">
      <router-link to="/" class="btn ghost small">← 總表</router-link>
      <h2>報價查詢</h2>
    </div>

    <section class="toolbar">
      <input v-model="q" type="search" placeholder="搜尋品名規格、廠商、報價單號、專案…" class="search" />
      <select v-model="vendor">
        <option value="">所有廠商</option>
        <option v-for="v in vendors" :key="v">{{ v }}</option>
      </select>
      <div class="seg">
        <button type="button" :class="{ on: mode === 'line' }" @click="mode = 'line'">單項</button>
        <button type="button" :class="{ on: mode === 'sheet' }" @click="mode = 'sheet'">整張</button>
      </div>
    </section>

    <p v-if="store.loading" class="muted center">載入中…</p>
    <p v-else-if="!filtered.length" class="muted center empty">沒有符合條件的報價</p>

    <div v-else-if="mode === 'line'" class="lines-wrap">
      <table class="lines-table clickable">
        <thead>
          <tr>
            <th>報價日</th><th>廠商</th><th>報價單號</th><th>品名規格</th>
            <th class="num">數量</th><th class="num">單價</th><th class="num">金額</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="r in filtered" :key="r.key" @click="$router.push('/item/' + r.item.id)">
            <td class="nowrap">{{ fmtDate(r.item.quote_date) }}</td>
            <td>{{ r.item.vendor }}</td>
            <td>{{ r.item.quote_no || '—' }}</td>
            <td class="pre">{{ r.name || '—' }}</td>
            <td class="num nowrap">{{ r.qty ?? '—' }} {{ r.unit || '' }}</td>
            <td class="num">{{ fmtMoney(r.price) }}</td>
            <td class="num nowrap">{{ fmtMoney(r.amount) }}<div v-if="r.legacy && r.amount != null" class="sub">含稅總額</div></td>
          </tr>
        </tbody>
      </table>
    </div>

    <template v-else>
      <section v-for="i in sheets" :key="i.id" class="card sheet">
        <div class="section-head">
          <div>
            <strong>{{ i.vendor }}</strong>
            <span class="muted"> · {{ i.quote_no || '無報價單號' }} · {{ fmtDate(i.quote_date) }}</span>
            <div class="muted small">{{ i.project || '—' }} · {{ i.part_name }}</div>
          </div>
          <router-link :to="'/item/' + i.id" class="btn ghost small">料件</router-link>
        </div>
        <QuoteLines v-if="i.quote_lines?.length" :lines="i.quote_lines" />
        <p v-else class="muted">
          無明細 · {{ i.qty ?? '—' }} {{ i.unit || '' }} · 報價金額（含稅）{{ fmtMoney(i.quote_amount) }}
        </p>
      </section>
    </template>
  </div>
</template>
