<script setup>
import { ref, computed, onBeforeUnmount, onMounted } from "vue";

import VideoStage from "../components/VideoStage.vue";
import ControlPanel from "../components/ControlPanel.vue";
import MappingTable from "../components/MappingTable.vue";
import LogsPanel from "../components/LogsPanel.vue";
import OpenCvPanel from "../components/OpenCvPanel.vue";

import { useHandsCamera } from "../composables/useHandsCamera";
import { useGestureDetector } from "../composables/useGestureDetector";
import { useGestureSmoother } from "../composables/useGestureSmoother";
import { useBackendApi } from "../composables/useBackendApi";
import { useFrameCapture } from "../composables/useFrameCapture";

const BACKEND = import.meta.env.VITE_BACKEND_URL || "http://127.0.0.1:8001";

// ========== UI 状态 ==========
const statusText = ref("初始化中...");
const fpsText = ref("FPS: -");
const gestureText = ref("Gesture: -");
const handednessText = ref("Hand: -");
const errorMessage = ref("");

const lastEvent = ref({ accepted: false, command: "-", reason: "-" });

// ========== 可调参数 ==========
const params = ref({
  okThresh: 0.65,
  windowSize: 9,
  sendMinIntervalMs: 250,
  sendUnknown: false,

  angleCosThresh: -0.75,

  thumbUpScoreThresh: 0.25,
  thumbSideScoreThresh: 0.22,
  thumbOpenThresh: 0.80,
});

// ========== 后端 API ==========
const {
  backendState,
  backendConfig,
  mapping,
  logs,
  debounceLabel,
  connectionStatus,
  isConnected,
  uptimeFormatted,

  checkHealth,
  fetchConfig,
  fetchMapping,
  startLogsPolling,
  stopLogsPolling,
  startHealthCheck,
  stopHealthCheck,
  fetchLogs,

  updateBackendDebounce,
  sendGestureEvent,
} = useBackendApi(BACKEND, params, lastEvent);

// ========== 手势识别器 ==========
const { detectGesture, thumbScores } = useGestureDetector(params);

// ========== 平滑器 ==========
const { smoothGesture, resetSmoother } = useGestureSmoother(params);

// ========== OpenCV 抓帧 ==========
const {
  cvBusy,
  cvError,
  cvResult,
  captureAndPreprocess,
} = useFrameCapture(BACKEND, () => videoEl.value);

// ========== VideoStage DOM引用 ==========
const videoEl = ref(null);
const canvasEl = ref(null);

// ========== 性能统计 ==========
const performanceStats = ref({
  avgLatency: 0,
  gestureCount: 0,
  startTime: 0,
});

// ========== MediaPipe 相机 ==========
const {
  initAndStart,
  stopAll,
} = useHandsCamera({
  onFps: (fps) => {
    fpsText.value = `FPS: ${fps}`;
  },
  onNoHand: () => {
    statusText.value = "未检测到手（请把手放到摄像头前）";
    gestureText.value = "Gesture: -";
    handednessText.value = "Hand: -";
    resetSmoother();
    sendGestureEvent.resetLastSent();
  },
  onHandResults: ({ landmarks, handednessLabel }) => {
    const startTime = performance.now();
    
    statusText.value = "检测到手 ✅";
    handednessText.value = `Hand: ${handednessLabel}`;

    const gRaw = detectGesture(landmarks, handednessLabel);
    const gStable = smoothGesture(gRaw);

    gestureText.value = `Gesture: ${gStable} (raw: ${gRaw})`;

    // 发送手势事件
    sendGestureEvent(gStable);

    // 更新性能统计
    const latency = performance.now() - startTime;
    performanceStats.value.avgLatency = 
      (performanceStats.value.avgLatency * 0.9 + latency * 0.1);
    performanceStats.value.gestureCount++;
  },
});

// ========== 组件就绪回调 ==========
function onStageReady({ video, canvas }) {
  videoEl.value = video;
  canvasEl.value = canvas;
}

