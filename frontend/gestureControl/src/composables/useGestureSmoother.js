export function useGestureSmoother(paramsRef) {
  const win = [];

  function smoothGesture(g) {
    win.push(g);
    const maxLen = Math.max(3, Math.min(21, paramsRef.value.windowSize));
    if (win.length > maxLen) win.shift();

    const freq = {};
    for (const x of win) freq[x] = (freq[x] || 0) + 1;

    let best = null;
    let bestCount = -1;
    for (const x of win) {
      const c = freq[x];
      if (c > bestCount) {
        best = x;
        bestCount = c;
      } else if (c === bestCount && x === win[win.length - 1]) {
        best = x;
      }
    }
    return best || "UNKNOWN";
  }

  function resetSmoother() {
    win.length = 0;
  }

  return { smoothGesture, resetSmoother };
}
