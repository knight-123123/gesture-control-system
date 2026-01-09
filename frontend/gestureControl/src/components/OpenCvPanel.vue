<script setup>
const props = defineProps({
  cvError: String,
  cvResult: Object,
});
</script>

<template>
  <div class="cvbox">
    <div v-if="props.cvError" class="err">错误：{{ props.cvError }}</div>
    <div v-if="props.cvResult" class="ok">
      <div>已保存原图：{{ props.cvResult.original_file }}</div>
      <div>已保存处理后：{{ props.cvResult.processed_file }}</div>
      <div>管线：{{ props.cvResult.pipeline }}</div>
    </div>
  </div>
</template>

<style scoped>
.cvbox { margin-top: 10px; }
.err { color: #b00; font-size: 13px; }
.ok { color: #0b6; font-size: 13px; line-height: 1.5; }
</style>
