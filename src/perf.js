// Giám sát hiệu năng + ghi nhận giật (hitch) ngay trên máy người chơi.
//  F3  : bật/tắt bảng số đo real-time (hoặc mở với ?perf)
//  F4  : tải báo cáo JSON (toàn bộ số đo theo giây + danh sách lần giật kèm nguyên nhân dự đoán)
//  F6  : bắt đầu/ dừng ghi (mặc định luôn ghi nhẹ; chỉ GPU-timer cần overlay bật)
//  Console: VY.Perf.report() / VY.Perf.download() / VY.Perf.hitches
// Luôn ghi (rẻ): dt mỗi frame, hitch + ngữ cảnh. Khi overlay bật: thêm GPU timer (EXT_disjoint_timer_query_webgl2).
const N = 240;
const ft = new Float32Array(N); let since = 0, fi = 0, fn = 0, rendererRef = null, el = null, on = false, lastDraw = 0, hitch = 0;
let gl = null, tq = null, qPending = [], qActive = null, gpuMs = 0, cpuMs = 0, t0 = 0, cpuEma = 0, gpuEma = 0;
let lastProgs = 0, lastTex = 0, lastGeo = 0, lastHeap = 0, frameNo = 0, tStart = performance.now();
let callsEma = 0, trisEma = 0, ctxFn = () => ({}), curLong = [], lastVis = 0, lastCause = '';
const hitches = [], timeline = [], longTasks = [];
let secAcc = {n: 0, sum: 0, max: 0, bad: 0, cpu: 0, gpu: 0, calls: 0, tris: 0}, secT = 0;
const HITCH_MIN = 40;   // ms

function heapMB() { return performance.memory ? performance.memory.usedJSHeapSize / 1048576 : null; }
function initGpu() {
  if (!rendererRef || tq !== null) return; tq = false;
  try { gl = rendererRef.getContext(); tq = gl.getExtension('EXT_disjoint_timer_query_webgl2') || false; } catch (e) { tq = false; }
}
function pollGpu() {
  if (!tq) return;
  while (qPending.length) {
    const q = qPending[0], ok = gl.getQueryParameter(q, gl.QUERY_RESULT_AVAILABLE), dis = gl.getParameter(tq.GPU_DISJOINT_EXT);
    if (!ok && !dis) break; qPending.shift();
    if (!dis && ok) { gpuMs = gl.getQueryParameter(q, gl.QUERY_RESULT) / 1e6; gpuEma = gpuEma ? gpuEma * 0.9 + gpuMs * 0.1 : gpuMs; }
    gl.deleteQuery(q);
  }
}
try {
  new PerformanceObserver(list => { for (const e of list.getEntries()) { const r = {t: +(e.startTime / 1000).toFixed(2), ms: Math.round(e.duration)}; longTasks.push(r); if (longTasks.length > 100) longTasks.shift(); curLong.push(r); } }).observe({entryTypes: ['longtask']});
} catch (e) { /* trình duyệt không hỗ trợ longtask */ }
document.addEventListener('visibilitychange', () => { lastVis = performance.now(); });

function classify(dt, info) {
  const why = [];
  if (performance.now() - lastVis < 1500 || document.hidden) why.push('tab bị ẩn/vừa quay lại (trình duyệt tự giảm tốc)');
  if (info.dProgs > 0) why.push('biên dịch shader mới (+' + info.dProgs + ' program)');
  if (info.dTex > 0 || info.dGeo > 0) why.push('tải thêm texture/geometry lên GPU (tex +' + info.dTex + ', geo +' + info.dGeo + ')');
  if (info.dHeap != null && info.dHeap < -3) why.push('GC dọn bộ nhớ JS (' + info.dHeap.toFixed(1) + 'MB)');
  if (info.dHeap != null && info.dHeap > 25) why.push('cấp phát lớn JS (+' + info.dHeap.toFixed(0) + 'MB)');
  if (info.cpu >= dt * 0.65) why.push('JS/CPU nặng (' + info.cpu.toFixed(0) + 'ms trong frame' + (info.longTask ? ', long task ' + info.longTask + 'ms' : '') + ')');
  else if (info.gpu && info.gpu >= dt * 0.65) why.push('GPU quá tải (' + info.gpu.toFixed(0) + 'ms)');
  else if (!why.length) why.push(info.cpu < dt * 0.3 ? 'CPU rảnh nhưng frame trễ → GPU/trình duyệt/hệ điều hành (tiến trình khác, nhiệt độ, vsync)' : 'không rõ');
  return why.join(' + ');
}

