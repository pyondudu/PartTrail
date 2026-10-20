import { reactive } from 'vue'
import { supabase } from './supabase'

export const store = reactive({
  session: null,
  role: null,
  items: [],
  loading: false,
  get isEditor() { return this.role === 'editor' },
})

let channel = null

export async function initAuth() {
  const { data } = await supabase.auth.getSession()
  await setSession(data.session)
  supabase.auth.onAuthStateChange((_event, session) => {
    if (session?.user?.id !== store.session?.user?.id) setSession(session)
    else store.session = session
  })
}

async function setSession(session) {
  store.session = session
  store.role = null
  store.items = []
  if (channel) { supabase.removeChannel(channel); channel = null }
  if (!session) return
  const { data } = await supabase.from('profiles').select('role').eq('id', session.user.id).single()
  store.role = data?.role ?? 'viewer'
  await loadItems()
  channel = supabase
    .channel('items-changes')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'items' }, onChange)
    .subscribe()
}

// 有報價明細的料件以整張報價單為一筆，一律顯示 1 set（舊資料存的是數量合計）
function normalize(row) {
  return row.quote_lines?.length ? { ...row, qty: 1, unit: 'set' } : row
}

function onChange({ eventType, new: row, old }) {
  if (eventType === 'DELETE') {
    store.items = store.items.filter((i) => i.id !== old.id)
    return
  }
  const idx = store.items.findIndex((i) => i.id === row.id)
  if (idx >= 0) store.items[idx] = normalize(row)
  else store.items.push(normalize(row))
}

export async function loadItems() {
  store.loading = true
  const { data, error } = await supabase.from('items').select('*').order('due_date', { ascending: true, nullsFirst: false })
  store.loading = false
  if (error) throw error
  store.items = data.map(normalize)
}

export function getItem(id) {
  return store.items.find((i) => i.id === id)
}
