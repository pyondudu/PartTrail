// 用 Electron 離屏渲染 SVG 產生 PNG 圖示：npm run icons
const { app, BrowserWindow } = require('electron')
const fs = require('fs')
const path = require('path')

const root = path.join(__dirname, '..', '..')
const SPRITE = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 -1 16 16" shape-rendering="crispEdges">
  <g fill="#f6c45b"><rect x="7" y="0" width="2" height="3"/><rect x="6" y="1" width="4" height="1"/></g>
  <g fill="#d97757">
    <rect x="3" y="4" width="10" height="7"/><rect x="1" y="6" width="2" height="2"/><rect x="13" y="6" width="2" height="2"/>
    <rect x="4" y="11" width="1" height="2"/><rect x="6" y="11" width="1" height="2"/><rect x="9" y="11" width="1" height="2"/><rect x="11" y="11" width="1" height="2"/>
  </g>
  <g fill="#2b2a27"><rect x="5" y="6" width="1" height="2"/><rect x="10" y="6" width="1" height="2"/></g>
</svg>`
const sitesDir = path.join(root, 'web', 'sites')

// 精靈圖示 + 每個網站（web/sites/<站名>/app-icon.svg）的手機圖示
const jobs = [{ svg: SPRITE, size: 256, out: path.join(__dirname, '..', 'build', 'icon.png') }]
for (const site of fs.readdirSync(sitesDir)) {
  const svg = fs.readFileSync(path.join(sitesDir, site, 'app-icon.svg'), 'utf8')
  for (const size of [192, 512]) jobs.push({ svg, size, out: path.join(sitesDir, site, `icon-${size}.png`), web: true })
}

app.disableHardwareAcceleration()
app.whenReady().then(async () => {
  const win = new BrowserWindow({ width: 512, height: 512, show: false, transparent: true, frame: false, useContentSize: true, webPreferences: { offscreen: true } })
  // npm run icons -- --widget-only：只重做精靈圖示；--web-only：只重做手機圖示
  const widgetOnly = process.argv.includes('--widget-only')
  const webOnly = process.argv.includes('--web-only')
  for (const j of jobs.filter((j) => !(widgetOnly && j.web) && !(webOnly && !j.web))) {
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