// ========== 生命周期 ==========
onMounted(async () => {
  statusText.value = "启动中...";
  performanceStats.value.startTime = Date.now();

  // 检查后端连接
  const healthOk = await checkHealth();
  if (!healthOk) {
    errorMessage.value = "无法连接到后端服务,请确保后端已启动";
    statusText.value = "后端连接失败";
    return;
  }

  // 加载配置
  await fetchConfig();
  await fetchMapping();
  await fetchLogs();

  // 启动轮询
  startLogsPolling(1000);
  startHealthCheck(5000);

  statusText.value = "请求摄像头权限中...";
  errorMessage.value = "";
});

onBeforeUnmount(() => {
  stopLogsPolling();
  stopHealthCheck();
  stopAll();
});

// ========== 操作方法 ==========
const canStart = computed(() => !!videoEl.value && !!canvasEl.value && isConnected.value);

async function startSystem() {
  if (!canStart.value) return;

  try {
    statusText.value = "摄像头已开启，加载手势模型中...";
    await initAndStart(videoEl.value, canvasEl.value);
    statusText.value = "运行中（把手放到摄像头前）";
    errorMessage.value = "";
  } catch (error) {
    errorMessage.value = `启动失败: ${error.message}`;
    statusText.value = "启动失败";
    console.error("启动错误:", error);
  }
}

// 计算运行时间
const runtimeFormatted = computed(() => {
  if (!performanceStats.value.startTime) return "0s";
  const seconds = Math.floor((Date.now() - performanceStats.value.startTime) / 1000);
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return mins > 0 ? `${mins}m ${secs}s` : `${secs}s`;
});
</script>

<template>
  <div class="page">
    <div class="header">
      <h2>手势识别与控制系统（Web版）</h2>
      
      <!-- 连接状态指示器 -->
      <div class="connection-status" :class="{ connected: isConnected, disconnected: !isConnected }">
        <span class="status-dot"></span>
        <span>{{ isConnected ? '后端已连接' : '后端未连接' }}</span>
      </div>
    </div>

    <!-- 错误提示 -->
    <div v-if="errorMessage" class="error-banner">
      ⚠️ {{ errorMessage }}
    </div>

    <div class="grid">
      <!-- 左侧：视频区域 -->
      <div class="video-section">
        <VideoStage
          @ready="onStageReady"
          :statusText="statusText"
          :fpsText="fpsText"
          :gestureText="gestureText"
          :handednessText="handednessText"
          :backendState="backendState"
          :lastEvent="lastEvent"
        />

        <div class="actions">
          <button 
            class="primary" 
            :disabled="!canStart" 
            @click="startSystem"
            :title="!isConnected ? '后端未连接' : ''"
          >
            {{ canStart ? "🚀 启动识别" : "⏳ 等待准备..." }}
          </button>

          <button 
            class="ghost" 
            :disabled="cvBusy || !canStart" 
            @click="captureAndPreprocess"
          >
            {{ cvBusy ? "🔄 处理中..." : "📸 OpenCV预处理" }}
          </button>
        </div>

        <!-- OpenCV结果面板 -->
        <OpenCvPanel :cvError="cvError" :cvResult="cvResult" />

        <!-- 性能指标 -->
        <div class="performance-panel">
          <h4>📊 性能指标</h4>
          <div class="metrics">
            <div class="metric">
              <label>运行时长:</label>
              <span>{{ runtimeFormatted }}</span>
            </div>
            <div class="metric">
              <label>处理延迟:</label>
              <span>{{ performanceStats.avgLatency.toFixed(1) }}ms</span>
            </div>
            <div class="metric">
              <label>识别次数:</label>
              <span>{{ performanceStats.gestureCount }}</span>
            </div>
            <div class="metric">
              <label>后端运行:</label>
              <span>{{ uptimeFormatted }}</span>
            </div>
          </div>
        </div>
      </div>

      <!-- 右侧：控制面板 -->
      <div class="control-section">
        <ControlPanel
          v-model:params="params"
          :debounceLabel="debounceLabel"
          :backendDebounce="backendConfig.debounce_sec"
          @updateBackendDebounce="updateBackendDebounce"
          :thumbScores="thumbScores"
        />

        <MappingTable :mapping="mapping" />

        <LogsPanel :logs="logs" />

        <div class="export-section">
          <a 
            :href="`${BACKEND}/api/logs/export.csv?limit=200`" 
            target="_blank"
            class="export-link"
          >
            📥 导出CSV（最近200条）
          </a>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.page {
  padding: 20px;
  max-width: 1600px;
  margin: 0 auto;
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, sans-serif;
}

