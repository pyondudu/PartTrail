import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import fs from 'node:fs'
import path from 'node:path'

// 同一份程式可建出多個站台：VITE_SITE=<站名> npm run build
// 各站的名稱與圖示放在 sites/<站名>/（site.json、app-icon.svg、icon-192.png、icon-512.png）
const site = process.env.VITE_SITE || 'main'
const siteDir = path.resolve(__dirname, 'sites', site)
const cfg = JSON.parse(fs.readFileSync(path.join(siteDir, 'site.json'), 'utf8'))

// site.json 的 theme 覆蓋 style.css 的色彩變數；用 [data-site] 提高權重
function themeStyle() {
  if (!cfg.theme) return ''
  const vars = (o) => Object.entries(o || {}).map(([k, v]) => `${k}:${v}`).join(';')
  const sel = `:root[data-site="${site}"]`
  return `<style>${sel}{${vars(cfg.theme.light)}}@media (prefers-color-scheme: dark){${sel}{${vars(cfg.theme.dark)}}}</style>\n  `
}

function siteFiles() {
  const files = {
    'manifest.webmanifest': JSON.stringify({
      name: cfg.title, short_name: cfg.name, start_url: './', scope: './', display: 'standalone',
      background_color: '#faf9f5', theme_color: cfg.themeColor,
      icons: [
        { src: 'app-icon.svg', sizes: 'any', type: 'image/svg+xml' },
        { src: 'icon-192.png', sizes: '192x192', type: 'image/png' },
        { src: 'icon-512.png', sizes: '512x512', type: 'image/png' },
      ],
    }, null, 2),
  }
  for (const f of fs.readdirSync(siteDir)) if (f !== 'site.json') files[f] = fs.readFileSync(path.join(siteDir, f))
  return files
}

function sitePlugin() {
  return {
    name: 'parttrail-site',
    transformIndexHtml: (html) => html.replaceAll('%SITE_TITLE%', cfg.title).replaceAll('%SITE_THEME%', cfg.themeColor)
      .replace('<html ', `<html data-site="${site}" `).replace('</head>', `${themeStyle()}</head>`),
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const body = siteFiles()[req.url.split('?')[0].replace(/^\//, '')]
        if (!body) return next()
        res.setHeader('Content-Type', req.url.includes('.svg') ? 'image/svg+xml' : req.url.includes('.png') ? 'image/png' : 'application/manifest+json')
        res.end(body)
      })
    },
    generateBundle() {
      for (const [fileName, source] of Object.entries(siteFiles())) this.emitFile({ type: 'asset', fileName, source })
    },
  }
}

// base 設為相對路徑，部署到 GitHub Pages 子目錄或 Netlify 皆可
export default defineConfig({
  base: './',
  define: { __SITE_NAME__: JSON.stringify(cfg.name) },
  plugins: [vue(), sitePlugin()],
})
