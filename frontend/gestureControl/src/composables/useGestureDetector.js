// 文件：src/composables/useGestureDetector.js
import { ref } from "vue";

export function useGestureDetector(paramsRef) {
  // 这里多塞一个 abdDeg（外展角度），不影响你现有 UI（UI 只显示 up/side/open）
  const thumbScores = ref({ up: 0, side: 0, open: 0, abdDeg: 0 });

  /** ========= 基础数学工具 ========= */
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
  // ∠ABC 的余弦值：越接近 -1 越接近 180°（越直）
  function cosAngle(a, b, c) {
    const u = vec2(b, a);
    const v = vec2(b, c);
    return dot2(u, v) / (norm2(u) * norm2(v));
  }
  function clamp(x, lo, hi) {
    return Math.max(lo, Math.min(hi, x));
  }

  /** ========= 3D 工具（用 z 构建手掌坐标系） ========= */
  function sub(a, b) {
    return { x: a.x - b.x, y: a.y - b.y, z: (a.z ?? 0) - (b.z ?? 0) };
  }
  function dot3(u, v) {
    return u.x * v.x + u.y * v.y + u.z * v.z;
  }
  function cross(u, v) {
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

  /**
   * 手掌坐标系：
   * xAxis：掌横向（index_mcp -> pinky_mcp）
   * yAxis：掌纵向（wrist -> middle_mcp）
   * zAxis：掌法线（x × y）
   */
  function handBasis(lm) {
    const xAxis = unit3(sub(lm[17], lm[5])); // across palm
    const yAxis = unit3(sub(lm[9], lm[0]));  // wrist -> middle_mcp
    const zAxis = unit3(cross(xAxis, yAxis));
    return { xAxis, yAxis, zAxis };
  }

  /**
   * 拇指方向分数（在手掌坐标系下，不随相机旋转乱跳）
   * 返回：{ side, up }，并对 Left 手 side 取反，使左右手同向（建议）
   */
  function thumbScoresInHandBasis(lm, handednessLabel = "Unknown") {
    const { xAxis, yAxis } = handBasis(lm);
    const v = sub(lm[4], lm[2]); // thumb MCP -> TIP
    const palmScale = dist(lm[0], lm[5]) + 1e-6;

    let side = dot3(v, xAxis) / palmScale;
    let up = dot3(v, yAxis) / palmScale;

    // 统一左右手 side 方向（你已在 useHandsCamera 做用户视角 swap，这里仍可统一 side）
    if (handednessLabel === "Left") side = -side;

    return { side, up };
  }

  /**
   * 拇指外展角（abduction angle）
   * 定义：thumb向量与掌横轴 xAxis 的夹角（0°表示完全沿掌横向张开）
   * - SIX：拇指通常更接近掌横向（外展角更小）
   * - THUMBS_UP：拇指更接近掌纵向（外展角接近 90°）
   */
  function thumbAbductionAngleDeg(lm) {
    const { xAxis } = handBasis(lm);
    const v = unit3(sub(lm[4], lm[2])); // thumb MCP -> TIP (unit)
    // 取绝对值：不区分左右张开方向，只看“贴近掌横轴的程度”
    const cosToX = Math.abs(dot3(v, xAxis)); // [0,1]
    const ang = Math.acos(clamp(cosToX, -1, 1)) * (180 / Math.PI); // [0,90]
    return { abdDeg: ang, cosToX };
  }

  /** ========= 角度法：四指是否伸直 ========= */
  function isFingerExtendedAngle(lm, mcp, pip, dip) {
    const c = cosAngle(lm[mcp], lm[pip], lm[dip]);
    return c < paramsRef.value.angleCosThresh;
  }

  /** ========= 拇指：是否伸直（角度法） ========= */
  function isThumbStraight(lm) {
    // thumb: 2(MCP) 3(IP) 4(TIP)
    const c = cosAngle(lm[2], lm[3], lm[4]);
    const thresh = Math.min(-0.65, paramsRef.value.angleCosThresh + 0.05);
    return c < thresh;
  }

  /** ========= 拇指张开程度（tip 到 index_mcp，归一化） ========= */
  function thumbOpenScore(lm) {
    const palmScale = dist(lm[0], lm[5]) + 1e-6;
    return dist(lm[4], lm[5]) / palmScale;
  }

  /** ========= 主识别函数 ========= */
  function detectGesture(lm, handednessLabel = "Unknown") {
    const p = paramsRef.value;

    // 四指：角度法
    const indexUp = isFingerExtendedAngle(lm, 5, 6, 7);
    const middleUp = isFingerExtendedAngle(lm, 9, 10, 11);
    const ringUp = isFingerExtendedAngle(lm, 13, 14, 15);

    // ✅ 小拇指：角度 + y兜底 + wrist距离兜底（最抗角度）
    const pinkyUp =
      isFingerExtendedAngle(lm, 17, 18, 19) ||
      (lm[20].y < lm[18].y) ||
      (dist(lm[20], lm[0]) > dist(lm[18], lm[0]));

    const fourUpCount = [indexUp, middleUp, ringUp, pinkyUp].filter(Boolean).length;

    // 拇指融合分数（手掌坐标系）
    const thumbStraight = isThumbStraight(lm);
    const { side: thumbSideScore, up: thumbUpScore } = thumbScoresInHandBasis(lm, handednessLabel);
    const open = thumbOpenScore(lm);

    // ✅ 外展角（abduction angle）
    const { abdDeg, cosToX } = thumbAbductionAngleDeg(lm);

    // 写回实时展示（UI可选展示 abdDeg，你现在的 UI 不会报错）
    thumbScores.value = { up: thumbUpScore, side: thumbSideScore, open, abdDeg };

    const thumbOpen = open > p.thumbOpenThresh;

    // 归一化尺度：wrist(0) 到 index_mcp(5)
    const palmScale = dist(lm[0], lm[5]) + 1e-6;

    // OK：thumb_tip 与 index_tip 距离归一化 + 其他三指至少两根伸直
    const okNorm = dist(lm[4], lm[8]) / palmScale;
    const okClose = okNorm < p.okThresh;
    const otherUpCount = [middleUp, ringUp, pinkyUp].filter(Boolean).length;
    const isOK = okClose && otherUpCount >= 2;

    /** ===================== SIX（abduction angle 加持版，更稳） =====================
     * 核心：拇指张开 + 小拇指伸直 + 其余三指收起
     * 判定依据（满足其一即可）：
     * 1) side 达标（经典）
     * 2) open 特别大（斜着“六”）
     * 3) abduction angle 足够小（拇指贴近掌横轴） ← 这条是关键增强
     */
    const otherThreeFolded = !indexUp && !middleUp && !ringUp;

    const sixBySide = thumbOpen && thumbSideScore > p.thumbSideScoreThresh;
    const sixByOpen = open > (p.thumbOpenThresh + 0.15);

    // 外展角阈值：默认推荐 35° 左右（越小越严格）
    // 没放到 params 里，避免你还要改 ControlPanel；如果你想可调，我也能帮你加到面板。
    const ABD_THRESH_DEG = 35;
    const sixByAbd = thumbOpen && abdDeg < ABD_THRESH_DEG;

    if ((sixBySide || sixByOpen || sixByAbd) && pinkyUp && otherThreeFolded && !isOK) {
      return "SIX";
    }

    /** ===== FIST（避免抢走 SIX） ===== */
    if (fourUpCount === 0 && !thumbOpen && !pinkyUp && !isOK) return "FIST";

    if (isOK) return "OK";

    /** ===== POINT / V ===== */
    if (indexUp && !middleUp && !ringUp && !pinkyUp && !isOK) return "POINT";
    if (indexUp && middleUp && !ringUp && !pinkyUp && !isOK) return "V";

    /** ===== THUMBS_UP（避免抢走 SIX） =====
     * 关键：小拇指伸直时，绝不判点赞
     * 另外：如果外展角很小（更像六），也不判点赞（进一步抑制误判）
     */
    const thumbsUp =
      thumbStraight &&
      thumbUpScore > p.thumbUpScoreThresh &&
      fourUpCount <= 1 &&
      !pinkyUp && // ✅ 防止 SIX 被判成 THUMBS_UP
      abdDeg > 45 && // ✅ 外展角过小更像六，点赞应更接近纵向
      !isOK;

    if (thumbsUp) return "THUMBS_UP";

    /** ===== PALM ===== */
    if (indexUp && middleUp && ringUp && pinkyUp && !isOK) return "PALM";

    return "UNKNOWN";
  }

  return { detectGesture, thumbScores };
}
