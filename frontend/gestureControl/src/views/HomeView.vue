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

// ========== 手势参考数据 ==========
const gestureGuides = [
  { name: "THUMBS_UP", emoji: "👍", desc: "竖起大拇指", command: "GOOD" },
  { name: "SIX", emoji: "🤙", desc: "大拇指+小指", command: "SIX_GESTURE" },
  { name: "PALM", emoji: "🖐️", desc: "五指张开", command: "OPEN_HAND" },
  { name: "FIST", emoji: "✊", desc: "握拳", command: "CLOSED_HAND" },
  { name: "POINT", emoji: "👉", desc: "食指指向", command: "POINT_FORWARD" },
  { name: "V", emoji: "✌️", desc: "V字手势", command: "VICTORY" },
  { name: "OK", emoji: "👌", desc: "OK手势", command: "OK_SIGN" },
];

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

    sendGestureEvent(gStable);

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

  const healthOk = await checkHealth();
  if (!healthOk) {
    errorMessage.value = "无法连接到后端服务,请确保后端已启动";
    statusText.value = "后端连接失败";
    return;
  }

  await fetchConfig();
  await fetchMapping();
  await fetchLogs();

  startLogsPolling(3000);
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
    <!-- 背景装饰 -->
    <div class="bg-decoration">
      <div class="blob blob-1"></div>
      <div class="blob blob-2"></div>
      <div class="blob blob-3"></div>
    </div>

    <!-- 主容器 -->
    <div class="main-container">
      <!-- 顶部栏 -->
      <header class="top-bar">
        <div class="logo-section">
          <div class="logo-icon">🤚</div>
          <div class="logo-text">
            <h1>手势识别控制系统</h1>
            <p class="subtitle">Gesture Recognition & Control System</p>
          </div>
        </div>
        
        <div class="status-badges">
          <div class="badge" :class="{ 'badge-success': isConnected, 'badge-error': !isConnected }">
            <div class="badge-dot"></div>
            <span>{{ isConnected ? '后端已连接' : '后端未连接' }}</span>
          </div>
          <div class="badge badge-info">
            <span>v2.3.0</span>
          </div>
        </div>
      </header>

      <!-- 错误提示 -->
      <transition name="slide-down">
        <div v-if="errorMessage" class="alert alert-warning">
          <div class="alert-icon">⚠️</div>
          <div class="alert-content">
            <div class="alert-title">连接错误</div>
            <div class="alert-message">{{ errorMessage }}</div>
          </div>
          <button class="alert-close" @click="errorMessage = ''">×</button>
        </div>
      </transition>

      <!-- ========== 新布局：三列设计 ========== -->
      <div class="content-layout">
        <!-- 左列：视频 + 操作按钮 -->
        <div class="column-left">
          <div class="card video-card">
            <VideoStage
              @ready="onStageReady"
              :statusText="statusText"
              :fpsText="fpsText"
              :gestureText="gestureText"
              :handednessText="handednessText"
              :backendState="backendState"
              :lastEvent="lastEvent"
            />
          </div>

          <div class="action-buttons">
            <button 
              class="btn btn-primary btn-large" 
              :disabled="!canStart" 
              @click="startSystem"
            >
              <span class="btn-icon">🚀</span>
              <span>{{ canStart ? "启动识别" : "等待准备..." }}</span>
            </button>

            <button 
              class="btn btn-secondary btn-large" 
              :disabled="cvBusy || !canStart" 
              @click="captureAndPreprocess"
            >
              <span class="btn-icon">📸</span>
              <span>{{ cvBusy ? "处理中..." : "OpenCV预处理" }}</span>
            </button>
          </div>

          <transition name="fade">
            <div v-if="cvResult || cvError" class="card">
              <OpenCvPanel :cvError="cvError" :cvResult="cvResult" />
            </div>
          </transition>
        </div>

        <!-- 中列：手势参考 + 性能指标 + 系统状态 -->
        <div class="column-center">
          <!-- 手势参考卡片 -->
          <div class="card gesture-guide-card">
            <div class="card-header">
              <h3>🎯 支持的手势</h3>
            </div>
            <div class="gesture-grid">
              <div 
                v-for="g in gestureGuides" 
                :key="g.name" 
                class="gesture-item"
                :class="{ active: gestureText.includes(g.name) }"
              >
                <span class="gesture-emoji">{{ g.emoji }}</span>
                <div class="gesture-info">
                  <span class="gesture-name">{{ g.name }}</span>
                  <span class="gesture-desc">{{ g.desc }}</span>
                </div>
              </div>
            </div>
          </div>

          <!-- 性能指标卡片 -->
          <div class="card metrics-card">
            <div class="card-header">
              <h3>📊 性能指标</h3>
              <div class="header-badge">实时</div>
            </div>
            <div class="metrics-grid">
              <div class="metric-item">
                <div class="metric-icon icon-blue">⏱️</div>
                <div class="metric-info">
                  <div class="metric-label">运行时长</div>
                  <div class="metric-value">{{ runtimeFormatted }}</div>
                </div>
              </div>

              <div class="metric-item">
                <div class="metric-icon icon-cyan">⚡</div>
                <div class="metric-info">
                  <div class="metric-label">处理延迟</div>
                  <div class="metric-value">{{ performanceStats.avgLatency.toFixed(1) }}ms</div>
                </div>
              </div>

              <div class="metric-item">
                <div class="metric-icon icon-teal">🎯</div>
                <div class="metric-info">
                  <div class="metric-label">识别次数</div>
                  <div class="metric-value">{{ performanceStats.gestureCount }}</div>
                </div>
              </div>

              <div class="metric-item">
                <div class="metric-icon icon-green">🖥️</div>
                <div class="metric-info">
                  <div class="metric-label">后端运行</div>
                  <div class="metric-value">{{ uptimeFormatted }}</div>
                </div>
              </div>
            </div>
          </div>

          <!-- 系统状态卡片 -->
          <div class="card">
            <div class="card-header">
              <h3>⚙️ 系统状态</h3>
            </div>
            <ControlPanel
              v-model:params="params"
              :debounceLabel="debounceLabel"
              :backendDebounce="backendConfig.debounce_sec"
              @updateBackendDebounce="updateBackendDebounce"
              :thumbScores="thumbScores"
            />
          </div>
        </div>

        <!-- 右列：手势映射 + 日志 -->
        <div class="column-right">
          <!-- 手势映射卡片 -->
          <div class="card">
            <div class="card-header">
              <h3>🎮 手势映射</h3>
            </div>
            <MappingTable :mapping="mapping" />
          </div>

          <!-- 日志卡片 -->
          <div class="card logs-card">
            <div class="card-header">
              <h3>📝 识别日志</h3>
              <a 
                :href="`${BACKEND}/api/logs/export.csv?limit=200`" 
                target="_blank"
                class="export-btn"
              >
                📥 导出
              </a>
            </div>
            <LogsPanel :logs="logs" />
          </div>
        </div>
      </div>

      <!-- 底部信息 -->
      <footer class="footer">
        <p>手势识别控制系统 v2.3.0 | 基于 MediaPipe + Vue 3 + FastAPI</p>
      </footer>
    </div>
  </div>
