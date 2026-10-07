const { app, BrowserWindow, Tray, Menu, Notification, ipcMain, shell, screen, nativeImage } = require('electron')
const path = require('path')
const { createClient } = require('@supabase/supabase-js')
const WebSocket = require('ws')
const { loadSettings, saveSettings, createSecureStorage } = require('./lib/config')
const { demoItems } = require('./lib/demo')

const DEMO = process.env.PARTTRAIL_DEMO === '1'
const WIN_W = 320
const WIN_H = 460
const ICON = path.join(__dirname, 'build', 'icon.png')
// Linux 不支援 forward 滑鼠事件，穿透後就收不到 hover，因此只在 Windows/macOS 啟用
const CLICK_THROUGH = process.platform !== 'linux'

// 主管/同事用名字當帳號：沒有 @ 時補上假網域（與網頁 web/src/lib/util.js 相同）
const LOGIN_DOMAIN = 'parttrail.local'
function toLoginEmail(input) {
  const v = String(input).trim().toLowerCase()
  return v.includes('@') ? v : `${v}@${LOGIN_DOMAIN}`
}

let settings
let supabase = null
let channel = null
let widget = null
let setupWin = null
let tray = null
let refreshTimer = null
let state = { status: 'loading', items: [], updatedAt: null, error: '' }

if (!app.requestSingleInstanceLock()) app.quit()
app.on('second-instance', () => widget?.show())

// ─────────────────────────── 日期工具 ───────────────────────────
function dayStr(offset = 0) {
  const d = new Date()
  d.setDate(d.getDate() + offset)
  return [d.getFullYear(), String(d.getMonth() + 1).padStart(2, '0'), String(d.getDate()).padStart(2, '0')].join('-')
}

// ─────────────────────────── Supabase ───────────────────────────
function initClient() {
  if (channel) { supabase.removeChannel(channel); channel = null }
  supabase = null
  if (!settings.supabaseUrl || !settings.supabaseAnonKey) return false
  supabase = createClient(settings.supabaseUrl, settings.supabaseAnonKey, {
    auth: { storage: createSecureStorage(), persistSession: true, autoRefreshToken: true, detectSessionInUrl: false },
    realtime: { transport: WebSocket },
  })
  return true
}

function subscribeRealtime() {
  if (channel || !supabase) return
  let t = null
  channel = supabase
    .channel('widget-items')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'items' }, () => {
      clearTimeout(t)
      t = setTimeout(refresh, 1500)
    })
    .subscribe()
}

async function refresh() {
  if (DEMO) {
    setState({ status: 'ok', items: demoItems(dayStr), updatedAt: new Date().toISOString(), error: '' })
    return
  }
  if (!supabase) return setState({ status: 'setup', items: [] })
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) return setState({ status: 'setup', items: [] })

  const { data, error } = await supabase
    .from('items')
    .select('id, part_name, vendor, requester, qty, unit, due_date')
    .eq('status', 'ordered')
    .lte('due_date', dayStr(settings.soonDays))
    .order('due_date', { ascending: true })

  if (error) {
    const authErr = /JWT|auth/i.test(error.message)
    return setState({ status: authErr ? 'setup' : 'error', error: error.message })
  }
  subscribeRealtime()
  setState({ status: 'ok', items: data, updatedAt: new Date().toISOString(), error: '' })
  maybeNotify()
}

function setState(patch) {
  state = { ...state, ...patch }
  widget?.webContents.send('state', { ...state, today: dayStr(), soonDays: settings.soonDays })
  updateTray()
}

// ─────────────────────────── 通知 ───────────────────────────
// 每天提醒一次：啟動時（若今天尚未提醒）或到了 notifyHour 時
function maybeNotify(force = false) {
  const today = dayStr()
  if (!force && settings.lastNotifiedDay === today) return
  if (!state.items.length) return
  const overdue = state.items.filter((i) => i.due_date < today).length
  const body = state.items
    .slice(0, 4)
    .map((i) => `• ${i.part_name}（${i.vendor}）${i.due_date.slice(5).replace('-', '/')}`)
    .join('\n')
  const n = new Notification({
    title: overdue ? `⚠ ${overdue} 件已逾期，共 ${state.items.length} 件待到貨` : `📦 ${state.items.length} 件料件 ${settings.soonDays} 日內到貨`,
    body: body + (state.items.length > 4 ? `\n…還有 ${state.items.length - 4} 件` : ''),
    icon: ICON,
  })
  n.on('click', () => { widget?.show(); widget?.webContents.send('expand') })
  n.show()
  settings.lastNotifiedDay = today
  saveSettings(settings)
}

