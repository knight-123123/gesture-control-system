<script setup>
import { ref, onMounted } from "vue";

const props = defineProps({
  statusText: String,
  fpsText: String,
  gestureText: String,
  handednessText: String,
  backendState: Object,
  lastEvent: Object,
});

const emit = defineEmits(["ready"]);

const videoEl = ref(null);
const canvasEl = ref(null);

onMounted(() => {
  emit("ready", { video: videoEl.value, canvas: canvasEl.value });
});
</script>

<template>
  <div>
    <div class="stack">
      <video ref="videoEl" class="video" playsinline muted></video>
      <canvas ref="canvasEl" class="canvas"></canvas>
    </div>

    <div class="bar">
      <span>{{ props.statusText }}</span>
      <span>{{ props.fpsText }}</span>
    </div>
    <div class="bar">
      <span>{{ props.gestureText }}</span>
      <span>{{ props.handednessText }}</span>
    </div>
    <div class="bar">
      <span>Mode: {{ props.backendState?.mode }}</span>
      <span>Command: {{ props.backendState?.last_command }}</span>
    </div>
    <div class="bar">
      <span>Accepted: {{ props.lastEvent?.accepted }}</span>
      <span>Reason: {{ props.lastEvent?.reason }}</span>
    </div>
  </div>
</template>

<style scoped>
.stack {
  position: relative;
  width: 900px;
  max-width: 100%;
  border: 1px solid #ddd;
  border-radius: 12px;
  overflow: hidden;
}
.video {
  width: 100%;
  height: auto;
  display: block;
  background: #000;
}
.canvas {
  position: absolute;
  left: 0;
  top: 0;
  width: 100%;
  height: 100%;
  pointer-events: none;
}
.bar {
  margin-top: 8px;
  width: 900px;
  max-width: 100%;
  display: flex;
  justify-content: space-between;
  color: #333;
  font-size: 14px;
}
</style>