</template>

<style scoped>
/* ========== 全局样式 ========== */
* {
  margin: 0;
  padding: 0;
  box-sizing: border-box;
}

.page {
  min-height: 100vh;
  background: linear-gradient(135deg, #0F2027 0%, #203A43 50%, #2C5364 100%);
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', 'Oxygen', 'Ubuntu', sans-serif;
  position: relative;
  overflow-x: hidden;
}

/* ========== 背景装饰 ========== */
.bg-decoration {
  position: fixed;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  pointer-events: none;
  z-index: 0;
}

.blob {
  position: absolute;
  border-radius: 50%;
  filter: blur(100px);
  opacity: 0.15;
  animation: float 25s infinite ease-in-out;
}

.blob-1 {
  width: 500px;
  height: 500px;
  background: #0EA5E9;
  top: -150px;
  left: -150px;
  animation-delay: 0s;
}

.blob-2 {
  width: 450px;
  height: 450px;
  background: #06B6D4;
  bottom: -150px;
  right: -150px;
  animation-delay: 8s;
}

.blob-3 {
  width: 400px;
  height: 400px;
  background: #14B8A6;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  animation-delay: 16s;
}

@keyframes float {
  0%, 100% { transform: translate(0, 0) scale(1); }
  33% { transform: translate(60px, -60px) scale(1.15); }
  66% { transform: translate(-60px, 60px) scale(0.9); }
}

/* ========== 主容器 ========== */
.main-container {
  position: relative;
  z-index: 1;
  max-width: 1920px;
  margin: 0 auto;
  padding: 20px;
}

/* ========== 顶部栏 ========== */
.top-bar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  background: rgba(255, 255, 255, 0.98);
  backdrop-filter: blur(20px);
  padding: 15px 25px;
  border-radius: 16px;
  margin-bottom: 20px;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.15);
  border: 1px solid rgba(255, 255, 255, 0.3);
}

.logo-section {
  display: flex;
  align-items: center;
  gap: 12px;
}

