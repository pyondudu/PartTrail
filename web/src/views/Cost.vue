<script>
import { ref } from 'vue'

// 選定的公司報價單號放在模組層：點進料件再回來時保留
const selected = ref('')
</script>

<script setup>
import { computed } from 'vue'
import { store } from '../lib/store'
import { STATUS, fmtDate, fmtMoney, untaxedCost } from '../lib/util'

// 成本分析：選一個公司報價單號（給客戶的報價單號，回簽即訂單），列出下單的料件與未稅成本合計

// 單號清單：依該單號最早建立的料件由舊到新；選項附上專案
const options = computed(() => {
  const m = new Map()
  for (const i of store.items) {
    const no = i.our_quote_no?.trim()
    if (!no) continue
    const o = m.get(no) ?? { no, first: i.created_at, projects: new Set() }
    if (i.created_at < o.first) o.first = i.created_at
    if (i.project) o.projects.add(i.project)
    m.set(no, o)
  }
  return [...m.values()]
    .sort((a, b) => a.first.localeCompare(b.first))
    .map((o) => ({ no: o.no, label: o.projects.size ? `${o.no}（${[...o.projects].join('、')}）` : o.no }))
})

// 依下單日由舊到新（沒有下單日的依建立時間排在後面）
const byOrderDate = (a, b) =>
  (a.order_date || '9999').localeCompare(b.order_date || '9999') || a.created_at.localeCompare(b.created_at)

function summarize(items) {
  const rows = [...items].sort(byOrderDate).map((item) => ({ item, ...untaxedCost(item) }))
  const priced = rows.filter((r) => r.amount !== null)
  return {
    rows,
    total: Math.round(priced.reduce((s, r) => s + r.amount, 0) * 100) / 100,
    priced: priced.length,
    missing: rows.length - priced.length,
    estimated: rows.some((r) => r.estimated),
  }
}

const picked = computed(() => store.items.filter((i) => selected.value && i.our_quote_no?.trim() === selected.value))
const ordered = computed(() => summarize(picked.value.filter((i) => i.status !== 'quoted')))
const quoted = computed(() => summarize(picked.value.filter((i) => i.status === 'quoted')))
</script>

<template>
  <div v-if="!store.isEditor" class="card center">唯讀帳號無法使用成本分析。</div>
  <div v-else class="cost">
    <div class="page-head">
      <router-link to="/" class="btn ghost small">← 收貨總表</router-link>
      <h2>成本分析</h2>
    </div>

    <p v-if="store.loading" class="muted center">載入中…</p>
    <p v-else-if="!options.length" class="muted center empty">還沒有料件填公司報價單號。請在料件的「公司報價單號」欄填入給客戶的報價單號。</p>

    <template v-else>
      <section class="toolbar">
        <select v-model="selected" aria-label="公司報價單號">
          <option value="">請選擇公司報價單號</option>
          <option v-for="o in options" :key="o.no" :value="o.no">{{ o.label }}</option>
        </select>
      </section>

      <p v-if="!selected" class="muted center empty">選擇公司報價單號後，會列出下單的料件與未稅成本合計。</p>

      <template v-else>
        <template v-for="sec in [
          { key: 'ordered', title: '已下單／已收貨', data: ordered, totalLabel: '合計' },
          { key: 'quoted', title: '尚未下單（已報價，不計入合計）', data: quoted, totalLabel: '小計' },
        ]" :key="sec.key">
          <section v-if="sec.key === 'ordered' || sec.data.rows.length" class="card">
            <h3>{{ sec.title }}</h3>
            <p v-if="!sec.data.rows.length" class="muted">這個單號還沒有下單的料件。</p>
            <div v-else class="lines-wrap">
              <table class="lines-table clickable">
                <thead>
                  <tr>
                    <th>狀態</th><th>下單日</th><th>專案</th><th>廠商</th><th>品名</th>
                    <th class="num">數量</th><th class="num">金額（未稅）</th>
                  </tr>
                </thead>
                <tbody>
                  <tr v-for="r in sec.data.rows" :key="r.item.id" @click="$router.push({ path: '/item/' + r.item.id, query: { from: 'cost' } })">
                    <td><span class="pill" :class="r.item.status">{{ STATUS[r.item.status].label }}</span></td>
                    <td class="nowrap">{{ fmtDate(r.item.order_date) }}</td>
                    <td>{{ r.item.project || '—' }}</td>
                    <td>{{ r.item.vendor }}</td>
                    <td>{{ r.item.part_name || '—' }}<span v-if="r.item.quote_lines?.length" class="muted"> · {{ r.item.quote_lines.length }} 項</span></td>
                    <td class="num nowrap">{{ r.item.qty ?? '—' }} <span class="muted">{{ r.item.unit }}</span></td>
                    <td class="num nowrap">{{ fmtMoney(r.amount) }}<span v-if="r.estimated" class="muted">*</span></td>
                  </tr>
                </tbody>
                <tfoot>
                  <tr class="total">
                    <td colspan="6">{{ sec.totalLabel }}（未稅，{{ sec.data.priced }} 筆）</td>
                    <td class="num nowrap"><strong>{{ fmtMoney(sec.data.total) }}</strong></td>
                  </tr>
                </tfoot>
              </table>
            </div>
            <p v-if="sec.data.missing" class="msg error note">另有 {{ sec.data.missing }} 筆沒有金額，未計入。</p>
            <p v-if="sec.data.estimated" class="muted note">* 無報價明細，由含稅金額 ÷ 1.05 換算。</p>
          </section>
        </template>
      </template>
    </template>
  </div>
</template>

<style scoped>
.cost .page-head h2 { flex: 1; }
.cost .card + .card { margin-top: 12px; }
.cost h3 { margin: 0 0 8px; }
.note { font-size: 0.8rem; margin: 8px 0 0; }
</style>
