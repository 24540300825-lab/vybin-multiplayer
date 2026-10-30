// ===== Âm thanh hiệu ứng (SFX) — tổng hợp bằng Web Audio, KHÔNG cần file mp3 =====
// Một AudioContext dùng chung. Cấu trúc: nguồn → bus (ui/world/call/amb) → compressor → master → loa.
// - Trình duyệt chỉ cho phát sau lần bấm/gõ đầu tiên → ta tạo context lúc đó (unlock). Trước đó mọi lệnh play() im lặng, không lỗi.
// - Tắt/bật + âm lượng lưu trong localStorage (khóa vySfx). Mọi thứ bọc try/catch: âm thanh lỗi không bao giờ làm game dừng.
// - Giới hạn số âm cùng lúc + khoảng cách tối thiểu giữa 2 lần phát cùng 1 âm để không chói/không nặng máy.
const KEY = 'vySfx';
const hz = m => 440 * Math.pow(2, (m - 69) / 12);
const rnd = (a = 0, b = 1) => a + Math.random() * (b - a);
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

export function createEngine(ctx, opts = {}) {
  const sr = ctx.sampleRate;
  const comp = ctx.createDynamicsCompressor();
  comp.threshold.value = -14; comp.knee.value = 18; comp.ratio.value = 4; comp.attack.value = 0.004; comp.release.value = 0.18;
  const master = ctx.createGain(); master.gain.value = opts.vol == null ? 0.8 : opts.vol;
  const air = ctx.createBiquadFilter(); air.type = 'highshelf'; air.frequency.value = 4500; air.gain.value = -5;     // làm dịu cao tần toàn bộ
  const soft = ctx.createBiquadFilter(); soft.type = 'lowpass'; soft.frequency.value = 9000; soft.Q.value = 0.5;
  air.connect(soft); soft.connect(comp);
  comp.connect(master); master.connect(ctx.destination);
  const bus = {};
  for (const [n, g] of Object.entries({ui: 0.9, world: 1, call: 1, amb: 1})) { const b = ctx.createGain(); b.gain.value = g; b.connect(air); bus[n] = b; }
  // reverb nhẹ (xung phản hồi sinh ngẫu nhiên, tắt dần) cho chuông/chime
  const rv = ctx.createConvolver(); {
    const len = Math.floor(sr * 1.3), buf = ctx.createBuffer(2, len, sr);
    for (let c = 0; c < 2; c++) { const d = buf.getChannelData(c); for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 2.6); }
    rv.buffer = buf;
  }
  const wet = ctx.createGain(); wet.gain.value = 0.34; rv.connect(wet); wet.connect(air);
  const nbuf = ctx.createBuffer(1, sr * 2, sr); { const d = nbuf.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1; }
  let live = 0; const MAXV = opts.maxVoices || 56;

  const dest = (b, send) => { const n = ctx.createGain(); n.connect(bus[b] || bus.ui); if (send) { const s = ctx.createGain(); s.gain.value = send; n.connect(s); s.connect(rv); } return n; };
  const track = (src, stopAt) => { live++; src.onended = () => { live--; try { src.disconnect(); } catch (e) {} }; src.stop(stopAt); };

  // ---- khối dựng âm cơ bản ----
  // tone: dao động có envelope; f→f2 trượt tần số; hv = hệ số hài (thêm sóng bội cho tiếng chuông)
  function tone(t, dur, f, o = {}) {
    if (live > MAXV) return;
    const {type = 'sine', f2, peak = 0.2, a = 0.004, b = 'ui', lp, det = 0, send = 0, vib, curve = 'exp', pan = 0} = o;
    const osc = ctx.createOscillator(), g = ctx.createGain();
    osc.type = type; osc.frequency.setValueAtTime(f, t); if (f2) osc.frequency.exponentialRampToValueAtTime(Math.max(20, f2), t + dur);
    if (det) osc.detune.value = det;
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(Math.max(0.0002, peak), t + a);
    if (curve === 'lin') g.gain.linearRampToValueAtTime(0.0001, t + dur); else g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    let n = osc; if (lp) { const fl = ctx.createBiquadFilter(); fl.type = 'lowpass'; fl.frequency.value = lp; osc.connect(fl); n = fl; }
    n.connect(g);
    if (pan && ctx.createStereoPanner) { const pp = ctx.createStereoPanner(); pp.pan.value = pan; g.connect(pp); pp.connect(dest(b, send)); } else g.connect(dest(b, send));
    if (vib) { const l = ctx.createOscillator(), lg = ctx.createGain(); l.frequency.value = vib[0]; lg.gain.value = vib[1]; l.connect(lg); lg.connect(osc.frequency); l.start(t); l.stop(t + dur + 0.05); }
    osc.start(t); track(osc, t + dur + 0.05);
  }
  // noise: nhiễu lọc (tiếng gió, bước chân, "xì")
  function noise(t, dur, o = {}) {
    if (live > MAXV) return;
    const {type = 'bandpass', f = 1000, f2, q = 1, peak = 0.15, a = 0.004, b = 'ui', send = 0, pan = 0} = o;
    const s = ctx.createBufferSource(), fl = ctx.createBiquadFilter(), g = ctx.createGain();
    s.buffer = nbuf; fl.type = type; fl.frequency.setValueAtTime(f, t); if (f2) fl.frequency.exponentialRampToValueAtTime(Math.max(20, f2), t + dur); fl.Q.value = q;
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(Math.max(0.0002, peak), t + a); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    s.connect(fl); fl.connect(g);
    if (pan && ctx.createStereoPanner) { const p = ctx.createStereoPanner(); p.pan.value = pan; g.connect(p); p.connect(dest(b, send)); } else g.connect(dest(b, send));
    s.start(t, Math.random() * 1.5); track(s, t + dur + 0.05);
  }
  // bell: tiếng chuông/chime (cơ bản + 2 bội), vang nhẹ
  function bell(t, m, o = {}) {
    const {dur = 0.9, peak = 0.16, b = 'ui', send = 0.5} = o, f = typeof m === 'number' && m < 200 ? hz(m) : m;
    tone(t, dur, f, {peak, b, send, a: 0.003});
    tone(t, dur * 0.55, f * 2.01, {peak: peak * 0.32, b, send, a: 0.003});
    tone(t, dur * 0.3, f * 3.97, {peak: peak * 0.1, b, send, a: 0.002});
  }
  // mallet: nốt ngắn mềm kiểu marimba
  function mallet(t, m, o = {}) {
    const {dur = 0.35, peak = 0.16, b = 'call', send = 0.3} = o, f = hz(m);
    tone(t, dur, f, {type: 'triangle', peak, b, send, a: 0.002, lp: 2600});
    tone(t, dur * 0.4, f * 4, {peak: peak * 0.18, b, send, a: 0.001});
  }

  // ---- bảng nốt: thang ngũ cung Đô trưởng (C D E G A) — mọi giai điệu đều "hợp" nhau nên nghe dịu, không gắt ----
  const PENT = [0, 2, 4, 7, 9];
  const sc = d => 60 + PENT[((d % 5) + 5) % 5] + 12 * Math.floor(d / 5);       // d=0 → C4, 5 → C5, 10 → C6
  const pick = a => a[(Math.random() * a.length) | 0];
  const jit = (c, s = 0.06) => c * (1 + (Math.random() * 2 - 1) * s);            // lệch nhẹ để mỗi lần nghe hơi khác

  // ---- thư viện âm thanh: (t, o) → lên lịch phát tại thời điểm t; o.v = hệ số âm lượng, o.f = tham số riêng ----
  // Nguyên tắc: nốt mềm (vào chậm hơn, cắt cao tần), thang ngũ cung, mỗi âm có vài biến thể ngẫu nhiên.
  const LIB = {
    // ===== giao diện =====
    click: (t, o) => { const r = jit(1, 0.08); tone(t, 0.07, 640 * r, {f2: 420 * r, peak: 0.1 * o.v, a: 0.006, lp: 2200}); noise(t, 0.03, {type: 'lowpass', f: 1800, peak: 0.04 * o.v, a: 0.004}); },
    hover: (t, o) => tone(t, 0.09, hz(sc(pick([10, 11, 12, 13]))), {peak: 0.02 * o.v, a: 0.012, lp: 3000}),
    toggleOn: (t, o) => { const d = pick([7, 8, 9]); tone(t, 0.14, hz(sc(d)), {peak: 0.09 * o.v, a: 0.01, lp: 3000, send: 0.2}); tone(t + 0.08, 0.2, hz(sc(d + 2)), {peak: 0.09 * o.v, a: 0.01, lp: 3000, send: 0.2}); },
    toggleOff: (t, o) => { const d = pick([8, 9, 10]); tone(t, 0.14, hz(sc(d)), {peak: 0.08 * o.v, a: 0.01, lp: 2600, send: 0.2}); tone(t + 0.08, 0.2, hz(sc(d - 2)), {peak: 0.08 * o.v, a: 0.01, lp: 2600, send: 0.2}); },
    tab: (t, o) => tone(t, 0.18, hz(sc(pick([8, 9, 10, 11, 12]))), {type: 'triangle', peak: 0.09 * o.v, a: 0.008, lp: 2400, send: 0.25}),
    tick: (t, o) => tone(t, 0.07, hz(sc(6 + Math.round(clamp(o.f == null ? 0.5 : o.f, 0, 1) * 8))), {type: 'triangle', peak: 0.05 * o.v, a: 0.006, lp: 2600}),   // kéo thanh trượt = chạy lên/xuống thang nốt
    open: (t, o) => { noise(t, 0.28, {type: 'lowpass', f: 500, f2: 2000, q: 0.5, peak: 0.07 * o.v, a: 0.1}); tone(t + 0.04, 0.22, hz(sc(pick([5, 7, 8]))), {type: 'triangle', peak: 0.06 * o.v, a: 0.02, lp: 2000, send: 0.3}); },
    close: (t, o) => { noise(t, 0.24, {type: 'lowpass', f: 1800, f2: 400, q: 0.5, peak: 0.06 * o.v, a: 0.06}); tone(t, 0.2, hz(sc(pick([7, 8, 5]))), {type: 'triangle', peak: 0.05 * o.v, a: 0.02, lp: 1800, send: 0.3}); },
    error: (t, o) => { tone(t, 0.22, hz(52), {type: 'triangle', peak: 0.12 * o.v, a: 0.015, lp: 700}); tone(t + 0.17, 0.3, hz(48), {type: 'triangle', peak: 0.12 * o.v, a: 0.015, lp: 650}); },
    success: (t, o) => { const d = pick([10, 11, 12]); [0, 2, 3].forEach((s, i) => bell(t + i * 0.09, sc(d + s), {peak: 0.1 * o.v, dur: 0.9, send: 0.6})); },
    toast: (t, o) => bell(t, sc(pick([12, 13, 14, 15])), {peak: 0.09 * o.v, dur: 0.8, send: 0.6}),
    pop: (t, o) => { const r = jit(1, 0.1); tone(t, 0.1, 480 * r, {f2: 820 * r, peak: 0.09 * o.v, a: 0.01, lp: 2400}); },
    popupIn: (t, o) => { const m = pick([[12, 14], [14, 16], [11, 14]]); bell(t, sc(m[0]), {peak: 0.1 * o.v, dur: 0.8, send: 0.6}); bell(t + 0.1, sc(m[1]), {peak: 0.09 * o.v, dur: 0.9, send: 0.6}); },
    dismiss: (t, o) => { noise(t, 0.2, {type: 'lowpass', f: 1600, f2: 350, q: 0.5, peak: 0.05 * o.v, a: 0.05}); tone(t, 0.15, hz(sc(pick([8, 9]))), {f2: hz(sc(5)), type: 'triangle', peak: 0.04 * o.v, lp: 1500}); },
    msgIn: (t, o) => { const m = pick([[12, 14], [14, 12], [13, 15], [11, 14], [15, 12], [12, 16]]); bell(t, sc(m[0]), {peak: 0.14 * o.v, dur: 0.8, send: 0.55}); bell(t + 0.11, sc(m[1]), {peak: 0.12 * o.v, dur: 1.0, send: 0.55}); },
    msgOut: (t, o) => { const r = jit(1, 0.08); tone(t, 0.09, 520 * r, {f2: 900 * r, peak: 0.07 * o.v, a: 0.01, lp: 2400}); },
    key: (t, o) => { const r = jit(1, 0.12); noise(t, 0.03, {type: 'bandpass', f: 1500 * r, q: 2, peak: 0.07 * o.v, a: 0.003}); tone(t, 0.05, 170 * r, {f2: 110, peak: 0.05 * o.v, a: 0.004, lp: 500}); },
    copy: (t, o) => { const d = pick([9, 10, 11]); tone(t, 0.07, hz(sc(d)), {type: 'triangle', peak: 0.07 * o.v, lp: 2400}); tone(t + 0.07, 0.09, hz(sc(d + 2)), {type: 'triangle', peak: 0.07 * o.v, lp: 2400}); },
    taskDone: (t, o) => { const d = pick([9, 10, 11]); [0, 2, 4, 5].forEach((s, i) => bell(t + i * 0.07, sc(d + s), {peak: 0.09 * o.v, dur: 0.9, send: 0.6})); },
    taskAdd: (t, o) => { const d = pick([8, 9, 10]); tone(t, 0.1, hz(sc(d)), {peak: 0.08 * o.v, a: 0.01, lp: 2400}); tone(t + 0.07, 0.15, hz(sc(d + 3)), {peak: 0.07 * o.v, a: 0.01, lp: 2400, send: 0.3}); },
    del: (t, o) => { noise(t, 0.22, {type: 'lowpass', f: 1500, f2: 300, q: 0.5, peak: 0.07 * o.v, a: 0.04}); tone(t, 0.18, hz(sc(8)), {f2: hz(sc(3)), type: 'triangle', peak: 0.06 * o.v, lp: 1400}); },
    shutter: (t, o) => { noise(t, 0.04, {type: 'bandpass', f: 2600, q: 0.8, peak: 0.1 * o.v, a: 0.003}); tone(t, 0.06, 700, {f2: 300, peak: 0.07 * o.v, lp: 1500}); noise(t + 0.09, 0.05, {type: 'bandpass', f: 2000, q: 0.8, peak: 0.08 * o.v, a: 0.003}); tone(t + 0.09, 0.07, 420, {f2: 220, peak: 0.06 * o.v, lp: 1200}); },
    whoosh: (t, o) => { noise(t, 0.6, {type: 'lowpass', f: 300, f2: 2600, q: 0.6, peak: 0.1 * o.v, a: 0.22}); tone(t, 0.5, 150, {f2: 330, peak: 0.04 * o.v, a: 0.25, lp: 600}); },
    ready: (t, o) => [10, 12, 14, 17].forEach((d, i) => bell(t + i * 0.11, sc(d), {peak: 0.1 * o.v, dur: 1.2, send: 0.7})),
    musicPlay: (t, o) => { tone(t, 0.14, hz(sc(8)), {type: 'triangle', peak: 0.08 * o.v, a: 0.01, lp: 2200, send: 0.3}); tone(t + 0.09, 0.22, hz(sc(10)), {type: 'triangle', peak: 0.08 * o.v, a: 0.01, lp: 2200, send: 0.3}); },
    musicPause: (t, o) => { tone(t, 0.14, hz(sc(10)), {type: 'triangle', peak: 0.08 * o.v, a: 0.01, lp: 2200, send: 0.3}); tone(t + 0.09, 0.22, hz(sc(8)), {type: 'triangle', peak: 0.08 * o.v, a: 0.01, lp: 2200, send: 0.3}); },
    musicSkip: (t, o) => { noise(t, 0.16, {type: 'lowpass', f: 900, f2: 2600, q: 0.6, peak: 0.05 * o.v, a: 0.06}); tone(t + 0.04, 0.12, hz(sc(pick([9, 10, 11]))), {type: 'triangle', peak: 0.06 * o.v, lp: 2200}); },

    // ===== cuộc gọi (từng tiếng một; vòng lặp chuông nằm ở LOOPS) =====
    accept: (t, o) => [7, 9, 10, 12].forEach((d, i) => bell(t + i * 0.085, sc(d), {peak: 0.12 * o.v, dur: 0.9, b: 'call', send: 0.5})),
    decline: (t, o) => { [12, 9, 7].forEach((d, i) => tone(t + i * 0.13, 0.28, hz(sc(d)), {type: 'triangle', peak: 0.11 * o.v, a: 0.01, lp: 1500, b: 'call', send: 0.35})); },
    hangup: (t, o) => { tone(t, 0.26, hz(sc(10)), {peak: 0.11 * o.v, a: 0.01, lp: 2200, b: 'call', send: 0.45}); tone(t + 0.16, 0.5, hz(sc(5)), {peak: 0.11 * o.v, a: 0.01, lp: 2000, b: 'call', send: 0.45}); },
    connected: (t, o) => { bell(t, sc(14), {peak: 0.09 * o.v, dur: 1.0, b: 'call', send: 0.6}); bell(t + 0.12, sc(17), {peak: 0.06 * o.v, dur: 1.0, b: 'call', send: 0.6}); },
    peerJoin: (t, o) => { bell(t, sc(10), {peak: 0.1 * o.v, dur: 0.8, b: 'call', send: 0.5}); bell(t + 0.11, sc(12), {peak: 0.1 * o.v, dur: 1.0, b: 'call', send: 0.5}); },
    peerLeave: (t, o) => { bell(t, sc(12), {peak: 0.09 * o.v, dur: 0.8, b: 'call', send: 0.5}); bell(t + 0.11, sc(9), {peak: 0.09 * o.v, dur: 1.0, b: 'call', send: 0.5}); },
    mute: (t, o) => tone(t, 0.14, hz(sc(7)), {f2: hz(sc(5)), type: 'triangle', peak: 0.09 * o.v, a: 0.01, lp: 1600, b: 'call'}),
    unmute: (t, o) => tone(t, 0.14, hz(sc(5)), {f2: hz(sc(8)), type: 'triangle', peak: 0.09 * o.v, a: 0.01, lp: 1800, b: 'call'}),
    camOn: (t, o) => { tone(t, 0.1, hz(sc(8)), {type: 'triangle', peak: 0.08 * o.v, lp: 2200, b: 'call'}); tone(t + 0.08, 0.16, hz(sc(11)), {type: 'triangle', peak: 0.08 * o.v, lp: 2200, b: 'call', send: 0.3}); },
    camOff: (t, o) => { tone(t, 0.1, hz(sc(11)), {type: 'triangle', peak: 0.08 * o.v, lp: 2200, b: 'call'}); tone(t + 0.08, 0.16, hz(sc(8)), {type: 'triangle', peak: 0.08 * o.v, lp: 2200, b: 'call', send: 0.3}); },
    lost: (t, o) => [0, 1, 2].forEach(i => tone(t + i * 0.2, 0.34, hz(sc(8 - i * 2)), {type: 'triangle', peak: 0.07 * o.v, a: 0.02, lp: 1100, b: 'call', vib: [5, 6], send: 0.4})),
    recovered: (t, o) => [7, 9, 12].forEach((d, i) => bell(t + i * 0.09, sc(d), {peak: 0.09 * o.v, dur: 0.8, b: 'call', send: 0.5})),
    missed: (t, o) => { [14, 12, 9].forEach((d, i) => bell(t + i * 0.24, sc(d), {peak: 0.09 * o.v, dur: 1.1, b: 'call', send: 0.6})); },
    noAnswer: (t, o) => { [9, 7].forEach((d, i) => tone(t + i * 0.24, 0.45, hz(sc(d)), {type: 'triangle', peak: 0.1 * o.v, a: 0.02, lp: 1200, b: 'call', send: 0.4})); },
    ringStart: (t, o) => tone(t, 0.14, 700, {f2: 900, peak: 0.05 * o.v, b: 'call', lp: 2000}),

    // ===== thế giới: bước chân, đồ vật (mềm, nhiều biến thể) =====
    step: (t, o) => {            // o.f = {s:'wood'|'stair'|'grass', run:bool}
      const s = (o.f && o.f.s) || 'wood', run = o.f && o.f.run, k = (run ? 1.3 : 1) * o.v, r = rnd(0.85, 1.18), bal = rnd(-0.25, 0.25);
      if (s === 'grass') { noise(t, 0.12, {type: 'bandpass', f: 1400 * r, q: 0.5, peak: 0.07 * k, b: 'world', a: 0.02, pan: bal}); return; }
      if (s === 'stair') { tone(t, 0.14, 130 * r, {f2: 70, peak: 0.16 * k, a: 0.006, b: 'world', lp: 500}); noise(t, 0.07, {type: 'lowpass', f: 600 * r, peak: 0.09 * k, b: 'world', pan: bal}); if (Math.random() < 0.5) tone(t + 0.005, 0.06, 260 * r, {f2: 170, type: 'triangle', peak: 0.04 * k, b: 'world', lp: 900}); return; }
      const v = (Math.random() * 3) | 0;                 // 3 kiểu bước gỗ: tròn / khô / mềm
      if (v === 0) { tone(t, 0.1, 120 * r, {f2: 75, peak: 0.14 * k, a: 0.006, b: 'world', lp: 450}); noise(t, 0.06, {type: 'lowpass', f: 700 * r, peak: 0.07 * k, b: 'world', pan: bal}); }
      else if (v === 1) { tone(t, 0.08, 150 * r, {f2: 95, peak: 0.12 * k, a: 0.005, b: 'world', lp: 600}); noise(t, 0.04, {type: 'bandpass', f: 1300 * r, q: 0.8, peak: 0.05 * k, b: 'world', pan: bal}); }
      else { noise(t, 0.09, {type: 'lowpass', f: 520 * r, peak: 0.1 * k, b: 'world', a: 0.012, pan: bal}); tone(t, 0.09, 105 * r, {f2: 70, peak: 0.1 * k, a: 0.01, b: 'world', lp: 380}); }
    },
    sit: (t, o) => { noise(t, 0.3, {type: 'lowpass', f: 450, peak: 0.14 * o.v, b: 'world', a: 0.04}); tone(t, 0.2, 88, {f2: 58, peak: 0.13 * o.v, b: 'world', lp: 320, a: 0.01}); tone(t + 0.05, 0.4, 330, {f2: 270, peak: 0.025 * o.v, b: 'world', vib: [11, 8], lp: 900, type: 'triangle', a: 0.04}); },
    standUp: (t, o) => { tone(t, 0.34, 270, {f2: 350, peak: 0.025 * o.v, b: 'world', vib: [10, 7], lp: 900, type: 'triangle', a: 0.06}); noise(t, 0.4, {type: 'lowpass', f: 500, f2: 1100, q: 0.4, peak: 0.06 * o.v, b: 'world', a: 0.1}); tone(t + 0.28, 0.14, 110, {f2: 75, peak: 0.08 * o.v, b: 'world', lp: 380, a: 0.01}); },
    bedClimb: (t, o) => { noise(t, 0.5, {type: 'lowpass', f: 380, peak: 0.13 * o.v, b: 'world', a: 0.08}); [0, 0.18, 0.36].forEach((d, i) => tone(t + d, 0.2, 470 - i * 40, {f2: 410 - i * 40, peak: 0.022 * o.v, b: 'world', vib: [16, 10], lp: 900, type: 'triangle', a: 0.05})); tone(t + 0.25, 0.28, 72, {f2: 52, peak: 0.12 * o.v, b: 'world', lp: 260, a: 0.02}); },
    bedOff: (t, o) => { noise(t, 0.4, {type: 'lowpass', f: 450, f2: 240, peak: 0.1 * o.v, b: 'world', a: 0.06}); tone(t, 0.26, 400, {f2: 470, peak: 0.022 * o.v, b: 'world', vib: [14, 9], lp: 900, type: 'triangle', a: 0.05}); tone(t + 0.3, 0.16, 105, {f2: 72, peak: 0.08 * o.v, b: 'world', lp: 340, a: 0.01}); },
    sleep: (t, o) => { [7, 4, 2].forEach((d, i) => tone(t + i * 0.6, 2.2, hz(sc(d)), {peak: 0.055 * o.v, a: 0.4, b: 'world', send: 0.7, lp: 1100})); },
    wake: (t, o) => { [2, 4, 7, 9].forEach((d, i) => bell(t + i * 0.13, sc(d + 5), {peak: 0.07 * o.v, dur: 1.2, b: 'world', send: 0.6})); },
    doorOpen: (t, o) => { tone(t, 0.6, 150, {f2: 215, type: 'triangle', peak: 0.05 * o.v, a: 0.12, lp: 600, b: 'world', vib: [6, 10]}); noise(t, 0.55, {type: 'bandpass', f: 600, f2: 900, q: 2, peak: 0.03 * o.v, b: 'world', a: 0.15}); noise(t + 0.02, 0.04, {type: 'bandpass', f: 1800, q: 1, peak: 0.07 * o.v, b: 'world'}); },
    doorClose: (t, o) => { tone(t, 0.5, 210, {f2: 150, type: 'triangle', peak: 0.04 * o.v, a: 0.1, lp: 550, b: 'world', vib: [6, 9]}); tone(t + 0.48, 0.2, 90, {f2: 55, peak: 0.16 * o.v, b: 'world', lp: 300, a: 0.01}); noise(t + 0.48, 0.07, {type: 'lowpass', f: 700, peak: 0.1 * o.v, b: 'world'}); noise(t + 0.5, 0.025, {type: 'bandpass', f: 2200, q: 1, peak: 0.05 * o.v, b: 'world'}); },
    lamp: (t, o) => { tone(t, 0.05, 1500, {f2: 1100, peak: 0.07 * o.v, b: 'world', lp: 2500}); tone(t + 0.05, 0.06, 1100, {f2: 800, peak: 0.05 * o.v, b: 'world', lp: 2200}); },
    weather: (t, o) => { const d = pick([7, 8, 9]); [0, 2, 4].forEach((s, i) => tone(t + i * 0.25, 2.0, hz(sc(d + s)), {peak: 0.03 * o.v, a: 0.5, b: 'amb', send: 0.9, lp: 1600})); noise(t, 1.8, {type: 'lowpass', f: 400, f2: 1800, q: 0.4, peak: 0.03 * o.v, a: 0.6, b: 'amb'}); },
    thunder: (t, o) => { noise(t, 3.4, {type: 'lowpass', f: 180, f2: 55, q: 0.6, peak: 0.45 * o.v, a: 0.2, b: 'amb', send: 0.5}); noise(t + 0.05, 0.7, {type: 'lowpass', f: 900, f2: 160, peak: 0.18 * o.v, a: 0.04, b: 'amb'}); },
    bird: (t, o) => {            // 3 kiểu chim: líu lo luyến / hai nốt gọi nhau / chuỗi nốt rơi
      const pan = rnd(-0.8, 0.8), kind = (Math.random() * 3) | 0, base = rnd(2300, 3600), p = 0.026 * o.v;
      if (kind === 0) for (let i = 0, n = 3 + (Math.random() * 3 | 0); i < n; i++) { const f = base * rnd(0.9, 1.3); tone(t + i * rnd(0.09, 0.15), 0.12, f, {f2: f * rnd(0.8, 1.3), peak: p, b: 'amb', vib: [28, 30], send: 0.35, a: 0.012, pan}); }
      else if (kind === 1) { tone(t, 0.2, base, {f2: base * 1.18, peak: p, b: 'amb', send: 0.4, a: 0.02, pan}); tone(t + 0.32, 0.25, base * 0.84, {f2: base * 0.8, peak: p * 0.9, b: 'amb', send: 0.4, a: 0.02, pan}); }
      else for (let i = 0; i < 4; i++) tone(t + i * 0.12, 0.16, base * (1.25 - i * 0.07), {peak: p * (1 - i * 0.12), b: 'amb', send: 0.4, a: 0.015, pan});
    },
    cricket: (t, o) => { const f = rnd(3900, 4700), n = pick([2, 3, 3, 4]), pan = rnd(-0.8, 0.8); for (let i = 0; i < n; i++) tone(t + i * rnd(0.075, 0.1), 0.07, f, {peak: 0.009 * o.v, b: 'amb', a: 0.015, vib: [55, 70], lp: 5000, pan}); },
    chime: (t, o) => { const m = pick([[12, 14, 17], [14, 17, 19], [11, 14, 16], [17, 14, 12]]), pan = rnd(-0.6, 0.6); m.forEach((d, i) => tone(t + i * rnd(0.35, 0.7), 2.6, hz(sc(d)), {peak: 0.022 * o.v, a: 0.01, b: 'amb', send: 0.95, lp: 3000, pan})); },
  };
  // hệ số cân bằng âm lượng (đo bằng render offline, đưa mọi âm về đỉnh mục tiêu)
  const TRIM = {click: 3.34, hover: 3.35, toggleOn: 1.35, toggleOff: 1.45, tab: 3.49, tick: 3.34, open: 2.21, close: 3.75, error: 1.12, success: 0.83, toast: 2.16, pop: 3.17, popupIn: 1.17, dismiss: 5.1, msgIn: 0.91, msgOut: 2.96, key: 2.41, copy: 1.42, taskDone: 0.86, taskAdd: 1.15, del: 3.73, shutter: 2.11, whoosh: 2.13, ready: 0.94, musicPlay: 1.36, musicPause: 1.38, musicSkip: 1.84, accept: 0.89, decline: 1.42, hangup: 1.57, connected: 1.31, peerJoin: 1.02, peerLeave: 1.13, mute: 2.48, unmute: 2.4, camOn: 1.06, camOff: 1.09, lost: 1.26, recovered: 1, missed: 1.05, noAnswer: 1.28, step: 2.7, sit: 2.62, standUp: 1.22, bedClimb: 1.31, bedOff: 1.5, sleep: 1.03, wake: 0.98, doorOpen: 1.85, doorClose: 1.33, lamp: 1.75, weather: 1.13, thunder: 5.16, bird: 2.13, cricket: 2.34, chime: 1.16};
  const GAP = {hover: 0.12, chime: 2, click: 0.04, tick: 0.035, step: 0.08, key: 0.025, msgIn: 0.25, toast: 0.3, bird: 0.5, cricket: 0.2};
  const last = {};
  function play(name, o = {}) {
    const fn = LIB[name]; if (!fn) return false;
    const now = ctx.currentTime; if (GAP[name] && now - (last[name] || -9) < GAP[name]) return false; last[name] = now;
    try { fn(now + (o.delay || 0) + 0.005, {v: (o.v == null ? 1 : o.v) * (TRIM[name] || 1), f: o.f}); return true; } catch (e) { console.debug('[sfx]', name, e); return false; }
  }

  // ---- vòng lặp có chu kỳ (chuông gọi đến/đi) ----
  // chuông xoay vòng qua vài giai điệu ngũ cung nên nghe nhiều lần vẫn không chán
  let ringN = 0, outN = 0;
  const RING_PH = [[[12, 14, 16, 19], [19, 16, 14]], [[14, 16, 19, 21], [19, 16, 12]], [[16, 14, 12, 14, 16], [19, 16]], [[12, 16, 19, 16], [14, 12, 9]]];
  const OUT_PH = [[[9, 12], [9, 14]], [[7, 11], [7, 12]], [[9, 14], [11, 12]]];
  const LOOPS = {
    ringIn: {period: 2.7, bus: 'call', fn: (t) => {
      const ph = RING_PH[ringN++ % RING_PH.length];
      ph[0].forEach((d, i) => bell(t + i * 0.14, sc(d), {peak: 0.17, dur: 0.9, b: 'call', send: 0.55}));
      ph[1].forEach((d, i) => bell(t + 1.0 + i * 0.15, sc(d), {peak: 0.14, dur: 1.0, b: 'call', send: 0.55}));
      tone(t, 0.9, hz(sc(0)), {peak: 0.05, lp: 350, b: 'call', a: 0.05}); tone(t + 1.0, 0.9, hz(sc(3)), {peak: 0.04, lp: 350, b: 'call', a: 0.05});
    }},
    ringOut: {period: 3.4, bus: 'call', fn: (t) => {
      const ph = OUT_PH[outN++ % OUT_PH.length];
      ph.forEach((pr, k) => { mallet(t + k * 0.9, sc(pr[0]), {peak: 0.11}); mallet(t + k * 0.9 + 0.22, sc(pr[1]), {peak: 0.09}); });
    }},
  };
  const loopsOn = {};
  function startLoop(name) {
    const L = LOOPS[name]; if (!L || loopsOn[name]) return;
    const g = ctx.createGain(); g.gain.value = 1; g.connect(bus.call);       // vòng lặp có bus riêng để cắt tắt nhanh
    const h = loopsOn[name] = {g, timer: 0, stopped: false};
    const tick = () => {
      if (h.stopped) return;
      const saved = bus.call; try { bus.call = g; L.fn(ctx.currentTime + 0.03); } catch (e) { console.debug('[sfx] loop', e); } finally { bus.call = saved; }
      h.timer = setTimeout(tick, L.period * 1000);
    };
    tick();
  }
  function stopLoop(name, fade = 0.12) {
    const h = loopsOn[name]; if (!h) return; delete loopsOn[name]; h.stopped = true; clearTimeout(h.timer);
    const t = ctx.currentTime; try { h.g.gain.cancelScheduledValues(t); h.g.gain.setValueAtTime(h.g.gain.value, t); h.g.gain.linearRampToValueAtTime(0, t + fade); } catch (e) {}
    setTimeout(() => { try { h.g.disconnect(); } catch (e) {} }, fade * 1000 + 800);
  }

  // ---- môi trường: gió (nhiễu nâu dài 26s, 2 lớp lệch pha + gió giật ngẫu nhiên → không nghe ra vòng lặp), chim, dế, chuông gió ----
  const amb = {wind: null, birdT: 0, cricT: 0, chimeT: 0, base: 0.02, gustT: 0};
  function windInit() {
    const len = Math.floor(sr * 26), buf = ctx.createBuffer(2, len, sr);
    for (let c = 0; c < 2; c++) { const d = buf.getChannelData(c); let l = 0; for (let i = 0; i < len; i++) { l = (l + 0.02 * (Math.random() * 2 - 1)) / 1.02; d[i] = l * 3.2; } }
    const mk = (rate, off, type, f, q) => {
      const s = ctx.createBufferSource(), fl = ctx.createBiquadFilter(); s.buffer = buf; s.loop = true; s.playbackRate.value = rate; fl.type = type; fl.frequency.value = f; fl.Q.value = q; s.connect(fl); s.start(0, off); return fl;
    };
    const out = ctx.createGain(); out.gain.value = 0;
    const body = ctx.createGain(), air = ctx.createGain(); body.gain.value = 1; air.gain.value = 0.25;
    const f1 = mk(0.94, rnd(0, 20), 'lowpass', 420, 0.3), f2 = mk(1.06, rnd(0, 20), 'lowpass', 520, 0.3), f3 = mk(1.0, rnd(0, 20), 'bandpass', 800, 0.35);
    f1.connect(body); f2.connect(body); f3.connect(air); body.connect(out); air.connect(out);
    const lpS = ctx.createBiquadFilter(); lpS.type = 'lowpass'; lpS.frequency.value = 2200; out.connect(lpS); lpS.connect(bus.amb);
    amb.wind = {out, body, air, f1, f2, f3};
  }
  function gust() {          // gió giật ngẫu nhiên: đổi độ to + độ sáng chậm rãi, khoảng cách và biên độ ngẫu nhiên
    const w = amb.wind; if (!w) return; const t = ctx.currentTime, k = rnd(0.45, 1.25);
    w.out.gain.setTargetAtTime(amb.base * k, t, rnd(1.3, 3));
    const fr = rnd(0.7, 1.35); w.f1.frequency.setTargetAtTime(420 * fr, t, 2); w.f2.frequency.setTargetAtTime(520 * fr, t, 2.4); w.f3.frequency.setTargetAtTime(800 * rnd(0.6, 1.4), t, 2.2);
    w.air.gain.setTargetAtTime(rnd(0.12, 0.4), t, 2);
    amb.gustT = setTimeout(gust, rnd(2500, 8000));
  }
  function ambience(p) {
    if (!amb.wind) { windInit(); gust(); }
    const w = clamp(p.wind || 0, 0, 2.6), on = p.on !== false;
    amb.base = on ? (0.008 + 0.03 * Math.min(1, w / 2)) * (p.snow ? 0.8 : 1) * (p.fog ? 0.5 : 1) : 0;
    if (!on) amb.wind.out.gain.setTargetAtTime(0, ctx.currentTime, 0.5);
    const now = performance.now();
    if (on && !document.hidden) {
      if (p.day && !p.rain && w < 1.4 && now > amb.birdT) { amb.birdT = now + rnd(3500, 11000) * (p.clear ? 1 : 2.2); if (Math.random() < 0.75) play('bird', {v: 1}); }
      if (p.night && !p.rain && w < 1.2 && now > amb.cricT) { amb.cricT = now + rnd(900, 2200); play('cricket', {v: 1}); }
      if (w < 1.6 && now > amb.chimeT) { amb.chimeT = now + rnd(14000, 34000); if (Math.random() < 0.7) play('chime', {v: 1}); }
    }
  }

  return {ctx, master, play, startLoop, stopLoop, ambience, LIB, LOOPS, TRIM, bus, isLoop: n => !!loopsOn[n]};
}