.logo-icon {
  font-size: 40px;
  animation: wave 2s infinite;
}

@keyframes wave {
  0%, 100% { transform: rotate(0deg); }
  25% { transform: rotate(20deg); }
  75% { transform: rotate(-20deg); }
}

.logo-text h1 {
  font-size: 24px;
  font-weight: 700;
  background: linear-gradient(135deg, #0EA5E9 0%, #2563EB 100%);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  background-clip: text;
  margin: 0;
}

.subtitle {
  font-size: 12px;
  color: #64748B;
  margin: 2px 0 0 0;
}

/* 状态徽章 */
.status-badges {
  display: flex;
  gap: 10px;
}

.badge {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 8px 16px;
  border-radius: 50px;
  font-size: 13px;
  font-weight: 600;
}

.badge-success {
  background: linear-gradient(135deg, #10B981 0%, #059669 100%);
  color: white;
  box-shadow: 0 4px 15px rgba(16, 185, 129, 0.3);
}

.badge-error {
  background: linear-gradient(135deg, #EF4444 0%, #DC2626 100%);
  color: white;
  box-shadow: 0 4px 15px rgba(239, 68, 68, 0.3);
}

.badge-info {
  background: rgba(14, 165, 233, 0.15);
  color: #0EA5E9;
  border: 2px solid #0EA5E9;
}

.badge-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: white;
  animation: pulse-dot 2s infinite;
}

@keyframes pulse-dot {
  0%, 100% { opacity: 1; transform: scale(1); }
  50% { opacity: 0.7; transform: scale(1.3); }
}

/* ========== 警告框 ========== */
.alert {
  display: flex;
  align-items: center;
  gap: 15px;
  background: white;
  padding: 16px 20px;
  border-radius: 12px;
  margin-bottom: 20px;
  box-shadow: 0 4px 20px rgba(0, 0, 0, 0.1);
}

.alert-warning {
  border-left: 4px solid #F59E0B;
}

.alert-icon {
  font-size: 28px;
}

.alert-content {
  flex: 1;
}

.alert-title {
  font-weight: 700;
  font-size: 15px;
  color: #1E293B;
}

.alert-message {
  font-size: 13px;
  color: #64748B;
}

.alert-close {
  background: none;
  border: none;
  font-size: 24px;
  color: #94A3B8;
  cursor: pointer;
}

/* ========== 新布局：三列设计 ========== */
.content-layout {
  display: grid;
  grid-template-columns: minmax(400px, 1fr) minmax(320px, 400px) minmax(280px, 350px);
  gap: 20px;
  align-items: start;
}

.column-left,
.column-center,
.column-right {
  display: flex;
  flex-direction: column;
  gap: 20px;
}

/* ========== 卡片样式 ========== */
.card {
  background: rgba(255, 255, 255, 0.98);
  backdrop-filter: blur(20px);
  border-radius: 16px;
  padding: 20px;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.12);
  border: 1px solid rgba(255, 255, 255, 0.3);
  transition: transform 0.3s, box-shadow 0.3s;
}

.card:hover {
  transform: translateY(-2px);
  box-shadow: 0 12px 40px rgba(0, 0, 0, 0.18);
}

.video-card {
  padding: 0;
  overflow: hidden;
}

.card-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 15px;
  padding-bottom: 12px;
  border-bottom: 2px solid #E2E8F0;
}

.card-header h3 {
  font-size: 16px;
  font-weight: 700;
  color: #1E293B;
  margin: 0;
}

.header-badge {
  background: linear-gradient(135deg, #0EA5E9 0%, #2563EB 100%);
  color: white;
  padding: 4px 10px;
  border-radius: 20px;
  font-size: 11px;
  font-weight: 600;
}

/* ========== 手势参考卡片 ========== */
.gesture-guide-card {
  background: linear-gradient(135deg, rgba(255, 255, 255, 0.98) 0%, rgba(240, 249, 255, 0.98) 100%);
}

.gesture-grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 10px;
}

.gesture-item {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 12px;
  background: white;
  border-radius: 10px;
  border: 2px solid #E2E8F0;
  transition: all 0.3s;
}

.gesture-item:hover {
  border-color: #0EA5E9;
  transform: scale(1.02);
}

.gesture-item.active {
  border-color: #10B981;
  background: linear-gradient(135deg, #ECFDF5 0%, #D1FAE5 100%);
  box-shadow: 0 4px 15px rgba(16, 185, 129, 0.2);
}

.gesture-emoji {
  font-size: 24px;
  flex-shrink: 0;
}

.gesture-info {
  display: flex;
  flex-direction: column;
  min-width: 0;
}

.gesture-name {
  font-size: 12px;
  font-weight: 700;
  color: #1E293B;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.gesture-desc {
  font-size: 11px;
  color: #64748B;
}

/* ========== 性能指标卡片 ========== */
.metrics-grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 12px;
}

