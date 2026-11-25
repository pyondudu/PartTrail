<script setup>
import { nextTick, ref, watch } from 'vue'
import { dialogState as d, close } from '../lib/dialog'

const input = ref(null)
const okBtn = ref(null)
let lastFocus = null

watch(() => d.key, async () => {
  lastFocus = document.activeElement
  await nextTick()
  if (d.kind === 'prompt') { input.value?.focus(); input.value?.select() }
  else okBtn.value?.focus()
})
watch(() => d.open, (v) => { if (!v) lastFocus?.focus?.({ preventScroll: true }) })

function ok() {
  close(d.kind === 'prompt' ? d.value : d.kind === 'confirm' ? true : undefined)
}
function cancel() {
  close(d.kind === 'prompt' ? null : d.kind === 'confirm' ? false : undefined)
}
function onKey(e) {
  if (e.key === 'Escape') { e.preventDefault(); cancel() }
  // 多行輸入不用；單行輸入框按 Enter 直接確定
  else if (e.key === 'Enter' && e.target.tagName === 'INPUT') { e.preventDefault(); ok() }
}
</script>

<template>
  <Transition name="dialog">
    <div v-if="d.open" class="dialog-backdrop" @click.self="cancel" @keydown="onKey">
      <div class="dialog" role="dialog" aria-modal="true" :aria-label="d.msg">
        <p class="dialog-msg">{{ d.msg }}</p>
        <input v-if="d.kind === 'prompt'" ref="input" v-model="d.value" :placeholder="d.placeholder" class="dialog-input" />
        <div class="dialog-actions">
          <button v-if="d.kind !== 'alert'" type="button" class="btn ghost" @click="cancel">{{ d.cancel }}</button>
          <button ref="okBtn" type="button" class="btn primary" :class="{ danger: d.danger }" @click="ok">{{ d.ok }}</button>
        </div>
      </div>
    </div>
  </Transition>
</template>
