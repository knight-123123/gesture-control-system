/**
 * 手势识别检测器 - 终极修复版
 * 
 * 修复内容：
 * 1. 严格区分 THUMBS_UP 和 SIX（不再混淆）
 * 2. 提高小指判断精度
 * 3. 优化 POINT 识别（更容易识别）
 * 4. 重新设计判断优先级
 * 
 * 支持的手势（共7种 + UNKNOWN）：
 * 1. THUMBS_UP - 👍 大拇指点赞
 * 2. SIX - 🤙 大拇指+小指
 * 3. PALM - 🖐️ 五指张开
 * 4. FIST - ✊ 握拳
 * 5. POINT - 👉 食指指向
 * 6. V - ✌️ V字手势
 * 7. OK - 👌 OK手势
 * 8. UNKNOWN - ❓ 无法识别
 */
import { ref } from "vue";

// 调试模式
const DEBUG = false;

export function useGestureDetector(paramsRef) {
  const thumbScores = ref({
    up: 0,
    side: 0,
    open: 0,
    abdDeg: 0,
  });

  // ========== 数学工具函数 ==========
  
  function vec2(a, b) {
    return { x: b.x - a.x, y: b.y - a.y };
  }

  function dot2(u, v) {
    return u.x * v.x + u.y * v.y;
  }

  function norm2(u) {
    return Math.sqrt(u.x * u.x + u.y * u.y) + 1e-6;
  }

  function dist(a, b) {
    const dx = a.x - b.x;
    const dy = a.y - b.y;
    return Math.sqrt(dx * dx + dy * dy);
  }

  function cosAngle(a, b, c) {
    const u = vec2(b, a);
    const v = vec2(b, c);
    return dot2(u, v) / (norm2(u) * norm2(v));
  }

  function clamp(x, lo, hi) {
    return Math.max(lo, Math.min(hi, x));
  }

  // ========== 3D向量工具 ==========
  
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
  
  function getHandBasis(landmarks) {
    const xAxis = unit3(sub3(landmarks[17], landmarks[5]));
    const yAxis = unit3(sub3(landmarks[9], landmarks[0]));
    const zAxis = unit3(cross3(xAxis, yAxis));
    return { xAxis, yAxis, zAxis };
  }

  function getThumbScoresInHandBasis(landmarks, handedness = "Unknown") {
    const { xAxis, yAxis } = getHandBasis(landmarks);
    const thumbVec = sub3(landmarks[4], landmarks[2]);
    const palmScale = dist(landmarks[0], landmarks[5]) + 1e-6;

    let side = dot3(thumbVec, xAxis) / palmScale;
    let up = dot3(thumbVec, yAxis) / palmScale;

    if (handedness === "Left") {
      side = -side;
    }

    return { side, up };
  }

  function getThumbAbductionAngle(landmarks) {
    const { xAxis } = getHandBasis(landmarks);
    const thumbVec = unit3(sub3(landmarks[4], landmarks[2]));
    
    const cosToX = Math.abs(dot3(thumbVec, xAxis));
    const angleDeg = Math.acos(clamp(cosToX, -1, 1)) * (180 / Math.PI);
    
    return { abdDeg: angleDeg, cosToX };
  }

  // ========== 手指状态检测（优化版） ==========
  
  /**
   * 判断手指是否伸直（放宽条件，更容易识别）
   */
  function isFingerExtended(landmarks, mcpIdx, pipIdx, dipIdx, tipIdx) {
    const p = paramsRef.value;
    const c = cosAngle(landmarks[mcpIdx], landmarks[pipIdx], landmarks[dipIdx]);
    
    // 放宽角度判断
    const angleExtended = c < (p.angleCosThresh + 0.05);
    
    // tip要在dip上方（放宽要求）
    const tipAboveDip = landmarks[tipIdx].y < (landmarks[dipIdx].y + 0.02);
    
    return angleExtended && tipAboveDip;
  }

  /**
   * ✅ 新增：严格判断小指是否伸直（用于区分 THUMBS_UP 和 SIX）
   */
  function isPinkyStrictlyExtended(landmarks) {
    const p = paramsRef.value;
    
    // 1. 角度检查（必须满足）
    const angleCheck = cosAngle(landmarks[17], landmarks[18], landmarks[19]) < p.angleCosThresh;
    
    // 2. Y坐标检查（tip 必须明显高于 dip）
    const yCheck = landmarks[20].y < (landmarks[19].y - 0.03);
    
    // 3. 距离检查（tip 到 wrist 的距离明显大于 mcp 到 wrist）
    const distTipToWrist = dist(landmarks[20], landmarks[0]);
    const distMcpToWrist = dist(landmarks[17], landmarks[0]);
    const distCheck = distTipToWrist > (distMcpToWrist * 1.15);
    
    // ✅ 必须同时满足所有条件（严格判断）
    return angleCheck && yCheck && distCheck;
  }

  function isThumbStraight(landmarks) {
    const p = paramsRef.value;
    const c = cosAngle(landmarks[2], landmarks[3], landmarks[4]);
    const thresh = Math.min(-0.65, p.angleCosThresh + 0.05);
    return c < thresh;
  }

  function getThumbOpenScore(landmarks) {
    const palmScale = dist(landmarks[0], landmarks[5]) + 1e-6;
    return dist(landmarks[4], landmarks[5]) / palmScale;
  }

  // ========== OK手势检测 ==========
  
  function detectOK(landmarks, palmScale) {
    const p = paramsRef.value;
    const tipDist = dist(landmarks[4], landmarks[8]) / palmScale;
    
    const middleUp = isFingerExtended(landmarks, 9, 10, 11, 12);
    const ringUp = isFingerExtended(landmarks, 13, 14, 15, 16);
    const pinkyUp = isFingerExtended(landmarks, 17, 18, 19, 20);
    
    const otherFingersUp = [middleUp, ringUp, pinkyUp].filter(Boolean).length;
    return tipDist < p.okThresh && otherFingersUp >= 2;
  }

  // ========== 主识别函数 ==========
  
  function detectGesture(landmarks, handedness = "Unknown") {
    if (!landmarks || landmarks.length !== 21) {
      return "UNKNOWN";
    }

    const p = paramsRef.value;

    // ===== 1. 计算基础特征 =====
    const palmScale = dist(landmarks[0], landmarks[5]) + 1e-6;

    // 四指伸直检测（使用优化后的判断）
    const indexUp = isFingerExtended(landmarks, 5, 6, 7, 8);
    const middleUp = isFingerExtended(landmarks, 9, 10, 11, 12);
    const ringUp = isFingerExtended(landmarks, 13, 14, 15, 16);
    
    // ✅ 小指使用宽松判断（用于 PALM）
    const pinkyUpLoose = isFingerExtended(landmarks, 17, 18, 19, 20);
    
    // ✅ 小指使用严格判断（用于 SIX 和 THUMBS_UP 区分）
    const pinkyUpStrict = isPinkyStrictlyExtended(landmarks);

    const fingersUpCount = [indexUp, middleUp, ringUp, pinkyUpLoose].filter(Boolean).length;

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

    // 拇指向上判断（适度宽松）
    const thumbPointsUpRelaxed = thumbScoresInBasis.up > 0.15;
    
    // 拇指tip在所有指关节上方
    const thumbTipAboveAll = 
      landmarks[4].y < landmarks[8].y &&
      landmarks[4].y < landmarks[12].y &&
      landmarks[4].y < landmarks[16].y &&
      landmarks[4].y < landmarks[20].y;

    // 调试输出
    if (DEBUG) {
      console.log({
        gesture: "detecting...",
        fingers: { 
          index: indexUp, 
          middle: middleUp, 
          ring: ringUp, 
          pinkyLoose: pinkyUpLoose,
          pinkyStrict: pinkyUpStrict 
        },
        fingersUpCount,
        thumb: {
          straight: thumbStraight,
          open: thumbOpen,
          pointsUp: thumbPointsUp,
          pointsUpRelaxed: thumbPointsUpRelaxed,
          pointsSide: thumbPointsSide,
          abdDeg: thumbAbduction.abdDeg,
          tipAboveAll: thumbTipAboveAll,
        }
      });
    }

    // ===== 2. 手势判断逻辑（重新设计的优先级） =====

    // 1. OK手势（优先级最高）
    if (detectOK(landmarks, palmScale)) {
      if (DEBUG) console.log("✅ Detected: OK");
      return "OK";
    }

    // 2. FIST - 所有手指都弯曲
    if (fingersUpCount === 0 && !thumbIsOpen) {
      if (DEBUG) console.log("✅ Detected: FIST");
      return "FIST";
    }

    // 3. PALM - 五指全开
    if (fingersUpCount === 4 && thumbIsOpen && thumbStraight) {
      if (DEBUG) console.log("✅ Detected: PALM");
      return "PALM";
    }

    // ✅ 4. THUMBS_UP - 只有拇指竖起（优先于其他手势）
    // 关键改进：明确排除小指伸直（使用严格判断）
    if (
      !indexUp &&                                      // 食指必须弯曲
      !middleUp &&                                     // 中指必须弯曲
      !ringUp &&                                       // 无名指必须弯曲
      !pinkyUpStrict &&                                // ✅ 小指必须弯曲（严格判断）
      thumbStraight &&                                 // 拇指伸直
      (thumbPointsUpRelaxed || thumbTipAboveAll) &&   // 拇指向上
      thumbAbduction.abdDeg > 30                       // 外展角度 > 30°
    ) {
      if (DEBUG) console.log("✅ Detected: THUMBS_UP (strict pinky check)");
      return "THUMBS_UP";
    }

    // ✅ 5. SIX - 拇指和小指都伸开（使用严格的小指判断）
    if (
      pinkyUpStrict &&                                 // ✅ 小指必须伸直（严格判断）
      !indexUp &&
      !middleUp &&
      !ringUp &&
      thumbStraight &&
      thumbPointsSide &&
      thumbAbduction.abdDeg < 50                       // 放宽角度限制
    ) {
      if (DEBUG) console.log("✅ Detected: SIX (strict pinky check)");
      return "SIX";
    }

    // 6. POINT - 只有食指伸直（放宽条件）
    if (indexUp && !middleUp && !ringUp && !pinkyUpLoose) {
      if (DEBUG) console.log("✅ Detected: POINT");
      return "POINT";
    }

    // 7. V - 食指和中指伸直
    if (indexUp && middleUp && !ringUp && !pinkyUpLoose) {
      if (DEBUG) console.log("✅ Detected: V");
      return "V";
    }

    // 8. UNKNOWN
    if (DEBUG) console.log("⚠️ Detected: UNKNOWN");
    return "UNKNOWN";
  }

  return {
    detectGesture,
    thumbScores,
  };
}