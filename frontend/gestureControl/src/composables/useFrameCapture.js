import { ref } from "vue";

export function useFrameCapture(BACKEND, getVideoEl) {
  const cvBusy = ref(false);
  const cvError = ref("");
  const cvResult = ref(null);

  async function captureAndPreprocess() {
    cvBusy.value = true;
    cvError.value = "";
    cvResult.value = null;

    try {
      const video = getVideoEl();
      if (!video) throw new Error("video not ready");

      const w = video.videoWidth || 640;
      const h = video.videoHeight || 480;

      const tmp = document.createElement("canvas");
      tmp.width = w;
      tmp.height = h;

      const ctx = tmp.getContext("2d");
      ctx.drawImage(video, 0, 0, w, h);

      const blob = await new Promise((resolve) => tmp.toBlob(resolve, "image/jpeg", 0.9));
      if (!blob) throw new Error("capture failed");

      const fd = new FormData();
      fd.append("file", blob, "frame.jpg");

      const res = await fetch(`${BACKEND}/api/frame/preprocess`, {
        method: "POST",
        body: fd,
      });
      const data = await res.json();

      if (!data?.ok) throw new Error(data?.error || "opencv preprocess failed");
      cvResult.value = data;
    } catch (e) {
      cvError.value = String(e?.message || e);
    } finally {
      cvBusy.value = false;
    }
  }

  return { cvBusy, cvError, cvResult, captureAndPreprocess };
}