.metric-item {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 12px;
  background: #F8FAFC;
  border-radius: 12px;
  border: 1px solid #E2E8F0;
  transition: transform 0.3s, box-shadow 0.3s;
}

.metric-item:hover {
  transform: translateY(-3px);
  box-shadow: 0 6px 20px rgba(0, 0, 0, 0.1);
}

.metric-icon {
  width: 42px;
  height: 42px;
  border-radius: 10px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 20px;
  flex-shrink: 0;
}

.icon-blue { background: linear-gradient(135deg, #0EA5E9 0%, #2563EB 100%); }
.icon-cyan { background: linear-gradient(135deg, #06B6D4 0%, #3B82F6 100%); }
.icon-teal { background: linear-gradient(135deg, #14B8A6 0%, #0891B2 100%); }
.icon-green { background: linear-gradient(135deg, #10B981 0%, #059669 100%); }

.metric-info {
  flex: 1;
  min-width: 0;
}

.metric-label {
  font-size: 11px;
  color: #64748B;
  font-weight: 500;
}

.metric-value {
  font-size: 18px;
  font-weight: 700;
  color: #1E293B;
}

/* ========== 操作按钮 ========== */
.action-buttons {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 12px;
}

.btn {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding: 14px 20px;
  border: none;
  border-radius: 12px;
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.3s;
}

.btn-icon {
  font-size: 20px;
}

.btn-primary {
  background: linear-gradient(135deg, #0EA5E9 0%, #2563EB 100%);
  color: white;
  box-shadow: 0 4px 15px rgba(14, 165, 233, 0.4);
}

.btn-primary:hover:not(:disabled) {
  transform: translateY(-2px);
  box-shadow: 0 6px 25px rgba(14, 165, 233, 0.6);
}

.btn-secondary {
  background: linear-gradient(135deg, #06B6D4 0%, #0891B2 100%);
  color: white;
  box-shadow: 0 4px 15px rgba(6, 182, 212, 0.4);
}

.btn-secondary:hover:not(:disabled) {
  transform: translateY(-2px);
  box-shadow: 0 6px 25px rgba(6, 182, 212, 0.6);
}

.btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
  transform: none !important;
}

/* ========== 日志卡片 ========== */
.logs-card {
  flex: 1;
  max-height: 500px;
  display: flex;
  flex-direction: column;
}

.logs-card :deep(.logs) {
  max-height: 380px;
}

/* ========== 导出按钮 ========== */
.export-btn {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 6px 12px;
  background: linear-gradient(135deg, #10B981 0%, #059669 100%);
  color: white;
  text-decoration: none;
  border-radius: 8px;
  font-size: 12px;
  font-weight: 600;
  transition: all 0.3s;
}

.export-btn:hover {
  transform: translateY(-1px);
  box-shadow: 0 4px 12px rgba(16, 185, 129, 0.4);
}

/* ========== 底部 ========== */
.footer {
  text-align: center;
  padding: 20px;
  color: rgba(255, 255, 255, 0.6);
  font-size: 13px;
}

/* ========== 动画 ========== */
.fade-enter-active, .fade-leave-active {
  transition: opacity 0.3s, transform 0.3s;
}

.fade-enter-from {
  opacity: 0;
  transform: translateY(-10px);
}

.fade-leave-to {
  opacity: 0;
  transform: translateY(10px);
}

.slide-down-enter-active, .slide-down-leave-active {
  transition: all 0.3s;
}

.slide-down-enter-from, .slide-down-leave-to {
  opacity: 0;
  transform: translateY(-20px);
}

/* ========== 响应式布局 ========== */
@media (max-width: 1400px) {
  .content-layout {
    grid-template-columns: 1fr 1fr;
  }
  
  .column-right {
    grid-column: span 2;
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 20px;
  }
}

@media (max-width: 1024px) {
  .content-layout {
    grid-template-columns: 1fr;
  }
  
  .column-right {
    grid-column: span 1;
    grid-template-columns: 1fr;
  }
}

@media (max-width: 768px) {
  .top-bar {
    flex-direction: column;
    gap: 12px;
    text-align: center;
  }

  .action-buttons {
    grid-template-columns: 1fr;
  }

  .metrics-grid {
    grid-template-columns: 1fr;
  }
  
  .gesture-grid {
    grid-template-columns: 1fr;
  }

  .logo-text h1 {
    font-size: 20px;
  }
}
</style>