// ===== Singleton dùng trong game =====
let E = null, cfg = {vol: 0.8, on: true, amb: true};
try { Object.assign(cfg, JSON.parse(localStorage.getItem(KEY) || '{}')); } catch (e) {}
const save = () => { try { localStorage.setItem(KEY, JSON.stringify(cfg)); } catch (e) {} };
const pending = [];                       // lệnh gọi trước khi mở khóa: chỉ giữ vòng lặp chuông (quan trọng) để chuông vẫn kêu ngay khi có tương tác
let wantLoops = new Set();

function unlock() {
  try {
    if (!E) {
      const A = window.AudioContext || window.webkitAudioContext; if (!A) return;
      E = createEngine(new A({latencyHint: 'interactive'}), {vol: cfg.on ? cfg.vol : 0});
      wantLoops.forEach(n => E.startLoop(n));
    }
    if (E.ctx.state !== 'running') E.ctx.resume().catch(() => {});
  } catch (e) { console.debug('[sfx] unlock', e); }
}

export const SFX = {
  get ready() { return !!E && E.ctx.state === 'running'; },
  get cfg() { return cfg; },
  init() {
    ['pointerdown', 'keydown', 'touchstart'].forEach(ev => addEventListener(ev, unlock, {capture: true, passive: true}));
    document.addEventListener('visibilitychange', () => { if (E && !document.hidden && E.ctx.state === 'suspended') E.ctx.resume().catch(() => {}); });
    bindSettings(); bindUi();
  },
  play(name, o) { if (!cfg.on || !E || E.ctx.state !== 'running') return false; return E.play(name, o); },
  // phát có khoảng cách: dist (m) → nhỏ dần và tối dần; quá xa thì bỏ
  playAt(name, dist, o = {}) { const v = clamp(1 - dist / (o.range || 14), 0, 1); if (v < 0.04) return false; return this.play(name, {...o, v: (o.v == null ? 1 : o.v) * v * v}); },
  loop(name, on) {
    if (on) { wantLoops.add(name); if (E && cfg.on) E.startLoop(name); } else { wantLoops.delete(name); if (E) E.stopLoop(name); }
  },
  isLooping: n => wantLoops.has(n),
  ambience(p) { if (!E || E.ctx.state !== 'running') return; E.ambience({...p, on: cfg.on && cfg.amb}); },
  setVol(v) { cfg.vol = clamp(+v, 0, 1); save(); if (E) E.master.gain.setTargetAtTime(cfg.on ? cfg.vol : 0, E.ctx.currentTime, 0.03); },
  setOn(v) { cfg.on = !!v; save(); if (E) { E.master.gain.setTargetAtTime(cfg.on ? cfg.vol : 0, E.ctx.currentTime, 0.03); if (cfg.on) wantLoops.forEach(n => E.startLoop(n)); else Object.keys(E.LOOPS).forEach(n => E.stopLoop(n)); } },
  setAmb(v) { cfg.amb = !!v; save(); },
  // gõ phím: phát tiếng gõ ngẫu nhiên đến khi tắt. id để nhiều nhân vật gõ cùng lúc
  typing(id, on, v = 1) {
    typers[id] && (clearTimeout(typers[id]), delete typers[id]);
    if (!on) return;
    const go = () => { this.play('key', {v}); typers[id] = setTimeout(go, Math.random() < 0.12 ? 380 + Math.random() * 500 : 70 + Math.random() * 150); };
    typers[id] = setTimeout(go, 120);
  },
};
const typers = {};

