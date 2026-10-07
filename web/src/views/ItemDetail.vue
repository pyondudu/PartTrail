<script setup>
import { computed, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import { supabase } from '../lib/supabase'
import { store, getItem } from '../lib/store'
import { uploadAttachments } from '../lib/attachments'
import { STATUS, urgency, daysText, fmtDate, fmtDateTime, fmtMoney, progressText, todayStr } from '../lib/util'

const props = defineProps({ id: String })
const router = useRouter()
const item = computed(() => getItem(props.id))

const history = ref([])
const statusLog = ref([])
const files = ref([])
const toast = ref('')
const uploading = ref(false)

async function loadRelated() {
  const [h, s, a] = await Promise.all([
    supabase.from('due_date_history').select('*').eq('item_id', props.id).order('changed_at', { ascending: false }),
    supabase.from('status_log').select('*').eq('item_id', props.id).order('changed_at', { ascending: true }),
    supabase.from('attachments').select('*').eq('item_id', props.id).order('uploaded_at', { ascending: false }),
  ])
  history.value = h.data ?? []
  statusLog.value = s.data ?? []
  const paths = (a.data ?? []).map((f) => f.file_path)
  const signed = paths.length ? (await supabase.storage.from('attachments').createSignedUrls(paths, 3600)).data ?? [] : []
  files.value = (a.data ?? []).map((f, i) => ({ ...f, url: signed[i]?.signedUrl }))
}

// item 透過 realtime 更新時（例如別處改了交期），一併重新載入歷史
watch(() => [props.id, item.value?.updated_at], loadRelated, { immediate: true })

function flash(msg) {
  toast.value = msg
  setTimeout(() => (toast.value = ''), 2000)
}

async function copyProgress() {
  const text = progressText(item.value)
  try {
    await navigator.clipboard.writeText(text)
    flash('已複製進度文字')
  } catch {
    window.prompt('請手動複製：', text)
  }
}

async function markReceived() {
  if (!confirm('標記為已收貨（到貨日：今天）？')) return
  const { error } = await supabase.from('items').update({ status: 'received', received_date: todayStr() }).eq('id', props.id)
  if (error) alert(error.message)
}

async function upload(e) {
  const list = [...e.target.files]
  e.target.value = ''
  if (!list.length) return
  uploading.value = true
  try {
    await uploadAttachments(props.id, list)
    flash('上傳完成')
    await loadRelated()
  } catch (err) {
    alert('上傳失敗：' + err.message)
  } finally {
    uploading.value = false
  }
}

async function removeFile(f) {
  if (!confirm(`刪除附檔「${f.file_name}」？`)) return
  await supabase.storage.from('attachments').remove([f.file_path])
  await supabase.from('attachments').delete().eq('id', f.id)
  await loadRelated()
}

async function removeItem() {
  if (!confirm(`確定刪除「${item.value.part_name}」？此動作無法復原。`)) return
  const paths = files.value.map((f) => f.file_path)
  if (paths.length) await supabase.storage.from('attachments').remove(paths)
  const { error } = await supabase.from('items').delete().eq('id', props.id)
  if (error) return alert(error.message)
  router.replace('/')
}
</script>

<template>
  <p v-if="!item && store.loading" class="muted center">載入中…</p>
  <div v-else-if="!item" class="card center">
    找不到這筆料件（可能已刪除）。<router-link to="/">回總表</router-link>
  </div>
  <div v-else class="detail">
    <div class="page-head">
      <router-link to="/" class="btn ghost small">← 總表</router-link>
      <div class="head-actions">
        <button class="btn ghost small" @click="copyProgress">📋 複製進度</button>
        <template v-if="store.isEditor">
          <button v-if="item.status === 'ordered'" class="btn ghost small" @click="markReceived">✓ 已收貨</button>
          <router-link :to="`/item/${item.id}/edit`" class="btn primary small">編輯</router-link>
        </template>
      </div>
    </div>

    <section class="card hero" :class="'u-' + urgency(item)">
      <div class="hero-top">
        <span class="pill" :class="item.status">{{ STATUS[item.status].label }}</span>
        <span class="days">{{ daysText(item) }}</span>
      </div>
      <h2>{{ item.part_name }}</h2>
      <p v-if="item.qty" class="muted">{{ item.qty }} {{ item.unit }}</p>
      <p v-if="item.status !== 'quoted'" class="big-due">交期 {{ fmtDate(item.due_date) }}</p>
    </section>

    <section class="card">
      <dl class="kv">
        <dt>廠商</dt><dd>{{ item.vendor }}</dd>
        <dt>需求人</dt><dd>{{ item.requester || '—' }}</dd>
        <dt>規格</dt><dd class="pre">{{ item.spec || '—' }}</dd>
        <dt>報價單號</dt><dd>{{ item.quote_no || '—' }}</dd>
        <dt>報價金額（含稅）</dt><dd>{{ fmtMoney(item.quote_amount) }}</dd>
        <dt>報價日</dt><dd>{{ fmtDate(item.quote_date) }}</dd>
        <dt>下單日</dt><dd>{{ fmtDate(item.order_date) }}</dd>
        <dt>到貨日</dt><dd>{{ fmtDate(item.received_date) }}</dd>
        <dt>備註</dt><dd class="pre">{{ item.note || '—' }}</dd>
      </dl>
    </section>

    <section class="card">
      <div class="section-head">
        <h3>附檔</h3>
        <div v-if="store.isEditor" class="head-actions">
          <label class="btn ghost small">
            📷 拍照<input type="file" accept="image/*" capture="environment" hidden @change="upload" />
          </label>
          <label class="btn ghost small">
            📎 上傳<input type="file" accept="image/*,application/pdf" multiple hidden @change="upload" />
          </label>
        </div>
      </div>
      <p v-if="uploading" class="muted">上傳中…</p>
      <p v-if="!files.length" class="muted">尚無附檔</p>
      <ul class="files">
        <li v-for="f in files" :key="f.id">
          <a :href="f.url" target="_blank" rel="noopener" class="file">
            <img v-if="f.mime?.startsWith('image/')" :src="f.url" alt="" />
            <span v-else class="file-icon">PDF</span>
            <span class="file-name">{{ f.file_name }}</span>
          </a>
          <button v-if="store.isEditor" class="btn link danger" @click="removeFile(f)">刪除</button>
        </li>
      </ul>
    </section>

    <section class="card">
      <h3>交期變更紀錄</h3>
      <p v-if="!history.length" class="muted">尚無紀錄</p>
      <ol class="timeline">
        <li v-for="h in history" :key="h.id">
          <div class="tl-main">
            <template v-if="h.old_due"><s>{{ fmtDate(h.old_due) }}</s> → </template>
            <strong>{{ fmtDate(h.new_due) }}</strong>
          </div>
          <div class="tl-sub">{{ h.reason || '—' }} · {{ fmtDateTime(h.changed_at) }}</div>
        </li>
      </ol>
    </section>

    <section class="card">
      <h3>狀態歷程</h3>
      <ol class="timeline">
        <li v-for="s in statusLog" :key="s.id">
          <div class="tl-main">{{ STATUS[s.to_status]?.label }}</div>
          <div class="tl-sub">{{ fmtDateTime(s.changed_at) }}</div>
        </li>
      </ol>
    </section>

    <div v-if="store.isEditor" class="danger-zone">
      <button class="btn link danger" @click="removeItem">刪除此料件</button>
    </div>

    <div v-if="toast" class="toast">{{ toast }}</div>
  </div>
</template>
