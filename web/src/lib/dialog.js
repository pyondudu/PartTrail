import { reactive } from 'vue'

// 全站共用的站內對話框（取代瀏覽器原生 confirm / prompt / alert）；App.vue 只放一個 <Dialog />
// 每個函式回傳 Promise：confirmBox → true/false、promptBox → 字串或 null、alertBox → undefined
export const dialogState = reactive({
  open: false, kind: 'confirm', msg: '', ok: '確定', cancel: '取消', danger: false,
  value: '', placeholder: '', key: 0,
})

let resolver = null

function show(opts, kind) {
  // 已有對話框時先當作取消，避免前一個 Promise 永遠不結束
  if (resolver) close(kind === 'prompt' ? null : false)
  Object.assign(dialogState, { ok: '確定', cancel: '取消', danger: false, value: '', placeholder: '' }, opts, { kind, open: true })
  dialogState.key++
  return new Promise((r) => (resolver = r))
}

export function close(result) {
  const r = resolver
  resolver = null
  dialogState.open = false
  r?.(result)
}

export const confirmBox = (msg, opts = {}) => show({ msg, ...opts }, 'confirm')
export const promptBox = (msg, opts = {}) => show({ msg, ...opts }, 'prompt')
export const alertBox = (msg, opts = {}) => show({ msg, ...opts }, 'alert')
