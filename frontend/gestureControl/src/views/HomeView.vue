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

const BACKEND = "http://127.0.0.1:8001";

/** ====== UI 状态 ====== */
const statusText = ref("初始化中...");
const fpsText = ref("FPS: -");
const gestureText = ref("Gesture: -");
const handednessText = ref("Hand: -");

const lastEvent = ref({ accepted: false, command: "-", reason: "-" });

/** ====== 可调参数（前端） ====== */
const params = ref({
  okThresh: 0.65,
  windowSize: 9,
  sendMinIntervalMs: 250,
  sendUnknown: false,

  angleCosThresh: -0.75, // 四指角度阈值

  // 拇指融合阈值
  thumbUpScoreThresh: 0.25,
  thumbSideScoreThresh: 0.22, // ✅ 默认调低一点，SIX 更容易出来
  thumbOpenThresh: 0.80,      // ✅ 默认调低一点，SIX 更容易出来
});

/** ====== 后端 API（logs/mapping/config/发送事件） ====== */
const {
  backendState,
  backendConfig,
  mapping,
  logs,
  debounceLabel,

  fetchConfig,
  fetchMapping,
  startLogsPolling,
  stopLogsPolling,
  fetchLogs,

  updateBackendDebounce,
  sendGestureEvent,
} = useBackendApi(BACKEND, params, lastEvent);

/** ====== 手势识别器（角度 + handedness + 拇指融合 + SIX兜底） ====== */
const { detectGesture, thumbScores } = useGestureDetector(params);

/** ====== 平滑器（窗口投票） ====== */
const { smoothGesture, resetSmoother } = useGestureSmoother(params);

/** ====== OpenCV 抓帧上传 ====== */
const {
  cvBusy,
  cvError,
  cvResult,
  captureAndPreprocess,
} = useFrameCapture(BACKEND, () => videoEl.value);

/** ====== VideoStage 提供 video/canvas DOM ====== */
const videoEl = ref(null);
const canvasEl = ref(null);

/** ====== MediaPipe 相机/Hands ====== */
const {
  initAndStart,
  stopAll,
} = useHandsCamera({
  onFps: (fps) => (fpsText.value = `FPS: ${fps}`),
  onNoHand: () => {
    statusText.value = "未检测到手（请把手放到摄像头前）";
    gestureText.value = "Gesture: -";
    handednessText.value = "Hand: -";
    resetSmoother();
    // 允许同一个手势下一次再触发
    sendGestureEvent.resetLastSent();
  },
  onHandResults: ({ landmarks, handednessLabel }) => {
    statusText.value = "检测到手 ✅";
    handednessText.value = `Hand: ${handednessLabel}`;

    const gRaw = detectGesture(landmarks, handednessLabel);
    const gStable = smoothGesture(gRaw);

    gestureText.value = `Gesture: ${gStable} (raw: ${gRaw})`;

    // ✅ 只在稳定手势变化时上报（内部已处理）
    sendGestureEvent(gStable);
  },
});

/** VideoStage mounted 时把 video/canvas DOM 传出来 */
function onStageReady({ video, canvas }) {
  videoEl.value = video;
  canvasEl.value = canvas;
}

/** 启动流程 */
onMounted(async () => {
  statusText.value = "启动中...";

  await fetchConfig();
  await fetchMapping();
  await fetchLogs();
  startLogsPolling(1000);

  statusText.value = "请求摄像头权限中...";
});

onBeforeUnmount(() => {
  stopLogsPolling();
  stopAll();
});

/** 开始按钮（等 stage ready 后） */
const canStart = computed(() => !!videoEl.value && !!canvasEl.value);

async function startSystem() {
  if (!canStart.value) return;

  statusText.value = "摄像头已开启，加载手势模型中...";
  await initAndStart(videoEl.value, canvasEl.value);
  statusText.value = "运行中（把手放到摄像头前）";
}
</script>

<template>
  <div class="page">
    <h2>手势识别与控制系统（Web）</h2>

    <div class="grid">
      <!-- 左侧：视频区域 -->
      <div>
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
          <button class="primary" :disabled="!canStart" @click="startSystem">
            {{ canStart ? "启动识别" : "等待视频组件就绪..." }}
          </button>

          <button class="ghost" :disabled="cvBusy || !canStart" @click="captureAndPreprocess">
            {{ cvBusy ? "OpenCV 处理中..." : "抓帧并 OpenCV 预处理" }}
          </button>
        </div>

        <OpenCvPanel :cvError="cvError" :cvResult="cvResult" />
      </div>

      <!-- 右侧：控制面板 -->
      <div class="panel">
        <ControlPanel
          v-model:params="params"
          :debounceLabel="debounceLabel"
          :backendDebounce="backendConfig.debounce_sec"
          @updateBackendDebounce="updateBackendDebounce"
          :thumbScores="thumbScores"
        />

        <MappingTable :mapping="mapping" />

        <LogsPanel :logs="logs" />
        <div class="export">
          <a :href="`${BACKEND}/api/logs/export.csv?limit=200`" target="_blank">导出 CSV（最近 200 条）</a>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.actions {
  margin-top: 10px;
  display: flex;
  gap: 10px;
  flex-wrap: wrap;
}
.primary {
  padding: 10px 12px;
  border: 1px solid #0b6;
  background: #0b6;
  color: #fff;
  border-radius: 10px;
  cursor: pointer;
}
.primary:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}
.ghost {
  padding: 10px 12px;
  border: 1px solid #ddd;
  background: #fff;
  color: #333;
  border-radius: 10px;
  cursor: pointer;
}
.ghost:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}
.panel {
  border: 1px solid #eee;
  border-radius: 12px;
  padding: 12px;
}
.export {
  margin-top: 10px;
  font-size: 13px;
}
.export a {
  color: #0b6;
  text-decoration: none;
}
.export a:hover {
  text-decoration: underline;
}
</style>
