import { reactive } from 'vue'

// 全站共用的吐司通知；App.vue 只放一個，各頁呼叫 toast() 即可
export const toastState = reactive({ msg: '', type: 'ok', key: 0 })

let timer
export function toast(msg, type = 'ok', ms = type === 'error' ? 4000 : 2200) {
  clearTimeout(timer)
  toastState.msg = msg
  toastState.type = type
  toastState.key++
  timer = setTimeout(() => (toastState.msg = ''), ms)
}
