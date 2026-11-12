/** Low-end GPU fallback. Watches the frame times of a render loop; if the average over a 2 s window
 *  (after a 1.5 s warm-up for shader compiles and uploads) is above the budget, it calls
 *  `downgrade` once (drop the costly post-processing, render at pixel ratio 1) and marks
 *  <html data-gl-quality="low"> so the switch can be verified. Time-based, so a slow device is
 *  caught within a few seconds however few frames it manages. */
export function frameGovernor(name: string, downgrade: () => void, budgetMs = 34) {
  const WARMUP_MS = 1500, WINDOW_MS = 2000;
  let warm = 0, elapsed = 0, frames = 0, done = false;
  return (deltaMs: number) => {
    if (done) return;
    const d = Math.min(deltaMs, 500); // ignore long stalls (tab switches, GC)
    if (warm < WARMUP_MS) {
      warm += d;
      return;
    }
    elapsed += d;
    frames++;
    if (elapsed < WINDOW_MS || frames < 8) return;
    if (elapsed / frames > budgetMs) {
      done = true;
      downgrade();
      if (typeof document !== 'undefined') {
        const root = document.documentElement;
        root.dataset.glQuality = 'low';
        root.dataset.glLow = [root.dataset.glLow, name].filter(Boolean).join(' ');
      }
    }
    elapsed = 0;
    frames = 0;
  };
}
