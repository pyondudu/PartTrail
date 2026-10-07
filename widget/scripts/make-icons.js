// 用 Electron 離屏渲染 SVG 產生 PNG 圖示：npm run icons
const { app, BrowserWindow } = require('electron')
const fs = require('fs')
const path = require('path')

const root = path.join(__dirname, '..', '..')
const SPRITE = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="14 10 92 100">
  <path d="M60 30c26 0 40 18 40 42 0 22-16 34-40 34S20 94 20 72c0-24 14-42 40-42z" fill="#d97757"/>
  <path d="M60 10l2.4 9.6L72 22l-9.6 2.4L60 34l-2.4-9.6L48 22l9.6-2.4z" fill="#f6c45b"/>
  <ellipse cx="46" cy="68" rx="5.5" ry="7.5" fill="#2b2a27"/><ellipse cx="74" cy="68" rx="5.5" ry="7.5" fill="#2b2a27"/>
  <circle cx="48" cy="65" r="2" fill="#fff"/><circle cx="76" cy="65" r="2" fill="#fff"/>
  <path d="M53 83q7 7 14 0" fill="none" stroke="#2b2a27" stroke-width="3" stroke-linecap="round"/>
</svg>`
const WEB = fs.readFileSync(path.join(root, 'web', 'public', 'icon.svg'), 'utf8')

const jobs = [
  { svg: SPRITE, size: 256, out: path.join(__dirname, '..', 'build', 'icon.png') },
  { svg: WEB, size: 192, out: path.join(root, 'web', 'public', 'icon-192.png') },
  { svg: WEB, size: 512, out: path.join(root, 'web', 'public', 'icon-512.png') },
]

app.disableHardwareAcceleration()
app.whenReady().then(async () => {
  const win = new BrowserWindow({ width: 512, height: 512, show: false, transparent: true, frame: false, useContentSize: true, webPreferences: { offscreen: true } })
  for (const j of jobs) {
    win.setContentSize(j.size, j.size)
    const html = `<html><body style="margin:0;background:transparent"><img src="data:image/svg+xml;base64,${Buffer.from(j.svg).toString('base64')}" width="${j.size}" height="${j.size}" style="display:block"></body></html>`
    await win.loadURL('data:text/html;base64,' + Buffer.from(html).toString('base64'))
    await new Promise((r) => setTimeout(r, 300))
    const img = await win.webContents.capturePage({ x: 0, y: 0, width: j.size, height: j.size })
    fs.mkdirSync(path.dirname(j.out), { recursive: true })
    fs.writeFileSync(j.out, img.resize({ width: j.size, height: j.size }).toPNG())
    console.log('wrote', path.relative(root, j.out), img.getSize())
  }
  app.quit()
})
