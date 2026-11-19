<script setup>
// 載入中的骨架畫面：電腦顯示表格列、手機顯示卡片；detail 用於詳細頁／編輯頁
defineProps({
  variant: { type: String, default: 'list' }, // list | detail
  rows: { type: Number, default: 6 },
})
</script>

<template>
  <div class="skeleton" aria-busy="true" aria-label="載入中">
    <template v-if="variant === 'detail'">
      <div class="card sk-card">
        <div class="sk sk-line w40 tall" />
        <div class="sk sk-line w60" />
        <div class="sk sk-line w30" />
      </div>
      <div class="card sk-card">
        <div v-for="n in rows" :key="n" class="sk-kv">
          <div class="sk sk-line w15" />
          <div class="sk sk-line" :class="n % 2 ? 'w50' : 'w70'" />
        </div>
      </div>
    </template>
    <template v-else>
      <div class="sk-table">
        <div class="sk-row head"><div class="sk sk-line w100" /></div>
        <div v-for="n in rows" :key="n" class="sk-row">
          <div class="sk sk-line w10" />
          <div class="sk sk-pill" />
          <div class="sk sk-line w15" />
          <div class="sk sk-line" :class="n % 2 ? 'w40' : 'w30'" />
          <div class="sk sk-line w10" />
        </div>
      </div>
      <div class="sk-cards">
        <div v-for="n in Math.min(rows, 4)" :key="n" class="card sk-card">
          <div class="sk sk-line" :class="n % 2 ? 'w60' : 'w50'" />
          <div class="sk sk-line w80 thin" />
          <div class="sk sk-line w40 thin" />
        </div>
      </div>
    </template>
  </div>
</template>
