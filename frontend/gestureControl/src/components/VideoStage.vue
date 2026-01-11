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
  <div class="video-stage">
    <!-- 视频容器 -->
    <div class="video-container">
      <div class="stack">
        <video ref="videoEl" class="video" playsinline muted></video>
        <canvas ref="canvasEl" class="canvas"></canvas>
      </div>
    </div>

    <!-- 信息面板 -->
    <div class="info-panel">
      <div class="info-row">
        <div class="info-item">
          <span class="info-icon">📊</span>
          <span class="info-text">{{ props.statusText }}</span>
        </div>
        <div class="info-item">
          <span class="info-icon">⚡</span>
          <span class="info-text">{{ props.fpsText }}</span>
        </div>
      </div>

      <div class="info-row">
        <div class="info-item">
          <span class="info-icon">👋</span>
          <span class="info-text">{{ props.gestureText }}</span>
        </div>
        <div class="info-item">
          <span class="info-icon">✋</span>
          <span class="info-text">{{ props.handednessText }}</span>
        </div>
      </div>

      <div class="info-row">
        <div class="info-item">
          <span class="info-icon">🎮</span>
          <span class="info-text">Mode: {{ props.backendState?.mode }}</span>
        </div>
        <div class="info-item">
          <span class="info-icon">🎯</span>
          <span class="info-text">Command: {{ props.backendState?.last_command }}</span>
        </div>
      </div>

      <div class="info-row">
        <div class="info-item">
          <span class="info-icon">{{ props.lastEvent?.accepted ? '✅' : '⏸️' }}</span>
          <span class="info-text">Accepted: {{ props.lastEvent?.accepted }}</span>
        </div>
        <div class="info-item">
          <span class="info-icon">💬</span>
          <span class="info-text">Reason: {{ props.lastEvent?.reason }}</span>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.video-stage {
  display: flex;
  flex-direction: column;
  align-items: center;
  width: 100%;
}

/* 视频容器 - 居中显示 */
.video-container {
  width: 100%;
  display: flex;
  justify-content: center;
  align-items: center;
  padding: 20px;
  background: linear-gradient(135deg, #F8FAFC 0%, #E2E8F0 100%);
  border-radius: 20px 20px 0 0;
}

.stack {
  position: relative;
  width: 100%;
  max-width: 800px;
  border-radius: 15px;
  overflow: hidden;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.15);
  border: 3px solid #0EA5E9;
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

/* 信息面板 - 居中对齐 */
.info-panel {
  width: 100%;
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding: 25px;
  background: white;
  border-radius: 0 0 20px 20px;
}

.info-row {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 15px;
}

.info-item {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 12px 16px;
  background: linear-gradient(135deg, #F1F5F9 0%, #E2E8F0 100%);
  border-radius: 12px;
  transition: all 0.3s;
  border: 1px solid #CBD5E1;
}

.info-item:hover {
  background: linear-gradient(135deg, #E0F2FE 0%, #BAE6FD 100%);
  border-color: #0EA5E9;
  transform: translateX(3px);
}

.info-icon {
  font-size: 20px;
  flex-shrink: 0;
}

.info-text {
  font-size: 14px;
  font-weight: 600;
  color: #334155;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

/* 响应式 */
@media (max-width: 768px) {
  .info-row {
    grid-template-columns: 1fr;
  }

  .video-container {
    padding: 15px;
  }

  .info-panel {
    padding: 20px;
  }
}
</style>