// ---- gắn vào cài đặt (thanh trượt + nút bật/tắt trong bảng Cài đặt) ----
function bindSettings() {
  const vol = document.getElementById('sSfx'), on = document.getElementById('sSfxOn'), amb = document.getElementById('sAmb');
  if (vol) { vol.value = cfg.vol; vol.addEventListener('input', () => { SFX.setVol(vol.value); }); vol.addEventListener('change', () => SFX.play('pop')); }
  if (on) { on.checked = cfg.on; on.addEventListener('change', () => { SFX.setOn(on.checked); }); }
  if (amb) { amb.checked = cfg.amb; amb.addEventListener('change', () => { SFX.setAmb(amb.checked); }); }
}

// ---- âm thanh giao diện tự động: hover/click/bật tắt/kéo thanh/mở-đóng bảng/toast ----
const CLICKABLE = 'button,.ib,.chip,.pl,.mc,[role=button],summary,.cpop,select,a[href]';
function bindUi() {
  const skip = el => el.closest('[data-nosfx]');
  let lastHover = null;
  document.addEventListener('pointerover', e => {
    if (e.pointerType === 'touch') return;
    const el = e.target.closest && e.target.closest(CLICKABLE); if (!el || el === lastHover || skip(el)) return;
    lastHover = el; SFX.play('hover');
  }, true);
  document.addEventListener('pointerout', e => { if (lastHover && !lastHover.contains(e.relatedTarget)) lastHover = null; }, true);
  document.addEventListener('click', e => {
    const t = e.target; if (!t.closest) return;
    const el = t.closest(CLICKABLE); if (!el || skip(el)) return;
    if (el.classList.contains('chip')) SFX.play('tab'); else SFX.play('click');
  }, true);
  document.addEventListener('change', e => {
    const t = e.target; if (!t || skip(t)) return;
    if (t.type === 'checkbox') { if (t.closest('.tk')) SFX.play(t.checked ? 'taskDone' : 'toggleOff'); else SFX.play(t.checked ? 'toggleOn' : 'toggleOff'); }
    else if (t.tagName === 'SELECT') SFX.play('tab');
  }, true);
  const lastV = new WeakMap();
  document.addEventListener('input', e => {
    const t = e.target; if (!t || skip(t)) return;
    if (t.type === 'range') {
      const mn = +t.min || 0, mx = +t.max || 1, f = (+t.value - mn) / Math.max(1e-6, mx - mn), q = Math.round(f * 20);
      if (lastV.get(t) !== q) { lastV.set(t, q); SFX.play('tick', {f}); }
    } else if ((t.tagName === 'INPUT' && /text|search|url|^$/.test(t.type || '')) || t.tagName === 'TEXTAREA') {
      if (e.inputType && e.inputType.startsWith('insert')) SFX.play('key', {v: 0.8});
    }
  }, true);
  // mở / đóng bảng: bất kỳ phần tử .hud/#hSet/#hMap… được thêm/bớt class "on"
  const mo = new MutationObserver(list => {
    for (const m of list) {
      const el = m.target; if (el.nodeType !== 1 || el.closest('[data-nosfx]')) continue;
      const was = (m.oldValue || '').split(/\s+/).includes('on'), now = el.classList.contains('on');
      if (was === now) continue;
      if (el.id === 'hCall' || el.id === 'chPops' || el.classList.contains('chip') || el.classList.contains('ib') || el.classList.contains('pl') || el.classList.contains('mc') || /^(mList)$/.test(el.id)) continue;
      SFX.play(now ? 'open' : 'close');
    }
  });
  mo.observe(document.body, {subtree: true, attributes: true, attributeFilter: ['class'], attributeOldValue: true});
  // toast mới → tiếng báo nhẹ
  const toast = document.getElementById('toast');
  if (toast) {
    let lastTxt = '';
    new MutationObserver(() => {
      const tx = toast.textContent.trim(); if (!tx || tx === lastTxt) { lastTxt = tx; return; } lastTxt = tx;
      SFX.play(/(không|lỗi|chưa|mất|bị chặn|⚠)/i.test(tx) ? 'error' : 'toast');
    }).observe(toast, {childList: true, characterData: true, subtree: true});
  }
}
