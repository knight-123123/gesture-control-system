<script setup>
import { computed } from "vue";

const props = defineProps({
  params: Object,
  debounceLabel: String,
  backendDebounce: Number,
  thumbScores: Object,
});

const emit = defineEmits(["update:params", "updateBackendDebounce"]);

const p = computed({
  get: () => props.params,
  set: (v) => emit("update:params", v),
});

function setParam(key, val) {
  emit("update:params", { ...props.params, [key]: val });
}
</script>

<template>
  <h3>识别参数（拆分后）</h3>

  <div class="ctrl">
    <label>四指角度阈值（cos）：{{ p.angleCosThresh.toFixed(2) }}</label>
    <input type="range" min="-0.90" max="-0.60" step="0.01"
      :value="p.angleCosThresh"
      @input="setParam('angleCosThresh', parseFloat($event.target.value))" />
  </div>

  <div class="ctrl">
    <label>OK 阈值：{{ p.okThresh.toFixed(2) }}</label>
    <input type="range" min="0.58" max="0.78" step="0.01"
      :value="p.okThresh"
      @input="setParam('okThresh', parseFloat($event.target.value))" />
  </div>

  <div class="ctrl">
    <label>投票窗口：{{ p.windowSize }}</label>
    <input type="range" min="5" max="15" step="1"
      :value="p.windowSize"
      @input="setParam('windowSize', parseInt($event.target.value))" />
  </div>

  <div class="ctrl">
    <label>最小发送间隔：{{ p.sendMinIntervalMs }}ms</label>
    <input type="range" min="150" max="800" step="10"
      :value="p.sendMinIntervalMs"
      @input="setParam('sendMinIntervalMs', parseInt($event.target.value))" />
  </div>

  <div class="ctrl row">
    <label>
      <input type="checkbox" :checked="p.sendUnknown" @change="setParam('sendUnknown', $event.target.checked)" />
      发送 UNKNOWN
    </label>
  </div>

  <h3 style="margin-top: 14px;">拇指融合（👍 / SIX）</h3>

  <div class="ctrl">
    <label>👍 向上阈值：{{ p.thumbUpScoreThresh.toFixed(2) }}</label>
    <input type="range" min="0.10" max="0.60" step="0.01"
      :value="p.thumbUpScoreThresh"
      @input="setParam('thumbUpScoreThresh', parseFloat($event.target.value))" />
  </div>

  <div class="ctrl">
    <label>SIX 横向阈值：{{ p.thumbSideScoreThresh.toFixed(2) }}</label>
    <input type="range" min="0.10" max="0.70" step="0.01"
      :value="p.thumbSideScoreThresh"
      @input="setParam('thumbSideScoreThresh', parseFloat($event.target.value))" />
    <div class="hint">SIX 识别不出：优先把这里调低到 0.18~0.28</div>
  </div>

  <div class="ctrl">
    <label>拇指张开阈值：{{ p.thumbOpenThresh.toFixed(2) }}</label>
    <input type="range" min="0.70" max="1.30" step="0.01"
      :value="p.thumbOpenThresh"
      @input="setParam('thumbOpenThresh', parseFloat($event.target.value))" />
  </div>

  <div class="ctrl">
    <label>实时拇指分数</label>
    <div class="score">
      up: {{ (thumbScores?.up ?? 0).toFixed(3) }} |
      side: {{ (thumbScores?.side ?? 0).toFixed(3) }} |
      open: {{ (thumbScores?.open ?? 0).toFixed(3) }}
    </div>
  </div>

  <h3 style="margin-top: 14px;">后端 debounce</h3>
  <div class="ctrl">
    <label>debounce_sec：{{ debounceLabel }}</label>
    <input type="range" min="0.10" max="1.50" step="0.05"
      :value="backendDebounce"
      @input="emit('updateBackendDebounce', parseFloat($event.target.value))" />
  </div>
</template>

<style scoped>
.ctrl {
  margin-top: 10px;
  padding: 8px 10px;
  border: 1px solid #f3f3f3;
  border-radius: 10px;
}
.ctrl label {
  display: block;
  font-size: 13px;
  color: #333;
  margin-bottom: 6px;
}
.ctrl input[type="range"] { width: 100%; }
.ctrl.row label { display: flex; gap: 8px; align-items: center; margin: 0; }
.hint { margin-top: 6px; color: #777; font-size: 12px; }
.score { font-size: 13px; color: #0b6; font-weight: 700; }
</style>
