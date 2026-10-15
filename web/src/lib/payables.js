// 應付帳款：依發票資料產生「應付帳款明細表 for 廠商」的一列，寫入 Google 試算表或複製貼上
// 欄位：日期｜廠商｜報價單編號｜品項｜金額(含稅價)｜付款方式｜交易條件｜發票日期與編號｜預計付款日｜備註

function ymd(s) {
  const [y, m, d] = s.split('-').map(Number)
  return { y, m, d }
}
const pad = (n) => String(n).padStart(2, '0')

// 品項欄：每筆料件一行「品名 *數量單位」
export function itemsText(items) {
  return items
    .map((i) => (i.qty ? `${i.part_name} *${Number(i.qty)}${i.unit || ''}` : i.part_name))
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

// 同時放 HTML 表格（多行品項貼上後留在同一格）與純文字
export async function copyRow(inv) {
  const row = buildRow(inv)
  const html = '<table><tr>' + row.map((c) => `<td>${esc(c).replace(/\n/g, '<br>')}</td>`).join('') + '</tr></table>'
  const tsv = row.map((c) => (/[\t\n"]/.test(c) ? `"${c.replace(/"/g, '""')}"` : c)).join('\t')
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
}

// Google Apps Script 連線設定：只存在這台裝置的瀏覽器，不放進公開的程式碼
const SHEET_KEY = 'parttrail.sheet'
export function loadSheetConfig() {
  try { return JSON.parse(localStorage.getItem(SHEET_KEY)) || { url: '', token: '' } } catch { return { url: '', token: '' } }
}
export function saveSheetConfig(cfg) {
  try { localStorage.setItem(SHEET_KEY, JSON.stringify({ url: cfg.url.trim(), token: cfg.token.trim() })) } catch {}
}

async function postSheet(body) {
  const { url, token } = loadSheetConfig()
  if (!url || !token) throw new Error('尚未設定 Google 試算表連線')
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain;charset=utf-8' }, // 避免 CORS preflight
    body: JSON.stringify({ token, ...body }),
  })
  let data
  try { data = await res.json() } catch { throw new Error('試算表回應無法解讀（請確認網址與部署權限）') }
  if (!data.ok) throw new Error(data.error || '寫入失敗')
  return data
}

// 只檢查密鑰與標題列，不寫入
export const testSheet = () => postSheet({ action: 'ping' })

// 試算表端只會附加在最後一列之後；回傳 { row, warning? }
export function appendToSheet(inv) {
  return postSheet({
    invoice_date: inv.invoice_date, // 日期欄以真正的日期寫入（顯示為 M/D）
    invoice_no: inv.invoice_no,
    amount: Number(inv.amount),
    row: buildRow(inv),
  })
}
