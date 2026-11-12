// Đồ dùng chung cho các trò trong PHÒNG GAME (src/arena/*.js).
// Mỗi trò: export default {id, title, icon, desc, rules, start(api)} → trả {stop()}.
// api: {stage, me, other, host, bot, seed, rng, send(d), onMsg(fn), score({bin,vy}), status(txt), end({winner, score})}
//   host  = người mời (nguồn quyết định kết quả). bot = luyện với máy (máy đóng vai người kia, không tính điểm / xu).
//   end() chỉ cần gọi ở host (hoặc khi luyện máy) — khung arena gửi kết quả cho người kia + ghi lên server.
export const NAME = {bin: 'Bin', vy: 'Vy'};
export const COL = {bin: '#4a90e2', vy: '#ec6fa0'};
export const COL2 = {bin: '#a9cdf5', vy: '#f7c1d5'};
export const rngOf = seed => { let s = (seed >>> 0) % 2147483647 || 1; return () => (s = (s * 16807) % 2147483647) / 2147483647; };
export const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
export const r3 = v => Math.round(v * 1000) / 1000;

// canvas co giãn theo khung, giữ tỉ lệ aspect (rộng / cao); sharp theo devicePixelRatio
export function mkCanvas(stage, aspect, draw) {
  const cv = document.createElement('canvas'); cv.className = 'ar-cv'; stage.appendChild(cv);
  const cx = cv.getContext('2d'); const S = {cv, cx, w: 1, h: 1, dpr: 1};
  const fit = () => {
    const r = stage.getBoundingClientRect(); let w = r.width, h = r.height;
    if (w / h > aspect) w = h * aspect; else h = w / aspect;
    S.dpr = Math.min(2, window.devicePixelRatio || 1); S.w = Math.max(10, w); S.h = Math.max(10, h);
    cv.style.width = S.w + 'px'; cv.style.height = S.h + 'px'; cv.width = Math.round(S.w * S.dpr); cv.height = Math.round(S.h * S.dpr);
    cx.setTransform(S.dpr, 0, 0, S.dpr, 0, 0); draw && draw();
  };
  const ro = new ResizeObserver(fit); ro.observe(stage); fit();
  S.pt = e => { const r = cv.getBoundingClientRect(); return {x: (e.clientX - r.left) / r.width, y: (e.clientY - r.top) / r.height}; };
  S.kill = () => { ro.disconnect(); cv.remove(); };
  return S;
}

export function rrect(cx, x, y, w, h, r) {
  cx.beginPath(); cx.moveTo(x + r, y); cx.arcTo(x + w, y, x + w, y + h, r); cx.arcTo(x + w, y + h, x, y + h, r); cx.arcTo(x, y + h, x, y, r); cx.arcTo(x, y, x + w, y, r); cx.closePath();
}

// vòng lặp khung hình có dt (giây), dừng bằng hàm trả về
export function loop(fn) {
  let raf = 0, last = performance.now(), on = true;
  const f = now => { if (!on) return; raf = requestAnimationFrame(f); const dt = Math.min(0.05, (now - last) / 1000); last = now; fn(dt, now); };
  raf = requestAnimationFrame(f);
  return () => { on = false; cancelAnimationFrame(raf); };
}

// tiếng bíp nhỏ (WebAudio) — không cần file âm thanh
let AC = null;
export function beep(freq = 660, dur = 0.08, type = 'sine', vol = 0.12) {
  try {
    AC = AC || new (window.AudioContext || window.webkitAudioContext)();
    const o = AC.createOscillator(), g = AC.createGain(); o.type = type; o.frequency.value = freq;
    g.gain.setValueAtTime(vol, AC.currentTime); g.gain.exponentialRampToValueAtTime(0.0001, AC.currentTime + dur);
    o.connect(g).connect(AC.destination); o.start(); o.stop(AC.currentTime + dur + 0.02);
  } catch (e) {}
}
