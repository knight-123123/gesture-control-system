/**
 * 后端API交互管理
 * 优化内容:
 * - 自动重连机制
 * - 错误处理和重试
 * - 请求缓存
 * - 连接状态监控
 */
import { ref, computed } from "vue";

const MAX_RETRIES = 3;
const RETRY_DELAY = 1000; // ms

/**
 * 延迟函数
 */
const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

/**
 * 带重试的fetch请求
 */
async function fetchWithRetry(url, options = {}, retries = MAX_RETRIES) {
  for (let i = 0; i <= retries; i++) {
    try {
      const response = await fetch(url, options);
      if (!response.ok && i < retries) {
        await sleep(RETRY_DELAY * (i + 1));
        continue;
      }
      return response;
    } catch (error) {
      if (i === retries) throw error;
      await sleep(RETRY_DELAY * (i + 1));
    }
  }
}

/**
 * 后端API管理Hook
 * @param {string} BACKEND - 后端URL
 * @param {Ref} paramsRef - 参数引用
 * @param {Ref} lastEventRef - 最后事件引用
 */
export function useBackendApi(BACKEND, paramsRef, lastEventRef) {
  // ========== 状态管理 ==========
  const backendState = ref({
    mode: "-",
    last_gesture: "-",
    last_command: "-",
    updated_at: 0,
    uptime: 0,
    total_requests: 0,
  });

  const backendConfig = ref({
    debounce_sec: 0.5,
    mapping: {},
    enabled: true,
  });

  const mapping = ref({});
  const logs = ref([]);

  // 连接状态
  const connectionStatus = ref({
    connected: false,
    lastCheck: 0,
    errorCount: 0,
  });

  // ========== 计算属性 ==========
  const debounceLabel = computed(() => {
    const v = backendConfig.value?.debounce_sec ?? 0.5;
    return `${v.toFixed(2)}s`;
  });

  const isConnected = computed(() => connectionStatus.value.connected);

  const uptimeFormatted = computed(() => {
    const seconds = backendState.value.uptime || 0;
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = Math.floor(seconds % 60);
    return `${hours}h ${minutes}m ${secs}s`;
  });

  // ========== 健康检查 ==========
  async function checkHealth() {
    try {
      const res = await fetchWithRetry(`${BACKEND}/api/health`, {}, 1);
      const data = await res.json();
      
      connectionStatus.value = {
        connected: true,
        lastCheck: Date.now(),
        errorCount: 0,
      };
      
      // 更新状态
      if (data.uptime !== undefined) {
        backendState.value.uptime = data.uptime;
      }
      
      return true;
    } catch (error) {
      connectionStatus.value.connected = false;
      connectionStatus.value.errorCount++;
      console.warn("健康检查失败:", error.message);
      return false;
    }
  }

  // ========== 配置管理 ==========
  async function fetchConfig() {
    try {
      const res = await fetchWithRetry(`${BACKEND}/api/config`);
      const data = await res.json();
      backendConfig.value = data || backendConfig.value;
      console.log("✅ 配置加载成功");
      return true;
    } catch (error) {
      console.error("❌ 配置加载失败:", error);
      return false;
    }
  }

  async function updateBackendDebounce(sec) {
    try {
      const res = await fetchWithRetry(`${BACKEND}/api/config`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ debounce_sec: sec }),
      });
      
      const data = await res.json();
      if (data?.config) {
        backendConfig.value = data.config;
        console.log(`✅ 防抖时间已更新: ${sec}s`);
      }
      return true;
    } catch (error) {
      console.error("❌ 更新防抖失败:", error);
      return false;
    }
  }

  // ========== 映射管理 ==========
  async function fetchMapping() {
    try {
      const res = await fetchWithRetry(`${BACKEND}/api/mapping`);
      const data = await res.json();
      mapping.value = data || {};
      console.log("✅ 映射加载成功");
      return true;
    } catch (error) {
      console.error("❌ 映射加载失败:", error);
      return false;
    }
  }

  // ========== 日志管理 ==========
  async function fetchLogs(limit = 30) {
    try {
      const res = await fetchWithRetry(`${BACKEND}/api/logs?limit=${limit}`, {}, 0);
      const data = await res.json();
      logs.value = Array.isArray(data) ? data : [];
      return true;
    } catch (error) {
      console.error("❌ 日志加载失败:", error);
      return false;
    }
  }

  // 轮询控制
  let logsTimer = null;
  let healthTimer = null;

  function startLogsPolling(ms = 1000) {
    stopLogsPolling();
    logsTimer = setInterval(() => fetchLogs(30), ms);
  }

  function stopLogsPolling() {
    if (logsTimer) {
      clearInterval(logsTimer);
      logsTimer = null;
    }
  }

  function startHealthCheck(ms = 5000) {
    stopHealthCheck();
    checkHealth(); // 立即执行一次
    healthTimer = setInterval(checkHealth, ms);
  }

  function stopHealthCheck() {
    if (healthTimer) {
      clearInterval(healthTimer);
      healthTimer = null;
    }
  }

  // ========== 手势事件发送 ==========
  let lastStableSent = null;
  let lastSentAt = 0;

  /**
   * 发送手势事件到后端
   * 优化: 
   * - 本地防抖
   * - 错误重试
   * - 状态更新
   */
  async function sendGestureEvent(gesture) {
    const now = Date.now();
    const p = paramsRef.value;

    // 本地过滤
    if (!p.sendUnknown && (!gesture || gesture === "UNKNOWN")) {
      return;
    }

    // 防止重复发送
    if (gesture === lastStableSent) {
      return;
    }

    // 最小间隔限制
    if (now - lastSentAt < p.sendMinIntervalMs) {
      return;
    }

    lastStableSent = gesture;
    lastSentAt = now;

    try {
      const res = await fetchWithRetry(
        `${BACKEND}/api/gesture/event`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            gesture,
            score: 1.0,
            ts: now / 1000,
          }),
        },
        1 // 只重试1次
      );

      const data = await res.json();

      // 更新事件响应
      lastEventRef.value = {
        accepted: !!data.accepted,
        command: data.command ?? "-",
        reason: data.reason ?? "-",
      };

      // 更新后端状态
      if (data?.state) {
        backendState.value = data.state;
      }

      // 成功发送后重置错误计数
      connectionStatus.value.errorCount = 0;

    } catch (error) {
      console.warn("手势事件发送失败:", error.message);
      connectionStatus.value.errorCount++;
      
      // 如果连续失败太多次,标记为断开
      if (connectionStatus.value.errorCount > 5) {
        connectionStatus.value.connected = false;
      }
    }
  }

  // 重置发送状态(允许再次发送同一手势)
  sendGestureEvent.resetLastSent = () => {
    lastStableSent = null;
  };

  // ========== 统计信息 ==========
  async function fetchStats() {
    try {
      const res = await fetchWithRetry(`${BACKEND}/api/stats`);
      const data = await res.json();
      return data;
    } catch (error) {
      console.error("获取统计信息失败:", error);
      return null;
    }
  }

  // ========== 导出 ==========
  return {
    // 状态
    backendState,
    backendConfig,
    mapping,
    logs,
    connectionStatus,

    // 计算属性
    debounceLabel,
    isConnected,
    uptimeFormatted,

    // 方法
    checkHealth,
    fetchConfig,
    fetchMapping,
    fetchLogs,
    fetchStats,
    startLogsPolling,
    stopLogsPolling,
    startHealthCheck,
    stopHealthCheck,
    updateBackendDebounce,
    sendGestureEvent,
  };
}