let lastDay = dayStr()
let lastHour = new Date().getHours()
function tick() {
  const now = new Date()
  if (dayStr() !== lastDay) { lastDay = dayStr(); refresh() }
  if (now.getHours() === settings.notifyHour && lastHour !== settings.notifyHour) {
    refresh().then(() => maybeNotify(true))
  }
  lastHour = now.getHours()
}

// ─────────────────────────── 視窗 ───────────────────────────
function defaultPosition() {
  const { workArea } = screen.getPrimaryDisplay()
  return { x: workArea.x + workArea.width - WIN_W - 16, y: workArea.y + workArea.height - WIN_H - 8 }
}

function clampPosition(pos) {
  const area = screen.getDisplayNearestPoint({ x: pos.x + WIN_W / 2, y: pos.y + WIN_H / 2 }).workArea
  return {
    x: Math.min(Math.max(pos.x, area.x - WIN_W + 120), area.x + area.width - 120),
    y: Math.min(Math.max(pos.y, area.y - WIN_H + 160), area.y + area.height - 160),
  }
}

function createWidget() {
  const pos = clampPosition(settings.position || defaultPosition())
  widget = new BrowserWindow({
    ...pos,
    width: WIN_W,
    height: WIN_H,
    frame: false,
    transparent: true,
    resizable: false,
    skipTaskbar: true,
    alwaysOnTop: true,
    hasShadow: false,
    focusable: true,
    show: false,
    webPreferences: { preload: path.join(__dirname, 'preload.js') },
  })
  widget.setAlwaysOnTop(true, 'floating')
  if (CLICK_THROUGH) widget.setIgnoreMouseEvents(true, { forward: true })
  widget.loadFile(path.join(__dirname, 'renderer', 'index.html'))
  widget.once('ready-to-show', () => widget.showInactive())
  widget.webContents.on('did-finish-load', () => setState({}))
}

function openSetup() {
  if (setupWin) return setupWin.focus()
  setupWin = new BrowserWindow({
    width: 440,
    height: 620,
    title: 'PartTrail 精靈 — 設定與登入',
    icon: ICON,
    autoHideMenuBar: true,
    resizable: false,
    webPreferences: { preload: path.join(__dirname, 'preload.js') },
  })
  setupWin.loadFile(path.join(__dirname, 'renderer', 'setup.html'))
  setupWin.on('closed', () => (setupWin = null))
}

function webBase() {
  return (settings.webUrl || '').split('#')[0]
}

// ─────────────────────────── 系統匣 ───────────────────────────
function autoLaunchOpts() {
  // portable 版執行時會解壓到暫存資料夾，需指向原始 exe
  const exe = process.env.PORTABLE_EXECUTABLE_FILE
  return exe ? { path: exe } : {}
}

function updateTray() {
  if (!tray) return
  const n = state.items.length
  tray.setToolTip(state.status === 'ok' ? `PartTrail：${n} 件 ${settings.soonDays} 日內到貨` : 'PartTrail 精靈')
  const openAtLogin = app.getLoginItemSettings(autoLaunchOpts()).openAtLogin
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: widget?.isVisible() ? '隱藏精靈' : '顯示精靈', click: () => { widget.isVisible() ? widget.hide() : widget.showInactive(); updateTray() } },
    { label: '立即更新', click: refresh },
    { label: '開啟追蹤總表', enabled: Boolean(webBase()), click: () => shell.openExternal(webBase()) },
    { type: 'separator' },
    { label: '開機自動啟動', type: 'checkbox', checked: openAtLogin, click: (mi) => { app.setLoginItemSettings({ openAtLogin: mi.checked, ...autoLaunchOpts() }) } },
    { label: '回到預設位置', click: () => { widget.setPosition(...Object.values(defaultPosition())); savePosition() } },
    { label: '設定 / 登入…', click: openSetup },
    { type: 'separator' },
    { label: '結束', click: () => app.quit() },
  ]))
}

