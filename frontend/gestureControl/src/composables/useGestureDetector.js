/**
 * 手势识别检测器 - 修复版 v3.0
 * 支持的手势（共7种 + UNKNOWN）：
 * 1. THUMBS_UP - 👍 大拇指点赞（拇指向上，其他手指弯曲）
 * 2. SIX - 🤙 打电话手势（大拇指+小指伸开，拇指向侧边）
 * 3. PALM - 🖐️ 五指张开
 * 4. FIST - ✊ 握拳
 * 5. POINT - 👉 食指指向
 * 6. V - ✌️ V字手势
 * 7. OK - 👌 OK手势
 * 8. UNKNOWN - ❓ 无法识别
 */
import { ref } from "vue";

// ========== 调试开关 ==========
const DEBUG = false;  // 开启调试模式帮助排查

export function useGestureDetector(paramsRef) {
  const thumbScores = ref({
    up: 0,
    side: 0,
    open: 0,
    abdDeg: 0,
  });

  // 调试数据（可在UI中显示）
  const debugInfo = ref({
    fingers: {},
    thumb: {},
    pinkyScores: {},
    decision: ''
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
   * 判断手指是否伸直（标准版）
   */
  function isFingerExtended(landmarks, mcpIdx, pipIdx, dipIdx, tipIdx) {
    const p = paramsRef.value;
    
    // 角度检查：PIP关节角度
    const pipAngle = cosAngle(landmarks[mcpIdx], landmarks[pipIdx], landmarks[dipIdx]);
    const angleExtended = pipAngle < (p.angleCosThresh + 0.1);  // 放宽阈值
    
    // Y坐标检查：tip 要在 pip 上方（更合理的参考点）
    const tipAbovePip = landmarks[tipIdx].y < landmarks[pipIdx].y;
    
    // 备用：tip 至少在 dip 上方或附近
    const tipNearOrAboveDip = landmarks[tipIdx].y < (landmarks[dipIdx].y + 0.03);
    
    return angleExtended && (tipAbovePip || tipNearOrAboveDip);
  }

  /**
   * ✅ 重新设计：小指伸直判断（多层级）
   * 返回一个分数而不是布尔值，0-1范围
   */
  function getPinkyExtensionScore(landmarks) {
    const palmScale = dist(landmarks[0], landmarks[5]) + 1e-6;
    
    // 1. 角度分数（PIP关节）
    const pipAngle = cosAngle(landmarks[17], landmarks[18], landmarks[19]);
    // cos < -0.7 表示伸直，转换为0-1分数
    const angleScore = clamp(((-0.7) - pipAngle) / 0.3 + 0.5, 0, 1);
    
    // 2. Y坐标分数（tip相对于mcp的位置）
    const tipY = landmarks[20].y;
    const mcpY = landmarks[17].y;
    const dipY = landmarks[19].y;
    // tip应该在mcp上方
    const yDiff = (mcpY - tipY) / palmScale;
    const yScore = clamp(yDiff * 2 + 0.3, 0, 1);
    
    // 3. 距离分数（tip到wrist vs mcp到wrist）
    const distTipToWrist = dist(landmarks[20], landmarks[0]);
    const distMcpToWrist = dist(landmarks[17], landmarks[0]);
    const distRatio = distTipToWrist / distMcpToWrist;
    // 比值>1.1表示伸直
    const distScore = clamp((distRatio - 1.0) * 5, 0, 1);
    
    // 4. 小指相对于无名指的位置（小指tip应该比无名指tip更远离手腕）
    const pinkyTipDist = dist(landmarks[20], landmarks[0]);
    const ringTipDist = dist(landmarks[16], landmarks[0]);
    const relativeScore = pinkyTipDist > ringTipDist * 0.8 ? 0.5 : 0;
    
    // 综合分数（加权平均）
    const totalScore = angleScore * 0.35 + yScore * 0.25 + distScore * 0.25 + relativeScore * 0.15;
    
    return {
      total: totalScore,
      angle: angleScore,
      y: yScore,
      dist: distScore,
      relative: relativeScore
    };
  }

  /**
   * ✅ 小指是否伸直（宽松版）- 用于一般判断
   */
  function isPinkyExtendedLoose(landmarks) {
    const score = getPinkyExtensionScore(landmarks);
    return score.total > 0.35;  // 宽松阈值
  }

  /**
   * ✅ 小指是否伸直（中等版）- 用于 SIX 判断
   */
  function isPinkyExtendedMedium(landmarks) {
    const score = getPinkyExtensionScore(landmarks);
    return score.total > 0.45;  // 中等阈值
  }

  /**
   * ✅ 小指是否弯曲（严格版）- 用于 THUMBS_UP 判断
   */
  function isPinkyDefinitelyCurled(landmarks) {
    const score = getPinkyExtensionScore(landmarks);
    return score.total < 0.30;  // 必须明确弯曲
  }

  function isThumbStraight(landmarks) {
    const p = paramsRef.value;
    const c = cosAngle(landmarks[2], landmarks[3], landmarks[4]);
    const thresh = Math.min(-0.6, p.angleCosThresh + 0.1);  // 稍微放宽
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
    const pinkyUp = isPinkyExtendedLoose(landmarks);
    
    const otherFingersUp = [middleUp, ringUp, pinkyUp].filter(Boolean).length;
    return tipDist < p.okThresh && otherFingersUp >= 2;
  }

  // ========== PALM手势检测（专用函数） ==========
  
  function detectPALM(landmarks, palmScale) {
    // PALM特征：五指全部张开
    // 使用多种方法综合判断，提高识别率
    
    // 方法1：所有指尖都在对应PIP关节上方
    const allTipsAbovePip = 
      landmarks[8].y < landmarks[6].y &&   // 食指
      landmarks[12].y < landmarks[10].y && // 中指
      landmarks[16].y < landmarks[14].y && // 无名指
      landmarks[20].y < landmarks[18].y;   // 小指
    
    // 方法2：所有指尖到手腕的距离都大于MCP到手腕的距离
    const indexExtended = dist(landmarks[8], landmarks[0]) > dist(landmarks[5], landmarks[0]) * 1.1;
    const middleExtended = dist(landmarks[12], landmarks[0]) > dist(landmarks[9], landmarks[0]) * 1.1;
    const ringExtended = dist(landmarks[16], landmarks[0]) > dist(landmarks[13], landmarks[0]) * 1.1;
    const pinkyExtended = dist(landmarks[20], landmarks[0]) > dist(landmarks[17], landmarks[0]) * 1.05;
    
    const distanceCheck = [indexExtended, middleExtended, ringExtended, pinkyExtended]
      .filter(Boolean).length >= 3;
    
    // 方法3：拇指展开（拇指尖离食指根部足够远）
    const thumbSpread = dist(landmarks[4], landmarks[5]) / palmScale > 0.5;
    
    // 方法4：手指间有足够间距（表示张开而非并拢）
    const fingerSpread = 
      dist(landmarks[8], landmarks[12]) / palmScale > 0.15 &&
      dist(landmarks[12], landmarks[16]) / palmScale > 0.1;
    
    // 综合判断：多个条件满足即可
    const score = (allTipsAbovePip ? 1 : 0) + 
                  (distanceCheck ? 1 : 0) + 
                  (thumbSpread ? 1 : 0) + 
                  (fingerSpread ? 0.5 : 0);
    
    if (DEBUG && score >= 2) {
      console.log(`  PALM check: tips=${allTipsAbovePip}, dist=${distanceCheck}, thumb=${thumbSpread}, spread=${fingerSpread}, score=${score}`);
    }
    
    return score >= 2.5;
  }

  // ========== 主识别函数（重新设计） ==========
  
  function detectGesture(landmarks, handedness = "Unknown") {
    if (!landmarks || landmarks.length !== 21) {
      return "UNKNOWN";
    }

    const p = paramsRef.value;
    const palmScale = dist(landmarks[0], landmarks[5]) + 1e-6;

    // ===== 1. 计算所有基础特征 =====
    
    // 四指状态
    const indexUp = isFingerExtended(landmarks, 5, 6, 7, 8);
    const middleUp = isFingerExtended(landmarks, 9, 10, 11, 12);
    const ringUp = isFingerExtended(landmarks, 13, 14, 15, 16);
    
    // 小指多层级判断
    const pinkyScore = getPinkyExtensionScore(landmarks);
    const pinkyUp = isPinkyExtendedLoose(landmarks);
    const pinkyUpMedium = isPinkyExtendedMedium(landmarks);
    const pinkyCurled = isPinkyDefinitelyCurled(landmarks);
    
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
    
    // ✅ 关键改进：拇指方向判断
    // thumbScoresInBasis.up > 0.2 表示拇指明显向上
    // |thumbScoresInBasis.side| > 0.3 表示拇指明显向侧边
    const thumbPointsUp = thumbScoresInBasis.up > 0.15;
    const thumbPointsSide = Math.abs(thumbScoresInBasis.side) > 0.25;
    const thumbPointsMoreUp = thumbScoresInBasis.up > Math.abs(thumbScoresInBasis.side) * 0.8;
    const thumbPointsMoreSide = Math.abs(thumbScoresInBasis.side) > thumbScoresInBasis.up * 0.8;
    
    // 拇指tip在所有弯曲手指的指尖上方
    const thumbTipAboveCurledFingers = 
      (!indexUp || landmarks[4].y < landmarks[8].y) &&
      (!middleUp || landmarks[4].y < landmarks[12].y) &&
      (!ringUp || landmarks[4].y < landmarks[16].y);

    // 调试输出
    if (DEBUG) {
      debugInfo.value = {
        fingers: { 
          index: indexUp, 
          middle: middleUp, 
          ring: ringUp, 
          pinky: pinkyUp,
          pinkyMedium: pinkyUpMedium,
          pinkyCurled: pinkyCurled,
          count: fingersUpCount
        },
        thumb: {
          straight: thumbStraight,
          open: thumbOpen.toFixed(2),
          upScore: thumbScoresInBasis.up.toFixed(2),
          sideScore: thumbScoresInBasis.side.toFixed(2),
          abdDeg: thumbAbduction.abdDeg.toFixed(1),
          pointsMoreUp: thumbPointsMoreUp,
          pointsMoreSide: thumbPointsMoreSide
        },
        pinkyScores: {
          total: pinkyScore.total.toFixed(2),
          angle: pinkyScore.angle.toFixed(2),
          y: pinkyScore.y.toFixed(2),
          dist: pinkyScore.dist.toFixed(2)
        }
      };
      
      console.log("🔍 Gesture Detection:", JSON.stringify(debugInfo.value, null, 2));
    }

    // ===== 2. 手势判断逻辑（重新设计优先级） =====

    // 1. OK手势（优先级最高，因为特征最独特）
    if (detectOK(landmarks, palmScale)) {
      if (DEBUG) console.log("✅ Detected: OK");
      return "OK";
    }

    // 2. FIST - 所有手指都弯曲
    if (fingersUpCount === 0 && !thumbIsOpen) {
      if (DEBUG) console.log("✅ Detected: FIST");
      return "FIST";
    }

    // 3. PALM - 五指全开（使用专用检测函数）
    if (detectPALM(landmarks, palmScale)) {
      if (DEBUG) console.log("✅ Detected: PALM");
      return "PALM";
    }

    // 4. V - 食指和中指伸直
    if (indexUp && middleUp && !ringUp && !pinkyUp) {
      if (DEBUG) console.log("✅ Detected: V");
      return "V";
    }

    // 5. POINT - 只有食指伸直
    if (indexUp && !middleUp && !ringUp && !pinkyUp) {
      if (DEBUG) console.log("✅ Detected: POINT");
      return "POINT";
    }

    // ===== 6&7. THUMBS_UP 和 SIX 的区分（核心改进） =====
    
    // 共同条件：食指、中指、无名指都弯曲，拇指伸直
    const thumbsUpOrSixBase = !indexUp && !middleUp && !ringUp && thumbStraight;
    
    if (thumbsUpOrSixBase) {
      // ✅ 核心区分逻辑：综合判断拇指方向和小指状态
      
      // THUMBS_UP 条件：
      // - 拇指明显向上（up分数高）
      // - 小指明确弯曲（curled）
      // - 或者：拇指的"向上"程度明显大于"向侧"程度
      const isThumbsUp = (
        (thumbPointsUp && thumbPointsMoreUp && pinkyCurled) ||
        (thumbScoresInBasis.up > 0.25 && pinkyScore.total < 0.35) ||
        (thumbTipAboveCurledFingers && pinkyCurled && thumbAbduction.abdDeg > 40)
      );
      
      // SIX 条件：
      // - 小指伸直（medium及以上）
      // - 拇指向侧边或向下（up分数低或side分数高）
      // - 或者：小指明确伸直且拇指没有明显向上
      const isSix = (
        (pinkyUpMedium && (thumbPointsMoreSide || thumbScoresInBasis.up < 0.15)) ||
        (pinkyScore.total > 0.5 && !thumbPointsMoreUp) ||
        (pinkyUpMedium && thumbAbduction.abdDeg < 35)
      );
      
      if (DEBUG) {
        console.log(`  THUMBS_UP conditions: ${isThumbsUp}`);
        console.log(`  SIX conditions: ${isSix}`);
      }
      
      // 优先级判断
      if (isThumbsUp && !isSix) {
        if (DEBUG) console.log("✅ Detected: THUMBS_UP");
        return "THUMBS_UP";
      }
      
      if (isSix && !isThumbsUp) {
        if (DEBUG) console.log("✅ Detected: SIX");
        return "SIX";
      }
      
      // 如果都满足或都不满足，使用更细致的比较
      if (isThumbsUp && isSix) {
        // 冲突情况：根据各项分数综合判断
        const thumbsUpConfidence = thumbScoresInBasis.up * 0.5 + (1 - pinkyScore.total) * 0.5;
        const sixConfidence = pinkyScore.total * 0.5 + (1 - thumbScoresInBasis.up) * 0.3 + Math.abs(thumbScoresInBasis.side) * 0.2;
        
        if (DEBUG) {
          console.log(`  Conflict! THUMBS_UP conf: ${thumbsUpConfidence.toFixed(2)}, SIX conf: ${sixConfidence.toFixed(2)}`);
        }
        
        if (thumbsUpConfidence > sixConfidence + 0.1) {
          if (DEBUG) console.log("✅ Detected: THUMBS_UP (by confidence)");
          return "THUMBS_UP";
        } else if (sixConfidence > thumbsUpConfidence + 0.1) {
          if (DEBUG) console.log("✅ Detected: SIX (by confidence)");
          return "SIX";
        }
        // 如果置信度接近，优先判断为小指状态更明确的那个
        if (pinkyScore.total > 0.5) {
          if (DEBUG) console.log("✅ Detected: SIX (pinky clearly extended)");
          return "SIX";
        }
        if (DEBUG) console.log("✅ Detected: THUMBS_UP (default in conflict)");
        return "THUMBS_UP";
      }
      
      // 如果基础条件满足但都不符合THUMBS_UP和SIX的具体条件
      // 尝试宽松匹配
      if (pinkyScore.total > 0.4) {
        if (DEBUG) console.log("✅ Detected: SIX (fallback - pinky somewhat extended)");
        return "SIX";
      }
      if (thumbScoresInBasis.up > 0.1) {
        if (DEBUG) console.log("✅ Detected: THUMBS_UP (fallback - thumb somewhat up)");
        return "THUMBS_UP";
      }
    }

    // 8. 模糊匹配 - 尝试找最接近的手势
    // 如果到这里还没返回，尝试宽松匹配
    
    // 可能是不标准的 THUMBS_UP（拇指伸出，其他弯曲）
    if (fingersUpCount <= 1 && thumbStraight && thumbIsOpen && thumbPointsUp) {
      if (DEBUG) console.log("✅ Detected: THUMBS_UP (relaxed match)");
      return "THUMBS_UP";
    }
    
    // 可能是不标准的 SIX
    if (pinkyUpMedium && thumbStraight && fingersUpCount <= 2) {
      if (DEBUG) console.log("✅ Detected: SIX (relaxed match)");
      return "SIX";
    }

    // 9. UNKNOWN
    if (DEBUG) console.log("⚠️ Detected: UNKNOWN");
    return "UNKNOWN";
  }

  return {
    detectGesture,
    thumbScores,
    debugInfo,  // 导出调试信息供UI使用
  };
}