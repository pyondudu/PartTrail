<script setup>
import { computed } from 'vue'
import { fmtMoney, lineAmount, quoteTotals } from '../lib/util'

// 報價明細表：品名規格｜數量 單位｜單價（未稅）｜金額，底部合計／稅金／總計
const props = defineProps({ lines: { type: Array, required: true } })
const totals = computed(() => quoteTotals(props.lines))
</script>

<template>
  <div class="lines-wrap">
    <table class="lines-table">
      <thead>
        <tr><th>品名規格</th><th class="num">數量</th><th class="num">單價</th><th class="num">金額</th></tr>
      </thead>
      <tbody>
        <tr v-for="(l, i) in lines" :key="i">
          <td class="pre">{{ l.name || '—' }}</td>
          <td class="num nowrap">{{ l.qty ?? '—' }} {{ l.unit || '' }}</td>
          <td class="num">{{ fmtMoney(l.price) }}</td>
          <td class="num">{{ fmtMoney(lineAmount(l)) }}</td>
        </tr>
      </tbody>
      <tfoot>
        <tr><td>數量合計</td><td class="num">{{ totals.qty }}</td><td class="num">合計</td><td class="num">{{ fmtMoney(totals.subtotal) }}</td></tr>
        <tr><td /><td /><td class="num">稅金 5%</td><td class="num">{{ fmtMoney(totals.tax) }}</td></tr>
        <tr class="total"><td /><td /><td class="num">總計</td><td class="num">{{ fmtMoney(totals.total) }}</td></tr>
      </tfoot>
    </table>
  </div>
</template>
