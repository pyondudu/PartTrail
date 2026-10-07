export const STATUS = {
  quoted: { label: '已報價', hint: '等待確認下單' },
  ordered: { label: '已下單', hint: '已用印回傳、交期已確認' },
  received: { label: '已收貨', hint: '已到貨' },
}
export const STATUS_KEYS = Object.keys(STATUS)

export const SOON_DAYS = 3

function parseDate(s) {
  const [y, m, d] = s.split('-').map(Number)
  return new Date(y, m - 1, d)
}

export function todayStr(offset = 0) {
  const d = new Date()
  d.setDate(d.getDate() + offset)
  return [d.getFullYear(), String(d.getMonth() + 1).padStart(2, '0'), String(d.getDate()).padStart(2, '0')].join('-')
}

export function daysLeft(due) {
  if (!due) return null
  return Math.round((parseDate(due) - parseDate(todayStr())) / 86400000)
}

// 緊急程度：overdue / soon / normal / done / none
export function urgency(item) {
  if (item.status === 'received') return 'done'
  if (item.status !== 'ordered' || !item.due_date) return 'none'
  const d = daysLeft(item.due_date)
  if (d < 0) return 'overdue'
  if (d <= SOON_DAYS) return 'soon'
  return 'normal'
}

export function daysText(item) {
  if (item.status === 'received') return item.received_date ? `${fmtDate(item.received_date)} 到貨` : '已收貨'
  const d = daysLeft(item.due_date)
  if (d === null) return '未定交期'
  if (d < 0) return `逾期 ${-d} 天`
  if (d === 0) return '今天到貨'
  return `剩 ${d} 天`
}

const WEEK = '日一二三四五六'
export function fmtDate(s) {
  if (!s) return '—'
  const d = parseDate(s)
  return `${d.getMonth() + 1}/${d.getDate()}（${WEEK[d.getDay()]}）`
}

export function fmtDateTime(s) {
  if (!s) return '—'
  const d = new Date(s)
  return d.toLocaleString('zh-TW', { hour12: false, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })
}

export function fmtMoney(n) {
  if (n === null || n === undefined || n === '') return '—'
  return Number(n).toLocaleString('zh-TW')
}

// 給被追問時貼到 LINE / Teams 的進度文字
export function progressText(item) {
  const lines = [
    `【${item.part_name}】`,
    `廠商：${item.vendor}`,
    item.qty ? `數量：${item.qty} ${item.unit || ''}` : null,
    `狀態：${STATUS[item.status].label}`,
  ]
  if (item.status === 'ordered') lines.push(`預計交期：${fmtDate(item.due_date)}（${daysText(item)}）`)
  if (item.status === 'received') {
    lines.push(`到貨日：${fmtDate(item.received_date)}`)
  }
  return lines.filter(Boolean).join('\n')
}
export const ICON = import.meta.env.BASE_URL + 'icon.svg'
