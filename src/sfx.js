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
  comp.connect(master); master.connect(ctx.destination);
  const bus = {};
  for (const [n, g] of Object.entries({ui: 0.9, world: 1, call: 1, amb: 1})) { const b = ctx.createGain(); b.gain.value = g; b.connect(comp); bus[n] = b; }
  // reverb nhẹ (xung phản hồi sinh ngẫu nhiên, tắt dần) cho chuông/chime
  const rv = ctx.createConvolver(); {
    const len = Math.floor(sr * 1.3), buf = ctx.createBuffer(2, len, sr);
    for (let c = 0; c < 2; c++) { const d = buf.getChannelData(c); for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 2.6); }
    rv.buffer = buf;
  }
  const wet = ctx.createGain(); wet.gain.value = 0.28; rv.connect(wet); wet.connect(comp);
  const nbuf = ctx.createBuffer(1, sr * 2, sr); { const d = nbuf.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1; }
  let live = 0; const MAXV = 56;

  const dest = (b, send) => { const n = ctx.createGain(); n.connect(bus[b] || bus.ui); if (send) { const s = ctx.createGain(); s.gain.value = send; n.connect(s); s.connect(rv); } return n; };
  const track = (src, stopAt) => { live++; src.onended = () => { live--; try { src.disconnect(); } catch (e) {} }; src.stop(stopAt); };

  // ---- khối dựng âm cơ bản ----
  // tone: dao động có envelope; f→f2 trượt tần số; hv = hệ số hài (thêm sóng bội cho tiếng chuông)
  function tone(t, dur, f, o = {}) {
    if (live > MAXV) return;
    const {type = 'sine', f2, peak = 0.2, a = 0.004, b = 'ui', lp, det = 0, send = 0, vib, curve = 'exp'} = o;
    const osc = ctx.createOscillator(), g = ctx.createGain();
    osc.type = type; osc.frequency.setValueAtTime(f, t); if (f2) osc.frequency.exponentialRampToValueAtTime(Math.max(20, f2), t + dur);
    if (det) osc.detune.value = det;
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(Math.max(0.0002, peak), t + a);
    if (curve === 'lin') g.gain.linearRampToValueAtTime(0.0001, t + dur); else g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    let n = osc; if (lp) { const fl = ctx.createBiquadFilter(); fl.type = 'lowpass'; fl.frequency.value = lp; osc.connect(fl); n = fl; }
    n.connect(g); g.connect(dest(b, send));
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

  // ---- thư viện âm thanh: (t, o) → lên lịch phát tại thời điểm t; o.v = hệ số âm lượng, o.f = tham số riêng ----
  const LIB = {
    // ===== giao diện =====
    click: (t, o) => { tone(t, 0.04, 1500, {f2: 820, peak: 0.1 * o.v}); noise(t, 0.02, {type: 'highpass', f: 4200, peak: 0.05 * o.v}); },
    hover: (t, o) => tone(t, 0.035, 2300, {peak: 0.022 * o.v}),
    toggleOn: (t, o) => { tone(t, 0.07, 880, {peak: 0.09 * o.v, f2: 990}); tone(t + 0.065, 0.1, 1320, {peak: 0.09 * o.v}); },
    toggleOff: (t, o) => { tone(t, 0.07, 1100, {peak: 0.08 * o.v, f2: 990}); tone(t + 0.065, 0.1, 700, {peak: 0.08 * o.v}); },
    tab: (t, o) => { tone(t, 0.06, 660, {type: 'triangle', peak: 0.09 * o.v, lp: 2400}); tone(t + 0.045, 0.07, 990, {type: 'triangle', peak: 0.07 * o.v, lp: 2400}); },
    tick: (t, o) => tone(t, 0.03, 520 + 760 * clamp(o.f == null ? 0.5 : o.f, 0, 1), {type: 'triangle', peak: 0.05 * o.v, lp: 3000}),
    open: (t, o) => { noise(t, 0.2, {f: 400, f2: 2200, q: 0.9, peak: 0.07 * o.v}); tone(t, 0.14, 520, {f2: 800, peak: 0.07 * o.v, type: 'triangle', lp: 2500}); },
    close: (t, o) => { noise(t, 0.18, {f: 2200, f2: 380, q: 0.9, peak: 0.06 * o.v}); tone(t, 0.12, 800, {f2: 480, peak: 0.06 * o.v, type: 'triangle', lp: 2500}); },
    error: (t, o) => { tone(t, 0.13, 230, {type: 'square', peak: 0.07 * o.v, lp: 900}); tone(t + 0.14, 0.2, 190, {type: 'square', peak: 0.07 * o.v, lp: 800}); },
    success: (t, o) => [84, 88, 91].forEach((m, i) => bell(t + i * 0.07, m, {peak: 0.1 * o.v, dur: 0.7})),
    toast: (t, o) => bell(t, 83, {peak: 0.09 * o.v, dur: 0.6}),
    pop: (t, o) => { tone(t, 0.07, 640, {f2: 1250, peak: 0.1 * o.v}); noise(t, 0.015, {type: 'highpass', f: 5000, peak: 0.04 * o.v}); },
    popupIn: (t, o) => { bell(t, 83, {peak: 0.1 * o.v, dur: 0.6}); bell(t + 0.08, 88, {peak: 0.09 * o.v, dur: 0.7}); },
    dismiss: (t, o) => { noise(t, 0.14, {f: 2400, f2: 500, q: 0.8, peak: 0.05 * o.v}); tone(t, 0.1, 700, {f2: 420, peak: 0.05 * o.v, lp: 2000}); },
    msgIn: (t, o) => { bell(t, 84, {peak: 0.15 * o.v, dur: 0.55}); bell(t + 0.09, 91, {peak: 0.13 * o.v, dur: 0.7}); },
    msgOut: (t, o) => { tone(t, 0.06, 620, {f2: 1100, peak: 0.08 * o.v}); noise(t + 0.01, 0.06, {f: 3000, f2: 7000, q: 0.7, peak: 0.03 * o.v}); },
    key: (t, o) => { const r = rnd(0.9, 1.15); noise(t, 0.012, {f: 2600 * r, q: 3, peak: 0.07 * o.v}); tone(t, 0.02, 3200 * r, {peak: 0.015 * o.v}); tone(t, 0.03, 190 * r, {f2: 120, peak: 0.03 * o.v, lp: 500}); },
    copy: (t, o) => { tone(t, 0.04, 1800, {peak: 0.07 * o.v}); tone(t + 0.07, 0.05, 2400, {peak: 0.07 * o.v}); },
    taskDone: (t, o) => { [79, 83, 86, 91].forEach((m, i) => bell(t + i * 0.055, m, {peak: 0.09 * o.v, dur: 0.6})); },
    taskAdd: (t, o) => { tone(t, 0.06, 740, {f2: 1100, peak: 0.08 * o.v}); tone(t + 0.06, 0.08, 1480, {peak: 0.06 * o.v}); },
    del: (t, o) => { noise(t, 0.16, {f: 1800, f2: 300, q: 0.7, peak: 0.07 * o.v}); tone(t, 0.12, 500, {f2: 220, peak: 0.07 * o.v, lp: 1500}); },
    shutter: (t, o) => { noise(t, 0.025, {type: 'highpass', f: 3000, peak: 0.14 * o.v}); tone(t, 0.04, 900, {f2: 300, peak: 0.1 * o.v}); noise(t + 0.07, 0.03, {type: 'highpass', f: 2500, peak: 0.1 * o.v}); tone(t + 0.07, 0.05, 500, {f2: 220, peak: 0.08 * o.v}); },
    whoosh: (t, o) => { noise(t, 0.5, {f: 250, f2: 3500, q: 0.8, peak: 0.1 * o.v, a: 0.18}); tone(t, 0.45, 160, {f2: 420, peak: 0.05 * o.v, a: 0.2, lp: 800}); },
    ready: (t, o) => [79, 84, 88, 91].forEach((m, i) => bell(t + i * 0.09, m, {peak: 0.1 * o.v, dur: 0.9})),
    musicPlay: (t, o) => { tone(t, 0.09, 520, {type: 'triangle', peak: 0.08 * o.v, lp: 2200}); tone(t + 0.08, 0.14, 780, {type: 'triangle', peak: 0.08 * o.v, lp: 2200}); },
    musicPause: (t, o) => { tone(t, 0.09, 780, {type: 'triangle', peak: 0.08 * o.v, lp: 2200}); tone(t + 0.08, 0.14, 520, {type: 'triangle', peak: 0.08 * o.v, lp: 2200}); },
    musicSkip: (t, o) => { noise(t, 0.12, {f: 1200, f2: 3500, q: 1, peak: 0.06 * o.v}); tone(t + 0.05, 0.08, 1040, {type: 'triangle', peak: 0.06 * o.v, lp: 2500}); },

    // ===== cuộc gọi (từng tiếng một; vòng lặp chuông nằm ở LOOPS) =====
    accept: (t, o) => [72, 76, 79, 84].forEach((m, i) => bell(t + i * 0.075, m, {peak: 0.12 * o.v, dur: 0.8, b: 'call'})),
    decline: (t, o) => { [76, 71, 64].forEach((m, i) => tone(t + i * 0.11, 0.2, hz(m), {type: 'triangle', peak: 0.12 * o.v, lp: 1600, b: 'call', send: 0.2})); },
    hangup: (t, o) => { tone(t, 0.18, hz(72), {peak: 0.13 * o.v, b: 'call', send: 0.3}); tone(t + 0.14, 0.34, hz(64), {peak: 0.13 * o.v, b: 'call', send: 0.3}); tone(t + 0.14, 0.2, 110, {f2: 70, peak: 0.1 * o.v, b: 'call', lp: 400}); },
    connected: (t, o) => { bell(t, 88, {peak: 0.1 * o.v, dur: 0.9, b: 'call'}); bell(t + 0.12, 95, {peak: 0.06 * o.v, dur: 0.9, b: 'call'}); },
    peerJoin: (t, o) => { bell(t, 79, {peak: 0.1 * o.v, dur: 0.6, b: 'call'}); bell(t + 0.1, 84, {peak: 0.1 * o.v, dur: 0.8, b: 'call'}); },
    peerLeave: (t, o) => { bell(t, 84, {peak: 0.09 * o.v, dur: 0.6, b: 'call'}); bell(t + 0.1, 77, {peak: 0.09 * o.v, dur: 0.8, b: 'call'}); },
    mute: (t, o) => tone(t, 0.1, 460, {f2: 300, peak: 0.1 * o.v, b: 'call', lp: 1800}),
    unmute: (t, o) => tone(t, 0.1, 320, {f2: 520, peak: 0.1 * o.v, b: 'call', lp: 1800}),
    camOn: (t, o) => { tone(t, 0.08, 600, {f2: 900, peak: 0.08 * o.v, b: 'call', type: 'triangle'}); tone(t + 0.07, 0.1, 1200, {peak: 0.07 * o.v, b: 'call', type: 'triangle'}); },
    camOff: (t, o) => { tone(t, 0.08, 1100, {f2: 700, peak: 0.08 * o.v, b: 'call', type: 'triangle'}); tone(t + 0.07, 0.1, 520, {peak: 0.07 * o.v, b: 'call', type: 'triangle'}); },
    lost: (t, o) => [0, 1, 2].forEach(i => tone(t + i * 0.16, 0.22, 420 - i * 60, {type: 'sawtooth', peak: 0.05 * o.v, lp: 700, b: 'call', vib: [9, 8]})),
    recovered: (t, o) => [72, 76, 79].forEach((m, i) => bell(t + i * 0.08, m, {peak: 0.09 * o.v, dur: 0.6, b: 'call'})),
    missed: (t, o) => { [79, 76, 72].forEach((m, i) => bell(t + i * 0.2, m, {peak: 0.09 * o.v, dur: 0.9, b: 'call'})); },
    noAnswer: (t, o) => { [64, 60].forEach((m, i) => tone(t + i * 0.2, 0.34, hz(m), {type: 'triangle', peak: 0.11 * o.v, lp: 1300, b: 'call', send: 0.3})); },
    ringStart: (t, o) => tone(t, 0.12, 700, {f2: 1000, peak: 0.06 * o.v, b: 'call'}),

    // ===== thế giới: bước chân, đồ vật =====
    step: (t, o) => {            // o.f = {s:'wood'|'stair'|'grass', run:bool}
      const s = (o.f && o.f.s) || 'wood', run = o.f && o.f.run, k = (run ? 1.35 : 1) * o.v, r = rnd(0.88, 1.14);
      if (s === 'grass') { noise(t, 0.09, {f: 1700 * r, q: 0.6, peak: 0.09 * k, b: 'world', a: 0.012}); noise(t + 0.02, 0.07, {f: 3800 * r, q: 0.8, peak: 0.03 * k, b: 'world'}); return; }
      if (s === 'stair') { tone(t, 0.1, 150 * r, {f2: 75, peak: 0.2 * k, b: 'world', lp: 700}); noise(t, 0.05, {type: 'lowpass', f: 700, peak: 0.12 * k, b: 'world'}); tone(t, 0.05, 320 * r, {f2: 190, type: 'triangle', peak: 0.07 * k, b: 'world', lp: 1200}); return; }
      tone(t, 0.07, 135 * r, {f2: 80, peak: 0.17 * k, b: 'world', lp: 600});
      noise(t, 0.045, {type: 'lowpass', f: 900 * r, peak: 0.1 * k, b: 'world'});
      noise(t, 0.012, {type: 'highpass', f: 2800, peak: 0.03 * k, b: 'world'});
    },
    sit: (t, o) => { noise(t, 0.22, {type: 'lowpass', f: 520, peak: 0.16 * o.v, b: 'world', a: 0.02}); tone(t, 0.16, 95, {f2: 60, peak: 0.16 * o.v, b: 'world', lp: 400}); tone(t + 0.04, 0.3, 360, {f2: 290, peak: 0.04 * o.v, b: 'world', vib: [14, 10], lp: 1100, type: 'triangle'}); },
    standUp: (t, o) => { tone(t, 0.26, 290, {f2: 380, peak: 0.04 * o.v, b: 'world', vib: [12, 9], lp: 1100, type: 'triangle'}); noise(t, 0.3, {f: 500, f2: 1200, q: 0.5, peak: 0.07 * o.v, b: 'world', a: 0.06}); tone(t + 0.22, 0.1, 120, {f2: 80, peak: 0.1 * o.v, b: 'world', lp: 500}); },
    bedClimb: (t, o) => { noise(t, 0.35, {type: 'lowpass', f: 420, peak: 0.16 * o.v, b: 'world', a: 0.05}); [0, 0.15, 0.3].forEach((d, i) => tone(t + d, 0.14, 520 - i * 40, {f2: 440 - i * 40, peak: 0.035 * o.v, b: 'world', vib: [20, 14], lp: 1300, type: 'triangle'})); tone(t + 0.2, 0.2, 80, {f2: 55, peak: 0.14 * o.v, b: 'world', lp: 300}); },
    bedOff: (t, o) => { noise(t, 0.3, {type: 'lowpass', f: 500, f2: 250, peak: 0.12 * o.v, b: 'world', a: 0.04}); tone(t, 0.18, 430, {f2: 520, peak: 0.035 * o.v, b: 'world', vib: [18, 12], lp: 1300, type: 'triangle'}); tone(t + 0.25, 0.12, 120, {f2: 80, peak: 0.1 * o.v, b: 'world', lp: 400}); },
    sleep: (t, o) => { [67, 64, 60].forEach((m, i) => tone(t + i * 0.5, 1.6, hz(m), {peak: 0.06 * o.v, a: 0.25, b: 'world', send: 0.6, lp: 1400})); },
    wake: (t, o) => { [60, 64, 67, 72].forEach((m, i) => bell(t + i * 0.1, m, {peak: 0.07 * o.v, dur: 0.9, b: 'world'})); },
    doorOpen: (t, o) => { tone(t, 0.5, 170, {f2: 250, type: 'sawtooth', peak: 0.05 * o.v, a: 0.05, lp: 700, b: 'world', vib: [7, 14]}); noise(t, 0.45, {f: 700, f2: 1100, q: 4, peak: 0.04 * o.v, b: 'world', a: 0.08}); noise(t + 0.02, 0.02, {type: 'highpass', f: 2500, peak: 0.1 * o.v, b: 'world'}); },
    doorClose: (t, o) => { tone(t, 0.4, 240, {f2: 160, type: 'sawtooth', peak: 0.04 * o.v, a: 0.04, lp: 650, b: 'world', vib: [7, 12]}); tone(t + 0.4, 0.14, 100, {f2: 55, peak: 0.2 * o.v, b: 'world', lp: 380}); noise(t + 0.4, 0.04, {type: 'lowpass', f: 900, peak: 0.12 * o.v, b: 'world'}); noise(t + 0.43, 0.015, {type: 'highpass', f: 3200, peak: 0.08 * o.v, b: 'world'}); },
    lamp: (t, o) => { tone(t, 0.03, 2200, {peak: 0.08 * o.v, b: 'world'}); tone(t + 0.045, 0.03, 1600, {peak: 0.06 * o.v, b: 'world'}); noise(t, 0.02, {type: 'highpass', f: 4000, peak: 0.04 * o.v, b: 'world'}); },
    weather: (t, o) => { [72, 79, 84].forEach((m, i) => tone(t + i * 0.18, 1.4, hz(m), {peak: 0.035 * o.v, a: 0.3, b: 'amb', send: 0.8, lp: 2000})); noise(t, 1.2, {f: 500, f2: 2500, q: 0.6, peak: 0.03 * o.v, a: 0.4, b: 'amb'}); },
    thunder: (t, o) => { noise(t, 2.8, {type: 'lowpass', f: 200, f2: 60, q: 0.7, peak: 0.5 * o.v, a: 0.12, b: 'amb', send: 0.4}); noise(t + 0.05, 0.5, {type: 'lowpass', f: 1200, f2: 200, peak: 0.25 * o.v, a: 0.02, b: 'amb'}); },
    bird: (t, o) => {            // 1 tiếng chim hót: 2–4 nốt luyến
      const n = 2 + (Math.random() * 3 | 0), base = rnd(2600, 4200), pan = rnd(-0.7, 0.7);
      for (let i = 0; i < n; i++) { const tt = t + i * rnd(0.09, 0.14), f = base * rnd(0.85, 1.25); tone(tt, 0.1, f, {f2: f * rnd(0.7, 1.4), peak: 0.03 * o.v, b: 'amb', vib: [35, 40], send: 0.2}); }
    },
    cricket: (t, o) => { for (let i = 0; i < 3; i++) { const tt = t + i * 0.085; tone(tt, 0.06, 4400, {peak: 0.012 * o.v, b: 'amb', a: 0.01, vib: [60, 80]}); } },
  };
  // gap = khoảng cách tối thiểu (giây) giữa 2 lần phát cùng 1 âm
  // hệ số cân bằng âm lượng (đo bằng render offline, đưa mọi âm về đỉnh mục tiêu)
  const TRIM = {click: 3.42, hover: 5.0, toggleOn: 1.73, toggleOff: 1.81, tab: 2.35, tick: 3.75, open: 4.8, close: 4.58, error: 1.78, success: 0.97, toast: 2.69, pop: 3.43, popupIn: 1.29, dismiss: 3.91, msgIn: 1.08, msgOut: 3.6, key: 4.55, copy: 1.54, taskDone: 1.04, taskAdd: 1.89, del: 3.03, shutter: 1.57, whoosh: 1.84, ready: 0.92, musicPlay: 1.58, musicPause: 1.6, musicSkip: 1.96, accept: 1.09, decline: 1.49, hangup: 1.14, connected: 1.54, peerJoin: 1.13, peerLeave: 1.09, mute: 2.63, unmute: 2.86, camOn: 1.45, camOff: 1.43, lost: 2.14, recovered: 1.03, missed: 1.19, noAnswer: 1.29, step: 2.05, sit: 2.76, standUp: 1.42, bedClimb: 1.26, bedOff: 1.3, sleep: 1.16, wake: 0.98, doorOpen: 2.14, doorClose: 1.14, lamp: 1.96, weather: 1.2, thunder: 5.26, bird: 1.62, cricket: 2.0};
  const GAP = {hover: 0.07, click: 0.04, tick: 0.035, step: 0.08, key: 0.025, msgIn: 0.25, toast: 0.3, bird: 0.5, cricket: 0.2};
  const last = {};
  function play(name, o = {}) {
    const fn = LIB[name]; if (!fn) return false;
    const now = ctx.currentTime; if (GAP[name] && now - (last[name] || -9) < GAP[name]) return false; last[name] = now;
    try { fn(now + (o.delay || 0) + 0.005, {v: (o.v == null ? 1 : o.v) * (TRIM[name] || 1), f: o.f}); return true; } catch (e) { console.debug('[sfx]', name, e); return false; }
  }

  // ---- vòng lặp có chu kỳ (chuông gọi đến/đi) ----
  const LOOPS = {
    ringIn: {period: 2.5, bus: 'call', fn: (t) => {          // giai điệu vui vẻ kiểu app chat: lên 4 nốt, nghỉ, xuống 3 nốt
      [76, 79, 83, 88].forEach((m, i) => bell(t + i * 0.13, m, {peak: 0.2, dur: 0.7, b: 'call', send: 0.35}));
      [88, 83, 79].forEach((m, i) => bell(t + 0.95 + i * 0.13, m, {peak: 0.16, dur: 0.8, b: 'call', send: 0.35}));
      tone(t, 0.5, 164.8, {peak: 0.06, lp: 400, b: 'call'}); tone(t + 0.95, 0.5, 196, {peak: 0.05, lp: 400, b: 'call'});
    }},
    ringOut: {period: 3.2, bus: 'call', fn: (t) => {          // tiếng chờ bên gọi: hai cặp nốt mềm
      [0, 0.85].forEach(d => { mallet(t + d, 69, {peak: 0.14}); mallet(t + d + 0.2, 76, {peak: 0.12}); });
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

  // ---- môi trường: gió (nhiễu lọc + gió giật), chim ban ngày, dế ban đêm ----
  const amb = {wind: null, birdT: 0, cricT: 0, k: {wind: 0}};
  function ambience(p) {
    if (!amb.wind) {
      const s = ctx.createBufferSource(), fl = ctx.createBiquadFilter(), g = ctx.createGain();
      s.buffer = nbuf; s.loop = true; fl.type = 'bandpass'; fl.Q.value = 0.5; fl.frequency.value = 450; g.gain.value = 0;
      s.connect(fl); fl.connect(g); g.connect(bus.amb); s.start();
      const l = ctx.createOscillator(), lg = ctx.createGain(); l.frequency.value = 0.14; lg.gain.value = 250; l.connect(lg); lg.connect(fl.frequency); l.start();
      const l2 = ctx.createOscillator(), lg2 = ctx.createGain(); l2.frequency.value = 0.09; lg2.gain.value = 0.35; l2.connect(lg2); lg2.connect(g.gain); l2.start();
      amb.wind = {g, fl};
    }
    const w = clamp(p.wind || 0, 0, 2.6), t = ctx.currentTime;
    const vol = (0.012 + 0.05 * Math.min(1, w / 2)) * (p.snow ? 0.8 : 1) * (p.fog ? 0.5 : 1);
    amb.wind.g.gain.setTargetAtTime(p.on === false ? 0 : vol, t, 1.2);
    amb.wind.fl.Q.setTargetAtTime(0.4 + w * 0.25, t, 1);
    const now = performance.now();
    if (p.on !== false && !document.hidden) {
      if (p.day && !p.rain && w < 1.4 && now > amb.birdT) { amb.birdT = now + rnd(2500, 8000) * (p.clear ? 1 : 2.2); if (Math.random() < 0.8) play('bird', {v: 1}); }
      if (p.night && !p.rain && w < 1.2 && now > amb.cricT) { amb.cricT = now + rnd(700, 1500); play('cricket', {v: 1}); }
    }
  }

  return {ctx, master, play, startLoop, stopLoop, ambience, LIB, LOOPS, bus, isLoop: n => !!loopsOn[n]};
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
