const form = document.getElementById('form')
const msg = document.getElementById('msg')
const logoutBtn = document.getElementById('logout')

async function load() {
  const s = await window.pt.getSettings()
  for (const k of ['supabaseUrl', 'supabaseAnonKey', 'webUrl', 'soonDays', 'notifyHour', 'email']) {
    if (s[k] !== undefined && s[k] !== '') form.elements[k].value = s[k]
  }
  // 已有連線設定就收合，聚焦在帳號
  if (s.supabaseUrl && s.supabaseAnonKey) document.getElementById('server').open = false
  const logged = document.getElementById('logged')
  logged.hidden = !s.loggedIn
  logged.textContent = s.loggedIn ? `目前登入：${s.email}` : ''
  logoutBtn.hidden = !s.loggedIn
  form.elements[s.loggedIn ? 'email' : s.supabaseUrl ? 'email' : 'supabaseUrl'].focus()
}

form.addEventListener('submit', async (e) => {
  e.preventDefault()
  const data = Object.fromEntries(new FormData(form))
  const btn = form.querySelector('button[type=submit]')
  btn.disabled = true
  msg.className = ''
  msg.textContent = '連線中…'
  const r = await window.pt.login(data)
  btn.disabled = false
  if (r.ok) {
    msg.className = 'ok'
    msg.textContent = '完成！可以關閉這個視窗了。'
    form.elements.password.value = ''
    load()
    setTimeout(() => window.close(), 1200)
  } else {
    msg.className = 'err'
    msg.textContent = r.error
  }
})

logoutBtn.addEventListener('click', async () => {
  await window.pt.logout()
  msg.className = ''
  msg.textContent = '已登出'
  load()
})

load()
