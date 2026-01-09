<script setup>
const props = defineProps({ logs: Array });

function fmtTime(sec) {
  if (!sec) return "-";
  return new Date(sec * 1000).toLocaleTimeString();
}
</script>

<template>
  <h3 style="margin-top: 14px;">最近日志（最新 30 条）</h3>
  <div class="logs">
    <div v-if="!props.logs?.length" class="empty">暂无日志</div>
    <div v-for="(it, idx) in props.logs" :key="idx" class="item">
      <div class="top">
        <span class="t">{{ fmtTime(it.time) }}</span>
        <span class="g">{{ it.gesture }}</span>
        <span class="c">{{ it.command }}</span>
      </div>
      <div class="sub">score: {{ it.score }}</div>
    </div>
  </div>
</template>

<style scoped>
.logs { margin-top: 8px; max-height: 360px; overflow: auto; border: 1px solid #f0f0f0; border-radius: 10px; padding: 8px; }
.empty { color: #666; font-size: 13px; padding: 8px; }
.item { padding: 8px; border-bottom: 1px dashed #eaeaea; }
.item:last-child { border-bottom: none; }
.top { display: flex; gap: 10px; align-items: center; font-size: 13px; }
.t { color: #555; width: 90px; }
.g { font-weight: 700; width: 110px; }
.c { color: #0b6; font-weight: 700; }
.sub { margin-top: 4px; font-size: 12px; color: #888; }
</style>
