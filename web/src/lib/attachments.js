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
