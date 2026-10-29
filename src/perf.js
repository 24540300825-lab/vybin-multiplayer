// Giám sát hiệu năng nhẹ: khung hình (EMA/p95), thống kê renderer, bộ nhớ JS. Bật overlay bằng ?perf hoặc phím F3.
// Không tốn gì khi tắt (chỉ 1 phép trừ + ghi vòng đệm mỗi frame).
const N = 240;
const ft = new Float32Array(N); let since = 0, fi = 0, fn = 0, rendererRef = null, el = null, on = false, lastDraw = 0, hitch = 0;
export const Perf = {
  attach(r) { rendererRef = r; if (r) r.info.autoReset = false; },
  frame(dtMs) { since++; ft[fi] = dtMs; fi = (fi + 1) % N; if (fn < N) fn++; if (dtMs > 50) hitch++; },
  reset() { since = 0; fn = 0; fi = 0; hitch = 0; if (rendererRef) rendererRef.info.reset(); },
  snapshot() {
    const a = Array.from(ft.subarray(0, fn)).sort((x, y) => x - y), n = a.length;
    const avg = n ? a.reduce((s, v) => s + v, 0) / n : 0;
    const info = rendererRef ? rendererRef.info : null, f = Math.max(1, since);
    const mem = performance.memory ? Math.round(performance.memory.usedJSHeapSize / 1048576) : null;
    return {fps: avg ? +(1000 / avg).toFixed(1) : 0, avgMs: +avg.toFixed(2), p50: +(a[n >> 1] || 0).toFixed(2), p95: +(a[Math.floor(n * 0.95)] || 0).toFixed(2), hitches: hitch,
      calls: info ? Math.round(info.render.calls / f) : 0, tris: info ? Math.round(info.render.triangles / f) : 0,
      geoms: info ? info.memory.geometries : 0, tex: info ? info.memory.textures : 0, progs: info ? info.programs.length : 0, heapMB: mem};
  },
  toggle(v) {
    on = v === undefined ? !on : v;
    if (on && !el) { el = document.createElement('pre'); el.style.cssText = 'position:fixed;left:8px;bottom:8px;z-index:50;margin:0;padding:6px 9px;background:#000a;color:#8f8;font:11px/1.35 monospace;pointer-events:none;border-radius:6px'; document.body.appendChild(el); }
    if (el) el.style.display = on ? 'block' : 'none';
  },
  draw(now) {
    if (!on || now - lastDraw < 500) return; lastDraw = now; const s = this.snapshot();
    el.textContent = `${s.fps} fps  ${s.avgMs}ms (p95 ${s.p95})\ncalls ${s.calls}  tris ${(s.tris / 1000).toFixed(0)}k\ngeo ${s.geoms} tex ${s.tex} prog ${s.progs}${s.heapMB != null ? '  heap ' + s.heapMB + 'MB' : ''}\nhitch>50ms: ${s.hitches}`;
    if (rendererRef) { rendererRef.info.reset(); since = 0; }
  },
};
addEventListener('keydown', e => { if (e.code === 'F3') { e.preventDefault(); Perf.toggle(); } });
