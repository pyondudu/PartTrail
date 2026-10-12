import { supabase } from './supabase'

// crypto.randomUUID 只在 https / localhost 可用；用區網 IP（http）開啟時改用 getRandomValues
function randomName() {
  if (crypto.randomUUID) return crypto.randomUUID()
  return [...crypto.getRandomValues(new Uint8Array(16))].map((b) => b.toString(16).padStart(2, '0')).join('')
}

// 上傳附檔到 Storage 並寫入 attachments 表；任一檔失敗即拋出錯誤
export async function uploadAttachments(itemId, files) {
  for (const f of files) {
    const ext = (f.name.split('.').pop() || 'bin').toLowerCase().replace(/[^a-z0-9]/g, '')
    const path = `${itemId}/${randomName()}.${ext}`
    const up = await supabase.storage.from('attachments').upload(path, f, { contentType: f.type })
    if (up.error) throw up.error
    const ins = await supabase.from('attachments').insert({ item_id: itemId, file_path: path, file_name: f.name, mime: f.type })
    if (ins.error) throw ins.error
  }
}

// 手機拍照檔名常都是 image.jpg：與已有檔名重複時依序改名為 image-2.jpg、image-3.jpg…，方便分辨頁序
export function renameDuplicates(files, existingNames = []) {
  const used = new Set(existingNames)
  return files.map((f) => {
    let name = f.name
    if (used.has(name)) {
      const dot = name.lastIndexOf('.')
      const base = dot > 0 ? name.slice(0, dot) : name
      const ext = dot > 0 ? name.slice(dot) : ''
      let n = 2
      while (used.has(`${base}-${n}${ext}`)) n++
      name = `${base}-${n}${ext}`
      f = new File([f], name, { type: f.type, lastModified: f.lastModified })
    }
    used.add(name)
    return f
  })
}
