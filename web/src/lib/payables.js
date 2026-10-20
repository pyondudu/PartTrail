// 應付帳款：依發票資料產生「應付帳款明細表 for 廠商」的一列，寫入 Google 試算表或複製貼上
// 欄位：日期｜廠商｜報價單編號｜品項｜金額(含稅價)｜付款方式｜交易條件｜發票日期與編號｜預計付款日｜備註

function ymd(s) {
  const [y, m, d] = s.split('-').map(Number)
  return { y, m, d }
}
const pad = (n) => String(n).padStart(2, '0')

// 品項欄：每筆料件一行「品名 *數量單位」；有報價明細時改為明細逐列
// 品名規格內的換行改成空白，避免一個品項在試算表裡被拆成兩行
function lineText(name, qty, unit) {
  const n = String(name ?? '').replace(/\s*\n\s*/g, ' ').trim()
  return qty ? `${n} *${Number(qty)}${unit || ''}` : n
}
export function itemsText(items) {
  return items
    .flatMap((i) => (i.quote_lines?.length
      ? i.quote_lines.map((l) => lineText(String(l.name ?? '').trim() || i.part_name, l.qty, l.unit))
      : [lineText(i.part_name, i.qty, i.unit)]))
    .join('\n')
}

// 交易條件「Net 90days」→ 發票月底起算 90 天（例：10/14 → 10/31 + 90 = 隔年 1/29）
export function payDueDate(invoiceDate, terms) {
  const n = Number(String(terms || '').match(/\d+/)?.[0])
  if (!invoiceDate || !n) return ''
  const { y, m } = ymd(invoiceDate)
  const d = new Date(y, m, 0) // 發票當月最後一天
  d.setDate(d.getDate() + n)
  return [d.getFullYear(), pad(d.getMonth() + 1), pad(d.getDate())].join('-')
}

// 與試算表現有格式相同的 10 欄文字
export function buildRow(inv) {
  const date = inv.invoice_date ? ymd(inv.invoice_date) : null
  const due = inv.pay_due_date ? ymd(inv.pay_due_date) : null
  return [
    date ? `${date.m}/${date.d}` : '',
    inv.vendor || '',
    inv.quote_no || '',
    inv.items_text || '',
    inv.amount === null || inv.amount === '' || inv.amount === undefined ? '' : `NT$${Number(inv.amount).toLocaleString('en-US')}`,
    '',
    inv.payment_terms || '',
    date ? `${date.y}.${pad(date.m)}.${pad(date.d)} & ${inv.invoice_no || ''}` : '',
    due ? `${due.y}/${due.m}/${due.d}${inv.pay_method || ''}` : '',
    inv.pr_no ? `請購單號:${inv.pr_no}` : '',
  ]
}

export const COLUMNS = ['日期', '廠商', '報價單編號', '品項', '金額(含稅價)', '付款方式', '交易條件', '發票日期與編號', '預計付款日', '備註']

const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

// 複製一或多列：同時放 HTML 表格（多行品項貼上後留在同一格）與純文字；貼在試算表最下方空白列的 A 欄
export async function copyRows(invs) {
  const rows = invs.map(buildRow)
  const html = '<table>' + rows.map((r) => '<tr>' + r.map((c) => `<td>${esc(c).replace(/\n/g, '<br>')}</td>`).join('') + '</tr>').join('') + '</table>'
  const tsv = rows.map((r) => r.map((c) => (/[\t\n"]/.test(c) ? `"${c.replace(/"/g, '""')}"` : c)).join('\t')).join('\n')
  try {
    if (window.ClipboardItem && navigator.clipboard?.write) {
      await navigator.clipboard.write([
        new ClipboardItem({
          'text/html': new Blob([html], { type: 'text/html' }),
          'text/plain': new Blob([tsv], { type: 'text/plain' }),
        }),
      ])
    } else {
      await navigator.clipboard.writeText(tsv)
    }
  } catch {
    window.prompt('請手動複製：', tsv)
  }
}
