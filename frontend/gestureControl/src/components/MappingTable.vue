<script setup>
const props = defineProps({ mapping: Object });
</script>

<template>
  <h3 style="margin-top: 14px;">控制映射（gesture → command）</h3>
  <div class="map">
    <div v-for="(v, k) in props.mapping" :key="k" class="row">
      <span class="k">{{ k }}</span>
      <span class="arrow">→</span>
      <span class="v">{{ v }}</span>
    </div>
  </div>
</template>

<style scoped>
.map { margin-top: 8px; border: 1px solid #f0f0f0; border-radius: 10px; overflow: hidden; }
.row { display: grid; grid-template-columns: 1fr 24px 1fr; padding: 8px 10px; border-bottom: 1px solid #f2f2f2; font-size: 13px; }
.row:last-child { border-bottom: none; }
.k { font-weight: 600; }
.arrow { text-align: center; color: #888; }
.v { color: #0b6; font-weight: 700; }
</style>
