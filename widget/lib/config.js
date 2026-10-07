// 本機設定與加密 session 儲存（存於 %APPDATA%/PartTrail 精靈/）
const { app, safeStorage } = require('electron')
const fs = require('fs')
const path = require('path')

const dir = () => app.getPath('userData')
const settingsFile = () => path.join(dir(), 'settings.json')
const sessionFile = () => path.join(dir(), 'session.bin')

// 打包時可附帶 config.json 預先填好 Supabase 與網頁網址
function bundledConfig() {
  try {
    return JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'config.json'), 'utf8'))
  } catch {
    return {}
  }
}

const DEFAULTS = {
  supabaseUrl: '',
  supabaseAnonKey: '',
  webUrl: '',
  soonDays: 3,
  refreshMinutes: 30,
  notifyHour: 9,
  position: null,
  lastNotifiedDay: '',
}

function loadSettings() {
  let saved = {}
  try { saved = JSON.parse(fs.readFileSync(settingsFile(), 'utf8')) } catch {}
  const b = bundledConfig()
  const merged = { ...DEFAULTS, ...b, ...saved }
  // 空字串不覆蓋打包內建值
  for (const k of ['supabaseUrl', 'supabaseAnonKey', 'webUrl']) if (!saved[k] && b[k]) merged[k] = b[k]
  return merged
}

function saveSettings(s) {
  fs.mkdirSync(dir(), { recursive: true })
  fs.writeFileSync(settingsFile(), JSON.stringify(s, null, 2))
}

// supabase-js 的 storage adapter；內容以 OS 金鑰（Windows DPAPI）加密
function createSecureStorage() {
  let cache = null
  const read = () => {
    if (cache) return cache
    try {
      const buf = fs.readFileSync(sessionFile())
      const txt = safeStorage.isEncryptionAvailable() ? safeStorage.decryptString(buf) : buf.toString('utf8')
      cache = JSON.parse(txt)
    } catch {
      cache = {}
    }
    return cache
  }
  const write = () => {
    fs.mkdirSync(dir(), { recursive: true })
    const txt = JSON.stringify(cache)
    const buf = safeStorage.isEncryptionAvailable() ? safeStorage.encryptString(txt) : Buffer.from(txt, 'utf8')
    fs.writeFileSync(sessionFile(), buf)
  }
  return {
    getItem: (k) => read()[k] ?? null,
    setItem: (k, v) => { read()[k] = v; write() },
    removeItem: (k) => { delete read()[k]; write() },
  }
}

module.exports = { loadSettings, saveSettings, createSecureStorage }
