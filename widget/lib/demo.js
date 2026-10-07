// PARTTRAIL_DEMO=1 時使用的假資料（不需 Supabase 即可預覽精靈）
function demoItems(dayStr) {
  return [
    { id: 'd1', part_name: '鋁合金固定座', vendor: '精密五金', requester: '王經理', qty: 20, unit: 'pcs', due_date: dayStr(-2) },
    { id: 'd2', part_name: '壓克力外殼', vendor: '大成塑膠', requester: '陳工程師', qty: 5, unit: '組', due_date: dayStr(0) },
    { id: 'd3', part_name: '不鏽鋼軸心 Ø12', vendor: '精密五金', requester: '林課長', qty: 50, unit: 'pcs', due_date: dayStr(2) },
  ]
}
module.exports = { demoItems }
