/**
 * 手势识别检测器
 * 优化内容:
 * - 改进识别算法
 * - 性能优化
 * - 详细文档
 * - 调试支持
 * 
 * 支持的手势:
 * - PALM: 手掌张开
 * - FIST: 握拳
 * - OK: OK手势
 * - POINT: 食指指向
 * - V: V字手势
 * - THUMBS_UP: 点赞
 * - SIX: 六的手势
 */
import { ref } from "vue";

// 调试模式
const DEBUG = false;

/**
 * 手势检测器Hook
 * @param {Ref} paramsRef - 参数配置引用
 */
export function useGestureDetector(paramsRef) {
  // 拇指分数(用于UI显示和调试)
  const thumbScores = ref({
    up: 0,
    side: 0,
    open: 0,
    abdDeg: 0,
  });

  // ========== 数学工具函数 ==========
  
  /**
   * 2D向量
   */
  function vec2(a, b) {
    return { x: b.x - a.x, y: b.y - a.y };
  }

  /**
   * 2D点积
   */
  function dot2(u, v) {
    return u.x * v.x + u.y * v.y;
  }

  /**
   * 2D向量模长
   */
  function norm2(u) {
    return Math.sqrt(u.x * u.x + u.y * u.y) + 1e-6;
  }

  /**
   * 两点距离
   */
  function dist(a, b) {
    const dx = a.x - b.x;
    const dy = a.y - b.y;
    return Math.sqrt(dx * dx + dy * dy);
  }

  /**
   * 计算角ABC的余弦值
   * 返回值越接近-1表示越接近180°(越直)
   */
  function cosAngle(a, b, c) {
    const u = vec2(b, a);
    const v = vec2(b, c);
    return dot2(u, v) / (norm2(u) * norm2(v));
  }

  /**
   * 限制值在范围内
   */
  function clamp(x, lo, hi) {
    return Math.max(lo, Math.min(hi, x));
  }

  // ========== 3D向量工具(利用z坐标) ==========
  
  function sub3(a, b) {
    return {
      x: a.x - b.x,
      y: a.y - b.y,
      z: (a.z ?? 0) - (b.z ?? 0),
    };
  }

  function dot3(u, v) {
    return u.x * v.x + u.y * v.y + u.z * v.z;
  }

  function cross3(u, v) {
    return {
      x: u.y * v.z - u.z * v.y,
      y: u.z * v.x - u.x * v.z,
      z: u.x * v.y - u.y * v.x,
    };
  }

  function norm3(u) {
    return Math.sqrt(u.x * u.x + u.y * u.y + u.z * u.z) + 1e-6;
  }

  function unit3(u) {
    const n = norm3(u);
    return { x: u.x / n, y: u.y / n, z: u.z / n };
  }

  // ========== 手掌坐标系 ==========
  
  /**
   * 建立手掌坐标系
   * xAxis: 掌横向(index_mcp -> pinky_mcp)
   * yAxis: 掌纵向(wrist -> middle_mcp)
   * zAxis: 掌法线(x × y)
   */
  function getHandBasis(landmarks) {
    const xAxis = unit3(sub3(landmarks[17], landmarks[5])); // 横向
    const yAxis = unit3(sub3(landmarks[9], landmarks[0]));  // 纵向
    const zAxis = unit3(cross3(xAxis, yAxis));              // 法线
    return { xAxis, yAxis, zAxis };
  }

  /**
   * 计算拇指在手掌坐标系中的方向得分
   * 返回: { side, up }
   */
  function getThumbScoresInHandBasis(landmarks, handedness = "Unknown") {
    const { xAxis, yAxis } = getHandBasis(landmarks);
    const thumbVec = sub3(landmarks[4], landmarks[2]); // thumb MCP -> TIP
    const palmScale = dist(landmarks[0], landmarks[5]) + 1e-6;

    let side = dot3(thumbVec, xAxis) / palmScale;
    let up = dot3(thumbVec, yAxis) / palmScale;

    // 统一左右手方向
    if (handedness === "Left") {
      side = -side;
    }

    return { side, up };
  }

  /**
   * 计算拇指外展角度(abduction angle)
   * 用于区分THUMBS_UP和SIX
   */
  function getThumbAbductionAngle(landmarks) {
    const { xAxis } = getHandBasis(landmarks);
    const thumbVec = unit3(sub3(landmarks[4], landmarks[2]));
    
    const cosToX = Math.abs(dot3(thumbVec, xAxis));
    const angleDeg = Math.acos(clamp(cosToX, -1, 1)) * (180 / Math.PI);
    
    return { abdDeg: angleDeg, cosToX };
  }

  // ========== 手指状态检测 ==========
  
  /**
   * 判断手指是否伸直(基于角度)
   */
  function isFingerExtended(landmarks, mcpIdx, pipIdx, dipIdx, tipIdx) {
    const p = paramsRef.value;
    const c = cosAngle(landmarks[mcpIdx], landmarks[pipIdx], landmarks[dipIdx]);
    
    // 额外检查: tip要在dip上方
    const tipAboveDip = landmarks[tipIdx].y < landmarks[dipIdx].y;
    
    return c < p.angleCosThresh && tipAboveDip;
  }

  /**
   * 判断拇指是否伸直
   */
  function isThumbStraight(landmarks) {
    const p = paramsRef.value;
    const c = cosAngle(landmarks[2], landmarks[3], landmarks[4]);
    const thresh = Math.min(-0.65, p.angleCosThresh + 0.05);
    return c < thresh;
  }

  /**
   * 计算拇指张开程度
   */
  function getThumbOpenScore(landmarks) {
    const palmScale = dist(landmarks[0], landmarks[5]) + 1e-6;
    return dist(landmarks[4], landmarks[5]) / palmScale;
  }

  // ========== 特定手势检测 ==========
  
  /**
   * 检测OK手势
   */
  function detectOK(landmarks, palmScale) {
    const p = paramsRef.value;
    
    // thumb tip 和 index tip 的距离
    const tipDist = dist(landmarks[4], landmarks[8]) / palmScale;
    
    // 其他三指是否伸直
    const middleUp = isFingerExtended(landmarks, 9, 10, 11, 12);
    const ringUp = isFingerExtended(landmarks, 13, 14, 15, 16);
    const pinkyUp = isFingerExtended(landmarks, 17, 18, 19, 20);
    
    const otherFingersUp = [middleUp, ringUp, pinkyUp].filter(Boolean).length;
    
    return tipDist < p.okThresh && otherFingersUp >= 2;
  }

  // ========== 主识别函数 ==========
  
  /**
   * 手势识别主函数
   * @param {Array} landmarks - 21个手部关键点
   * @param {string} handedness - 左手/右手标识
   * @returns {string} 识别的手势名称
   */
  function detectGesture(landmarks, handedness = "Unknown") {
    if (!landmarks || landmarks.length !== 21) {
      return "UNKNOWN";
    }

    const p = paramsRef.value;

    // ===== 1. 计算基础特征 =====
    const palmScale = dist(landmarks[0], landmarks[5]) + 1e-6;

    // 四指伸直检测
    const indexUp = isFingerExtended(landmarks, 5, 6, 7, 8);
    const middleUp = isFingerExtended(landmarks, 9, 10, 11, 12);
    const ringUp = isFingerExtended(landmarks, 13, 14, 15, 16);
    
    // 小指特殊处理(容易误判)
    const pinkyAngleUp = isFingerExtended(landmarks, 17, 18, 19, 20);
    const pinkyYUp = landmarks[20].y < landmarks[18].y;
    const pinkyDistUp = dist(landmarks[20], landmarks[0]) > dist(landmarks[18], landmarks[0]);
    const pinkyUp = pinkyAngleUp || pinkyYUp || pinkyDistUp;

    const fingersUpCount = [indexUp, middleUp, ringUp, pinkyUp].filter(Boolean).length;

    // 拇指特征
    const thumbStraight = isThumbStraight(landmarks);
    const thumbScoresInBasis = getThumbScoresInHandBasis(landmarks, handedness);
    const thumbOpen = getThumbOpenScore(landmarks);
    const thumbAbduction = getThumbAbductionAngle(landmarks);

    // 更新UI显示
    thumbScores.value = {
      up: thumbScoresInBasis.up,
      side: thumbScoresInBasis.side,
      open: thumbOpen,
      abdDeg: thumbAbduction.abdDeg,
    };

    const thumbIsOpen = thumbOpen > p.thumbOpenThresh;
    const thumbPointsUp = thumbScoresInBasis.up > p.thumbUpScoreThresh;
    const thumbPointsSide = Math.abs(thumbScoresInBasis.side) > p.thumbSideScoreThresh;

    // 调试输出
    if (DEBUG) {
      console.log({
        fingersUp: [indexUp, middleUp, ringUp, pinkyUp],
        fingersUpCount,
        thumbStraight,
        thumbOpen,
        thumbPointsUp,
        thumbPointsSide,
        abdDeg: thumbAbduction.abdDeg,
      });
    }

    // ===== 2. 手势判断逻辑 =====

    // OK手势(优先级最高)
    if (detectOK(landmarks, palmScale)) {
      return "OK";
    }

    // FIST: 所有手指都弯曲
    if (fingersUpCount === 0 && !thumbIsOpen) {
      return "FIST";
    }

    // PALM: 5指全开
    if (fingersUpCount === 4 && thumbIsOpen && thumbStraight) {
      return "PALM";
    }

    // THUMBS_UP: 只有拇指竖起,外展角度大
    if (
      fingersUpCount === 0 &&
      thumbStraight &&
      thumbPointsUp &&
      thumbAbduction.abdDeg > 45
    ) {
      return "THUMBS_UP";
    }

    // SIX: 拇指和小指伸开,外展角度小
    if (
      pinkyUp &&
      !indexUp &&
      !middleUp &&
      !ringUp &&
      thumbStraight &&
      thumbPointsSide &&
      thumbAbduction.abdDeg < 45
    ) {
      return "SIX";
    }

    // POINT: 只有食指伸直
    if (indexUp && !middleUp && !ringUp && !pinkyUp) {
      return "POINT";
    }

    // V: 食指和中指伸直
    if (indexUp && middleUp && !ringUp && !pinkyUp) {
      return "V";
    }

    // THREE: 食指、中指、无名指伸直
    if (indexUp && middleUp && ringUp && !pinkyUp) {
      return "THREE";
    }

    // FOUR: 四指伸直,拇指收起
    if (fingersUpCount === 4 && !thumbIsOpen) {
      return "FOUR";
    }

    return "UNKNOWN";
  }

  // ========== 导出 ==========
  return {
    detectGesture,
    thumbScores,
  };
}