export const Perf = {
  hitches, timeline, longTasks,
  attach(r) { rendererRef = r; if (r) r.info.autoReset = false; },
  context(fn) { ctxFn = fn; },
  // gọi quanh phần logic+vẽ của mỗi frame
  begin() { t0 = performance.now(); if (on) { initGpu(); pollGpu(); if (tq && !qActive && qPending.length < 4) { qActive = gl.createQuery(); gl.beginQuery(tq.TIME_ELAPSED_EXT, qActive); } } },
  end() { cpuMs = performance.now() - t0; cpuEma = cpuEma ? cpuEma * 0.9 + cpuMs * 0.1 : cpuMs; if (qActive) { gl.endQuery(tq.TIME_ELAPSED_EXT); qPending.push(qActive); qActive = null; } },
  frame(dtMs) {
    since++; frameNo++; ft[fi] = dtMs; fi = (fi + 1) % N; if (fn < N) fn++;
    const inf = rendererRef ? rendererRef.info : null, progs = inf ? inf.programs.length : 0, tex = inf ? inf.memory.textures : 0, geo = inf ? inf.memory.geometries : 0, h = heapMB();
    const fc = inf ? inf.render.calls : 0, ftr = inf ? inf.render.triangles : 0; callsEma = callsEma ? callsEma * 0.9 + fc * 0.1 : fc; trisEma = trisEma ? trisEma * 0.9 + ftr * 0.1 : ftr;
    const base = fn > 30 ? Array.from(ft.subarray(0, fn)).sort((a, b) => a - b)[fn >> 1] : 16.7;
    if (frameNo > 5 && dtMs > Math.max(HITCH_MIN, base * 2.5)) {
      hitch++;
      const info = {dProgs: progs - lastProgs, dTex: tex - lastTex, dGeo: geo - lastGeo, dHeap: h != null && lastHeap ? h - lastHeap : null, cpu: cpuMs, gpu: gpuMs, longTask: curLong.reduce((m, r) => Math.max(m, r.ms), 0)};
      const ev = {t: +((performance.now() - tStart) / 1000).toFixed(2), dt: Math.round(dtMs), cpuPrev: +cpuMs.toFixed(1), gpuPrev: +gpuMs.toFixed(1), calls: fc, tris: Math.round(ftr / 1000), progs, tex, geo, heapMB: h != null ? +h.toFixed(0) : null, ...ctxFn()};
      ev.why = lastCause = classify(dtMs, info); hitches.push(ev); if (hitches.length > 300) hitches.shift();
      if (on) console.warn('[perf] giật ' + ev.dt + 'ms @' + ev.t + 's → ' + ev.why);
    }
    lastProgs = progs; lastTex = tex; lastGeo = geo; if (h != null) lastHeap = h; curLong = [];
    // tổng hợp theo giây
    secAcc.n++; secAcc.sum += dtMs; if (dtMs > secAcc.max) secAcc.max = dtMs; if (dtMs > HITCH_MIN) secAcc.bad++; secAcc.cpu += cpuMs; secAcc.gpu += gpuMs;
    secAcc.calls += fc; secAcc.tris += ftr; if (inf) inf.reset();
    secT += dtMs;
    if (secT >= 1000) {
      const a = secAcc;
      timeline.push({t: +((performance.now() - tStart) / 1000).toFixed(0), fps: +(a.n * 1000 / a.sum).toFixed(1), maxMs: Math.round(a.max), cpu: +(a.cpu / a.n).toFixed(1), gpu: +(a.gpu / a.n).toFixed(1), calls: Math.round(a.calls / a.n), kTris: Math.round(a.tris / a.n / 1000), heapMB: h != null ? +h.toFixed(0) : null, progs, tex, geo, ...(timeline.length % 10 === 0 ? ctxFn() : {})});
      if (timeline.length > 900) timeline.shift();
      secAcc = {n: 0, sum: 0, max: 0, bad: 0, cpu: 0, gpu: 0, calls: 0, tris: 0}; secT = 0;
    }
  },
  reset() { since = 0; fn = 0; fi = 0; hitch = 0; hitches.length = 0; timeline.length = 0; longTasks.length = 0; tStart = performance.now(); if (rendererRef) rendererRef.info.reset(); },
  snapshot() {
    const a = Array.from(ft.subarray(0, fn)).sort((x, y) => x - y), n = a.length;
    const avg = n ? a.reduce((s, v) => s + v, 0) / n : 0;
    const info = rendererRef ? rendererRef.info : null, f = Math.max(1, since);
    const mem = heapMB();
    return {fps: avg ? +(1000 / avg).toFixed(1) : 0, avgMs: +avg.toFixed(2), p50: +(a[n >> 1] || 0).toFixed(2), p95: +(a[Math.floor(n * 0.95)] || 0).toFixed(2), p99: +(a[Math.floor(n * 0.99)] || 0).toFixed(2), hitches: hitch,
      calls: Math.round(callsEma), tris: Math.round(trisEma), cpu: +cpuEma.toFixed(1), gpu: tq ? +gpuEma.toFixed(1) : null,
      geoms: info ? info.memory.geometries : 0, tex: info ? info.memory.textures : 0, progs: info ? info.programs.length : 0, heapMB: mem != null ? Math.round(mem) : null};
  },
  device() {
    let gpu = ''; try { const g = rendererRef.getContext(), e = g.getExtension('WEBGL_debug_renderer_info'); if (e) gpu = g.getParameter(e.UNMASKED_RENDERER_WEBGL); } catch (e) {}
    return {ua: navigator.userAgent, gpu, cores: navigator.hardwareConcurrency, ramGB: navigator.deviceMemory || null, screen: screen.width + 'x' + screen.height, dpr: devicePixelRatio, win: innerWidth + 'x' + innerHeight, gpuTimer: !!tq};
  },
  report() {
    const causes = {}; hitches.forEach(h => { const k = h.why.split(' + ')[0].replace(/\(.*\)/, '').trim(); causes[k] = (causes[k] || 0) + 1; });
    return {when: new Date().toISOString(), seconds: Math.round((performance.now() - tStart) / 1000), device: this.device(), summary: this.snapshot(), hitchCauses: causes, hitches: hitches.slice(), longTasks: longTasks.slice(), timeline: timeline.slice()};
  },
  download() {
    const b = new Blob([JSON.stringify(this.report(), null, 1)], {type: 'application/json'}), a = document.createElement('a');
    a.href = URL.createObjectURL(b); a.download = 'vibelab-perf-' + new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19) + '.json'; document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 500);
  },
  toggle(v) {
    on = v === undefined ? !on : v;
    if (on && !el) { el = document.createElement('pre'); el.style.cssText = 'position:fixed;left:8px;bottom:8px;z-index:50;margin:0;padding:6px 9px;background:#000a;color:#8f8;font:11px/1.35 monospace;pointer-events:none;border-radius:6px;max-width:92vw;white-space:pre-wrap'; document.body.appendChild(el); }
    if (el) el.style.display = on ? 'block' : 'none';
  },
  draw(now) {
    if (!on || now - lastDraw < 500) return; lastDraw = now; const s = this.snapshot();
    el.textContent = `${s.fps} fps  ${s.avgMs}ms (p95 ${s.p95} · p99 ${s.p99})\nCPU ${s.cpu}ms  GPU ${s.gpu == null ? 'n/a' : s.gpu + 'ms'}\ncalls ${s.calls}  tris ${(s.tris / 1000).toFixed(0)}k\ngeo ${s.geoms} tex ${s.tex} prog ${s.progs}${s.heapMB != null ? '  heap ' + s.heapMB + 'MB' : ''}\ngiật>${HITCH_MIN}ms: ${s.hitches}${lastCause ? '\nlần cuối: ' + lastCause : ''}\n[F4] tải báo cáo  [F3] ẩn`;
  },
};
addEventListener('keydown', e => {
  if (e.code === 'F3') { e.preventDefault(); Perf.toggle(); }
  else if (e.code === 'F4') { e.preventDefault(); Perf.download(); }
});
