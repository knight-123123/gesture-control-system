import { Hands, HAND_CONNECTIONS } from "@mediapipe/hands";
import { Camera } from "@mediapipe/camera_utils";
import { drawConnectors, drawLandmarks } from "@mediapipe/drawing_utils";

export function useHandsCamera({ onFps, onNoHand, onHandResults }) {
  let hands = null;
  let camera = null;

  let lastFpsTime = performance.now();
  let frameCount = 0;

  function updateFps() {
    frameCount += 1;
    const now = performance.now();
    const dt = now - lastFpsTime;
    if (dt >= 1000) {
      const fps = Math.round((frameCount * 1000) / dt);
      onFps?.(fps);
      frameCount = 0;
      lastFpsTime = now;
    }
  }

  function resizeCanvasToVideo(video, canvas) {
    const w = video.videoWidth || 640;
    const h = video.videoHeight || 480;
    canvas.width = w;
    canvas.height = h;
  }

  async function initAndStart(videoEl, canvasEl) {
    // 1) 开摄像头
    const stream = await navigator.mediaDevices.getUserMedia({
      video: { width: 640, height: 480 },
      audio: false,
    });
    videoEl.srcObject = stream;
    await videoEl.play();

    // 2) Hands
    hands = new Hands({
      locateFile: (file) => `https://cdn.jsdelivr.net/npm/@mediapipe/hands/${file}`,
    });

    hands.setOptions({
      maxNumHands: 1,
      modelComplexity: 1,
      minDetectionConfidence: 0.6,
      minTrackingConfidence: 0.6,
    });

    hands.onResults((results) => {
      updateFps();
      resizeCanvasToVideo(videoEl, canvasEl);

      const ctx = canvasEl.getContext("2d");
      ctx.save();
      ctx.clearRect(0, 0, canvasEl.width, canvasEl.height);

      if (results.multiHandLandmarks && results.multiHandLandmarks.length > 0) {
        const landmarks = results.multiHandLandmarks[0];
        let handednessLabel = results.multiHandedness?.[0]?.label || "Unknown";

        // 如果你不镜像画面但仍是前置摄像头，依然建议开启这个 swap（因为语义是用户视角）
        if (handednessLabel === "Left") handednessLabel = "Right";
        else if (handednessLabel === "Right") handednessLabel = "Left";


        // draw
        drawConnectors(ctx, landmarks, HAND_CONNECTIONS, { color: "#00FF00", lineWidth: 4 });
        drawLandmarks(ctx, landmarks, { color: "#FF0000", lineWidth: 2, radius: 3 });

        onHandResults?.({ landmarks, handednessLabel });
      } else {
        onNoHand?.();
      }

      ctx.restore();
    });

    // 3) Camera frames -> hands
    camera = new Camera(videoEl, {
      onFrame: async () => {
        await hands.send({ image: videoEl });
      },
      width: 640,
      height: 480,
    });

    await camera.start();
  }

  function stopAll() {
    try {
      if (camera) {
        camera.stop();
        camera = null;
      }
    } catch {}

    try {
      if (hands) {
        hands.close();
        hands = null;
      }
    } catch {}
  }

  return { initAndStart, stopAll };
}
