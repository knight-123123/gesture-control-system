import { ref, computed } from "vue";

export function useBackendApi(BACKEND, paramsRef, lastEventRef) {
  const backendState = ref({ mode: "-", last_gesture: "-", last_command: "-", updated_at: 0 });
  const backendConfig = ref({ debounce_sec: 0.5, mapping: {} });
  const mapping = ref({});
  const logs = ref([]);

  const debounceLabel = computed(() => {
    const v = backendConfig.value?.debounce_sec ?? 0.5;
    return `${v.toFixed(2)}s`;
  });

  async function fetchConfig() {
    try {
      const res = await fetch(`${BACKEND}/api/config`);
      backendConfig.value = (await res.json()) || backendConfig.value;
    } catch {}
  }

  async function fetchMapping() {
    try {
      const res = await fetch(`${BACKEND}/api/mapping`);
      mapping.value = (await res.json()) || {};
    } catch {}
  }

  async function fetchLogs(limit = 30) {
    try {
      const res = await fetch(`${BACKEND}/api/logs?limit=${limit}`);
      const data = await res.json();
      logs.value = Array.isArray(data) ? data : [];
    } catch {}
  }

  let logsTimer = null;
  function startLogsPolling(ms = 1000) {
    stopLogsPolling();
    logsTimer = setInterval(() => fetchLogs(30), ms);
  }
  function stopLogsPolling() {
    if (logsTimer) clearInterval(logsTimer);
    logsTimer = null;
  }

  async function updateBackendDebounce(sec) {
    try {
      const res = await fetch(`${BACKEND}/api/config`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ debounce_sec: sec }),
      });
      const data = await res.json();
      if (data?.config) backendConfig.value = data.config;
    } catch {}
  }

  // 只在稳定手势变化时发送：内部记忆
  let lastStableSent = null;
  let lastSentAt = 0;

  async function sendGestureEvent(gesture) {
    const now = Date.now();
    const p = paramsRef.value;

    if (!p.sendUnknown && (!gesture || gesture === "UNKNOWN")) return;
    if (gesture === lastStableSent) return;
    if (now - lastSentAt < p.sendMinIntervalMs) return;

    lastStableSent = gesture;
    lastSentAt = now;

    try {
      const res = await fetch(`${BACKEND}/api/gesture/event`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ gesture, score: 1.0, ts: now / 1000 }),
      });
      const data = await res.json();

      lastEventRef.value = {
        accepted: !!data.accepted,
        command: data.command ?? "-",
        reason: data.reason ?? "-",
      };

      if (data?.state) backendState.value = data.state;
    } catch (e) {
      // 静默
      console.warn("sendGestureEvent failed", e);
    }
  }

  // 给上层一个 reset 方法（丢手后允许再次触发同一手势）
  sendGestureEvent.resetLastSent = () => {
    lastStableSent = null;
  };

  return {
    backendState,
    backendConfig,
    mapping,
    logs,
    debounceLabel,

    fetchConfig,
    fetchMapping,
    fetchLogs,
    startLogsPolling,
    stopLogsPolling,
    updateBackendDebounce,
    sendGestureEvent,
  };
}
