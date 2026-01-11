<script setup>
import { computed } from "vue";

const props = defineProps({
  params: Object,
  debounceLabel: String,
  backendDebounce: Number,
  thumbScores: Object,
});

const emit = defineEmits(["update:params", "updateBackendDebounce"]);
</script>

<template>
  <div class="control-panel">
    <div class="status-section">
      <h4>📡 实时状态</h4>
      
      <div class="status-grid">
        <div class="status-item">
          <div class="status-label">防抖时间</div>
          <div class="status-value">{{ debounceLabel }}</div>
        </div>

        <div class="status-item">
          <div class="status-label">投票窗口</div>
          <div class="status-value">{{ params.windowSize }} 帧</div>
        </div>

        <div class="status-item">
          <div class="status-label">发送间隔</div>
          <div class="status-value">{{ params.sendMinIntervalMs }}ms</div>
        </div>

        <div class="status-item">
          <div class="status-label">发送UNKNOWN</div>
          <div class="status-value">{{ params.sendUnknown ? '✅ 是' : '❌ 否' }}</div>
        </div>
      </div>
    </div>

    <div class="thumb-section">
      <h4>👍 拇指实时数据</h4>
      
      <div class="thumb-grid">
        <div class="thumb-item">
          <div class="thumb-label">向上</div>
          <div class="thumb-bar">
            <div class="thumb-fill" :style="{ width: Math.abs(thumbScores?.up || 0) * 100 + '%' }"></div>
            <span class="thumb-value">{{ (thumbScores?.up || 0).toFixed(3) }}</span>
          </div>
        </div>

        <div class="thumb-item">
          <div class="thumb-label">横向</div>
          <div class="thumb-bar">
            <div class="thumb-fill" :style="{ width: Math.abs(thumbScores?.side || 0) * 100 + '%', background: '#06B6D4' }"></div>
            <span class="thumb-value">{{ (thumbScores?.side || 0).toFixed(3) }}</span>
          </div>
        </div>

        <div class="thumb-item">
          <div class="thumb-label">张开</div>
          <div class="thumb-bar">
            <div class="thumb-fill" :style="{ width: (thumbScores?.open || 0) * 100 + '%', background: '#10B981' }"></div>
            <span class="thumb-value">{{ (thumbScores?.open || 0).toFixed(3) }}</span>
          </div>
        </div>

        <div class="thumb-item">
          <div class="thumb-label">外展角度</div>
          <div class="thumb-bar">
            <div class="thumb-fill" :style="{ width: (thumbScores?.abdDeg || 0) + '%', background: '#F59E0B' }"></div>
            <span class="thumb-value">{{ (thumbScores?.abdDeg || 0).toFixed(1) }}°</span>
          </div>
        </div>
      </div>
    </div>

    <div class="info-note">
      <span class="note-icon">💡</span>
      <span class="note-text">系统运行参数已优化，实时显示关键指标</span>
    </div>
  </div>
</template>

<style scoped>
.control-panel {
  display: flex;
  flex-direction: column;
  gap: 20px;
}

/* 状态区域 */
.status-section h4,
.thumb-section h4 {
  font-size: 16px;
  font-weight: 700;
  color: #1E293B;
  margin-bottom: 15px;
}

.status-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 12px;
}

.status-item {
  background: linear-gradient(135deg, #F1F5F9 0%, #E2E8F0 100%);
  padding: 12px 16px;
  border-radius: 12px;
  border: 1px solid #CBD5E1;
  transition: all 0.3s;
}

.status-item:hover {
  background: linear-gradient(135deg, #E0F2FE 0%, #BAE6FD 100%);
  border-color: #0EA5E9;
  transform: scale(1.02);
}

.status-label {
  font-size: 12px;
  color: #64748B;
  font-weight: 500;
  margin-bottom: 4px;
}

.status-value {
  font-size: 16px;
  font-weight: 700;
  color: #0F172A;
}

/* 拇指数据区域 */
.thumb-section {
  margin-top: 10px;
}

.thumb-grid {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.thumb-item {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.thumb-label {
  font-size: 13px;
  color: #475569;
  font-weight: 600;
}

.thumb-bar {
  position: relative;
  height: 32px;
  background: #F1F5F9;
  border-radius: 8px;
  overflow: hidden;
  border: 1px solid #CBD5E1;
}

.thumb-fill {
  position: absolute;
  left: 0;
  top: 0;
  height: 100%;
  background: #0EA5E9;
  transition: width 0.3s ease;
  border-radius: 8px;
}

.thumb-value {
  position: absolute;
  right: 12px;
  top: 50%;
  transform: translateY(-50%);
  font-size: 13px;
  font-weight: 700;
  color: #0F172A;
  z-index: 1;
}

/* 提示信息 */
.info-note {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 12px 16px;
  background: linear-gradient(135deg, #FEF3C7 0%, #FDE68A 100%);
  border-radius: 12px;
  border: 1px solid #FCD34D;
}

.note-icon {
  font-size: 20px;
  flex-shrink: 0;
}

.note-text {
  font-size: 13px;
  color: #92400E;
  font-weight: 500;
  line-height: 1.5;
}

/* 响应式 */
@media (max-width: 768px) {
  .status-grid {
    grid-template-columns: 1fr;
  }
}
</style>