.header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 20px;
}

h2 {
  margin: 0;
  color: #2c3e50;
}

/* 连接状态 */
.connection-status {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 16px;
  border-radius: 20px;
  font-size: 14px;
  font-weight: 500;
  transition: all 0.3s;
}

.connection-status.connected {
  background: #d4edda;
  color: #155724;
}

.connection-status.disconnected {
  background: #f8d7da;
  color: #721c24;
}

.status-dot {
  width: 10px;
  height: 10px;
  border-radius: 50%;
  animation: pulse 2s infinite;
}

.connected .status-dot {
  background: #28a745;
}

.disconnected .status-dot {
  background: #dc3545;
}

@keyframes pulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.5; }
}

/* 错误提示 */
.error-banner {
  background: #fff3cd;
  border: 1px solid #ffc107;
  color: #856404;
  padding: 12px 20px;
  border-radius: 8px;
  margin-bottom: 20px;
  font-size: 14px;
}

/* 网格布局 */
.grid {
  display: grid;
  grid-template-columns: 1fr 400px;
  gap: 20px;
}

@media (max-width: 1200px) {
  .grid {
    grid-template-columns: 1fr;
  }
}

/* 视频区域 */
.video-section {
  display: flex;
  flex-direction: column;
  gap: 15px;
}

/* 操作按钮 */
.actions {
  display: flex;
  gap: 10px;
  flex-wrap: wrap;
}

.primary {
  flex: 1;
  padding: 12px 20px;
  border: none;
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  color: #fff;
  border-radius: 10px;
  font-size: 16px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.3s;
  box-shadow: 0 4px 15px rgba(102, 126, 234, 0.4);
}

.primary:hover:not(:disabled) {
  transform: translateY(-2px);
  box-shadow: 0 6px 20px rgba(102, 126, 234, 0.6);
}

.primary:disabled {
  opacity: 0.6;
  cursor: not-allowed;
  transform: none;
}

.ghost {
  flex: 1;
  padding: 12px 20px;
  border: 2px solid #667eea;
  background: #fff;
  color: #667eea;
  border-radius: 10px;
  font-size: 16px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.3s;
}

.ghost:hover:not(:disabled) {
  background: #667eea;
  color: #fff;
}

.ghost:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

/* 性能面板 */
.performance-panel {
  background: linear-gradient(135deg, #f5f7fa 0%, #c3cfe2 100%);
  padding: 15px;
  border-radius: 12px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
}

.performance-panel h4 {
  margin: 0 0 15px 0;
  color: #2c3e50;
  font-size: 16px;
}

.metrics {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 12px;
}

.metric {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.metric label {
  font-size: 12px;
  color: #6c757d;
  font-weight: 500;
}

.metric span {
  font-size: 18px;
  color: #2c3e50;
  font-weight: 700;
}

/* 控制区域 */
.control-section {
  display: flex;
  flex-direction: column;
  gap: 15px;
}

/* 导出链接 */
.export-section {
  padding: 15px;
  background: #f8f9fa;
  border-radius: 10px;
  text-align: center;
}

.export-link {
  display: inline-block;
  padding: 10px 20px;
  background: #28a745;
  color: white;
  text-decoration: none;
  border-radius: 8px;
  font-weight: 600;
  transition: all 0.3s;
}

.export-link:hover {
  background: #218838;
  transform: translateY(-2px);
  box-shadow: 0 4px 12px rgba(40, 167, 69, 0.3);
}
</style>