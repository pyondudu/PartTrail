const $ = (s) => document.querySelector(s)
const sprite = $('#sprite')
const bubble = $('#bubble')
const panel = $('#panel')
const list = $('#list')

let state = { status: 'loading', items: [] }
let expanded = false
let happyTimer = null

// ─── 透明區域滑鼠穿透：只有 .hit 元素可點 ───
let dragging = false
document.addEventListener('mouseover', (e) => {
  if (e.target.closest('.hit')) window.pt.setIgnoreMouse(false)
})
document.addEventListener('mouseout', (e) => {
  if (dragging) return
  if (!e.relatedTarget || !e.relatedTarget.closest?.('.hit')) window.pt.setIgnoreMouse(true)
})

// ─── 拖曳精靈；移動不到 4px 視為點擊 ───
let start = null
sprite.addEventListener('pointerdown', (e) => {
  if (e.button !== 0) return
  start = { x: e.screenX, y: e.screenY, moved: false }
  sprite.setPointerCapture(e.pointerId)
  window.pt.dragStart()
})
sprite.addEventListener('pointermove', (e) => {
  if (!start) return
  const dx = e.screenX - start.x
  const dy = e.screenY - start.y
  if (!start.moved && Math.hypot(dx, dy) < 4) return
  start.moved = true
  dragging = true
  sprite.classList.add('dragging')
  window.pt.dragMove(dx, dy)
})
sprite.addEventListener('pointerup', () => {
  if (!start) return
  const wasClick = !start.moved
  start = null
  dragging = false
  sprite.classList.remove('dragging')
  window.pt.dragEnd()
  if (wasClick) onSpriteClick()
})
sprite.addEventListener('contextmenu', (e) => { e.preventDefault(); window.pt.openSetup() })

function onSpriteClick() {
  if (state.status === 'setup' || state.status === 'error') return window.pt.openSetup()
  setExpanded(!expanded)
}

bubble.addEventListener('click', () => {
  if (state.status === 'setup' || state.status === 'error') return window.pt.openSetup()
  setExpanded(true)
})
$('#btn-close').addEventListener('click', () => setExpanded(false))
$('#btn-refresh').addEventListener('click', () => window.pt.refresh())
$('#btn-dashboard').addEventListener('click', () => window.pt.openDashboard())
list.addEventListener('click', (e) => {
  const li = e.target.closest('li[data-id]')
  if (li) window.pt.openItem(li.dataset.id)
})
document.addEventListener('keydown', (e) => { if (e.key === 'Escape') setExpanded(false) })

window.pt.onExpand(() => setExpanded(true))
window.pt.onState((s) => { state = s; render() })

function setExpanded(v) {
  expanded = v
  render()
}

// ─── 日期 ───
function parse(s) { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d) }
function daysLeft(due, today) { return Math.round((parse(due) - parse(today)) / 86400000) }
function daysLabel(n) { return n < 0 ? `逾期 ${-n} 天` : n === 0 ? '今天' : n === 1 ? '明天' : `${n} 天後` }
const WEEK = '日一二三四五六'
function md(s) { const d = parse(s); return `${d.getMonth() + 1}/${d.getDate()}（${WEEK[d.getDay()]}）` }
function esc(s) { return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]) }

function render() {
  const items = state.items || []
  const today = state.today
  const overdue = items.filter((i) => daysLeft(i.due_date, today) < 0).length
  const n = items.length

  // 心情
  let mood = 'idle'
  if (state.status === 'setup') mood = 'setup'
  else if (state.status === 'error') mood = 'error'
  else if (state.status === 'ok') mood = overdue ? 'overdue' : n ? 'soon' : 'happy'
  document.body.className = 'mood-' + mood
  $('#badge-num').textContent = n > 99 ? '99+' : n

  // 泡泡
  clearTimeout(happyTimer)
  let msg = ''
  if (mood === 'setup') msg = '還沒登入喔～點我設定 🔑'
  else if (mood === 'error') msg = `連線失敗：${esc(state.error)}<br>點我檢查設定`
  else if (mood === 'overdue') msg = `<b class="overdue">${overdue} 件已逾期！</b>` + (n > overdue ? `<br>另有 <b class="soon">${n - overdue} 件</b> ${state.soonDays} 日內到貨` : '')
  else if (mood === 'soon') msg = `有 <b class="soon">${n} 件</b>料件 ${state.soonDays} 日內要到貨！`
  else if (mood === 'happy') {
    msg = `${state.soonDays} 日內沒有要到貨的料件 ✨`
    happyTimer = setTimeout(() => { bubble.hidden = true }, 6000)
  }
  bubble.innerHTML = msg
  bubble.hidden = !msg || expanded

  // 面板
  panel.hidden = !expanded
  $('#panel-title').textContent = `${state.soonDays ?? 3} 日內到貨（${n}）`
  list.innerHTML = n
    ? items.map((i) => {
        const d = daysLeft(i.due_date, today)
        return `<li data-id="${esc(i.id)}" class="${d < 0 ? 'overdue' : ''}" title="點擊開啟明細">
          <span class="name">${esc(i.part_name)}</span>
          <span class="days">${daysLabel(d)}<small>${md(i.due_date)}</small></span>
          <span class="sub">${esc(i.vendor)}${i.requester ? ' · ' + esc(i.requester) : ''}${i.qty ? ' · ' + esc(i.qty) + ' ' + esc(i.unit || '') : ''}</span>
        </li>`
      }).join('')
    : '<li class="empty">目前沒有需要追的交期 🎉</li>'
  $('#updated').textContent = state.updatedAt
    ? '更新於 ' + new Date(state.updatedAt).toLocaleTimeString('zh-TW', { hour12: false, hour: '2-digit', minute: '2-digit' })
    : ''
}