function savePosition() {
  const [x, y] = widget.getPosition()
  settings.position = { x, y }
  saveSettings(settings)
}

// ─────────────────────────── IPC ───────────────────────────
ipcMain.on('set-ignore-mouse', (_e, ignore) => CLICK_THROUGH && widget?.setIgnoreMouseEvents(ignore, { forward: true }))

let dragStart = null
ipcMain.on('drag-start', () => { dragStart = widget.getPosition() })
ipcMain.on('drag-move', (_e, { dx, dy }) => {
  if (dragStart) widget.setPosition(Math.round(dragStart[0] + dx), Math.round(dragStart[1] + dy))
})
ipcMain.on('drag-end', () => { dragStart = null; savePosition() })

ipcMain.on('open-item', (_e, id) => webBase() && shell.openExternal(`${webBase()}#/item/${id}`))
ipcMain.on('open-dashboard', () => webBase() && shell.openExternal(webBase()))
ipcMain.on('open-setup', openSetup)
ipcMain.on('refresh', refresh)
ipcMain.on('hide', () => { widget.hide(); updateTray() })

ipcMain.handle('get-settings', async () => {
  const session = supabase ? (await supabase.auth.getSession()).data.session : null
  return {
    supabaseUrl: settings.supabaseUrl,
    supabaseAnonKey: settings.supabaseAnonKey,
    webUrl: settings.webUrl,
    soonDays: settings.soonDays,
    notifyHour: settings.notifyHour,
    email: session?.user?.email || '',
    loggedIn: Boolean(session),
  }
})

ipcMain.handle('login', async (_e, form) => {
  const changedServer = form.supabaseUrl !== settings.supabaseUrl || form.supabaseAnonKey !== settings.supabaseAnonKey
  Object.assign(settings, {
    supabaseUrl: form.supabaseUrl.trim().replace(/\/+$/, ''),
    supabaseAnonKey: form.supabaseAnonKey.trim(),
    webUrl: form.webUrl.trim(),
    soonDays: Number(form.soonDays) || 3,
    notifyHour: Number(form.notifyHour) || 9,
  })
  saveSettings(settings)
  if (changedServer || !supabase) initClient()
  if (!supabase) return { ok: false, error: '請填寫 Supabase URL 與 anon key' }
  if (form.password) {
    const { error } = await supabase.auth.signInWithPassword({ email: toLoginEmail(form.email), password: form.password })
    if (error) return { ok: false, error: '登入失敗：' + error.message }
  }
  await refresh()
  if (state.status === 'setup') return { ok: false, error: '尚未登入，請輸入帳號（或 Email）與密碼' }
  if (state.status === 'error') return { ok: false, error: '讀取資料失敗：' + state.error }
  return { ok: true }
})

ipcMain.handle('logout', async () => {
  if (supabase) await supabase.auth.signOut()
  if (channel) { supabase.removeChannel(channel); channel = null }
  setState({ status: 'setup', items: [] })
  return { ok: true }
})

// ─────────────────────────── 啟動 ───────────────────────────
app.whenReady().then(async () => {
  app.setAppUserModelId('com.parttrail.widget') // Windows 通知需要
  settings = loadSettings()
  initClient()

  // 安裝後第一次執行預設開機自動啟動
  if (app.isPackaged && !settings.autoLaunchInit) {
    app.setLoginItemSettings({ openAtLogin: true, ...autoLaunchOpts() })
    settings.autoLaunchInit = true
    saveSettings(settings)
  }

  tray = new Tray(nativeImage.createFromPath(ICON).resize({ width: 16, height: 16 }))
  tray.on('click', () => { widget.isVisible() ? widget.hide() : widget.showInactive(); updateTray() })
  createWidget()
  updateTray()

  await refresh()
  if (state.status === 'setup' && !DEMO) openSetup()

  refreshTimer = setInterval(refresh, settings.refreshMinutes * 60 * 1000)
  setInterval(tick, 60 * 1000)
})

// 精靈常駐系統匣，關閉設定視窗不結束程式
app.on('window-all-closed', () => {})
app.on('before-quit', () => clearInterval(refreshTimer))
