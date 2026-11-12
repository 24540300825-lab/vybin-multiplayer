// BÓNG RỔ ARCADE — 2 người ném CÙNG LÚC, mỗi người 1 máy, 45 giây, ai nhiều điểm hơn thắng.
// Bấm (chuột / chạm / phím Space) khi vạch chạy vào vùng xanh: giữa tâm = "Xoẹt!" 3 điểm, trong vùng = 2 điểm, ngoài = trượt.
// Vào liên tiếp → vạch chạy nhanh hơn + vùng hẹp lại (khó dần). 25 giây cuối rổ di chuyển qua lại.
// Mạng: mỗi bên gửi điểm khi đổi ({k:'sc', v}) và điểm cuối ({k:'fin', v}); host chờ đủ 2 điểm cuối rồi xử.
import {COL, COL2, NAME, mkCanvas, loop, clamp, beep} from './kit.js';

const T_GAME = 45, T_READY = 3;

export default {
  id: 'bball', title: 'Bóng rổ', icon: '🏀',
  desc: '45 giây ném rổ cùng lúc — ai ghi nhiều điểm hơn thắng.',
  rules: 'Bấm chuột / chạm / Space khi vạch nằm trong vùng xanh. Ngay giữa = 3 điểm.',
  start(api) {
    const {me, other, host} = api, rng = api.rng;
    const S = mkCanvas(api.stage, 0.78, () => draw()); S.cv.style.touchAction = 'none';
    const G = {t: -T_READY, my: 0, op: 0, streak: 0, m: 0, dir: 1, ball: null, fx: [], over: false, myFin: null, opFin: null, hoopX: 0.5, botT: 1.2};
    const zone = () => clamp(0.2 - G.streak * 0.012, 0.09, 0.2), speed = () => 1.1 + Math.min(G.streak, 10) * 0.16;
    const shoot = () => {
      if (G.t < 0 || G.t >= T_GAME || G.ball || G.over) return;
      const off = Math.abs(G.m - 0.5), z = zone(); let pts = 0;
      if (off < z * 0.3) pts = 3; else if (off < z) pts = 2;
      G.ball = {t: 0, pts, off: (G.m - 0.5), x0: 0.5, hx: G.hoopX};
      beep(330, 0.05, 'sine');
    };
    const land = () => {
      const p = G.ball.pts; G.ball = null;
      if (p) { G.my += p; G.streak++; G.fx.push({txt: p === 3 ? 'XOẸT! +3' : '+2', t: 1}); beep(p === 3 ? 990 : 780, 0.15, 'triangle', 0.14); api.send({k: 'sc', v: G.my}); }
      else { G.streak = 0; G.fx.push({txt: 'Trượt…', t: 1}); beep(180, 0.15, 'sawtooth', 0.06); }
      sc();
    };
    const sc = () => api.score({[me]: G.my, [other]: G.op});
    const onKey = e => { if (e.code === 'Space') { e.preventDefault(); shoot(); } };
    window.addEventListener('keydown', onKey, true);
    S.cv.addEventListener('pointerdown', shoot);
    api.onMsg(d => {
      if (d.k === 'sc') { G.op = d.v; sc(); }
      if (d.k === 'fin') { G.opFin = d.v; G.op = d.v; sc(); judge(); }
    });
    const judge = () => {
      if (!host || G.myFin == null || G.opFin == null || G.over) return; G.over = true;
      const w = G.myFin > G.opFin ? me : G.opFin > G.myFin ? other : null;
      api.end({winner: w, score: {[me]: G.myFin, [other]: G.opFin}});
    };
    sc();
    let waitT = 0;
    const stop = loop(dt => {
      G.t += dt;
      if (G.t >= 0 && G.t < T_GAME) {
        G.m += G.dir * speed() * dt; if (G.m > 1) { G.m = 2 - G.m; G.dir = -1; } if (G.m < 0) { G.m = -G.m; G.dir = 1; }
        if (G.t > T_GAME - 25) G.hoopX = 0.5 + Math.sin((G.t - (T_GAME - 25)) * 1.4) * 0.22;
        if (api.bot) { G.botT -= dt; if (G.botT <= 0) { G.botT = 0.9 + rng() * 0.6; const r = rng(); if (r < 0.62) { G.op += r < 0.2 ? 3 : 2; sc(); } } }
      }
      if (G.ball) { G.ball.t += dt / 0.6; if (G.ball.t >= 1) land(); }
      G.fx.forEach(f => f.t -= dt * 0.9); G.fx = G.fx.filter(f => f.t > 0);
      if (G.t >= T_GAME && G.myFin == null && !G.ball) { G.myFin = G.my; api.send({k: 'fin', v: G.my}); if (api.bot) G.opFin = G.op; judge(); }
      if (G.myFin != null && host && G.opFin == null) { waitT += dt; if (waitT > 6) { G.opFin = G.op; judge(); } }   // mất gói 'fin' → lấy điểm cuối đã biết
      api.status(G.t < 0 ? 'Chuẩn bị… ' + Math.ceil(-G.t) : G.t < T_GAME ? '⏱ ' + Math.ceil(T_GAME - G.t) + ' s' + (G.streak >= 3 ? ' · 🔥 chuỗi ' + G.streak : '') : 'Hết giờ — chờ kết quả…');
      draw();
    });
    function draw() {
      const {cx, w, h} = S; if (!cx) return; cx.clearRect(0, 0, w, h);
      const g = cx.createLinearGradient(0, 0, 0, h); g.addColorStop(0, '#2b2f4a'); g.addColorStop(1, '#14172a'); cx.fillStyle = g; cx.fillRect(0, 0, w, h);
      // bảng rổ + vành
      const hx = G.hoopX * w, hy = h * 0.24;
      cx.fillStyle = '#f4f6fb'; cx.fillRect(hx - w * 0.17, hy - h * 0.15, w * 0.34, h * 0.17); cx.strokeStyle = COL[me]; cx.lineWidth = 3; cx.strokeRect(hx - w * 0.07, hy - h * 0.08, w * 0.14, h * 0.08);
      cx.strokeStyle = '#ff6a2a'; cx.lineWidth = 4; cx.beginPath(); cx.ellipse(hx, hy + 4, w * 0.085, h * 0.012, 0, 0, Math.PI * 2); cx.stroke();
      cx.strokeStyle = 'rgba(255,255,255,.6)'; cx.lineWidth = 1.2; for (let k = -3; k <= 3; k++) { cx.beginPath(); cx.moveTo(hx + k * w * 0.026, hy + 6); cx.lineTo(hx + k * w * 0.016, hy + h * 0.07); cx.stroke(); }
      // bóng
      let bx = w * 0.5, by = h * 0.8, br = w * 0.075;
      if (G.ball) {
        const u = G.ball.t, tx = G.ball.hx * w + (G.ball.pts ? G.ball.off * w * 0.15 : G.ball.off * w * 0.9), ty = hy - (G.ball.pts ? -h * 0.04 * u : h * 0.02);
        bx = w * 0.5 + (tx - w * 0.5) * u; by = h * 0.8 + (ty - h * 0.8) * u - Math.sin(u * Math.PI) * h * 0.32; br = w * (0.075 - 0.03 * u);
      }
      cx.fillStyle = '#f08a2c'; cx.beginPath(); cx.arc(bx, by, br, 0, Math.PI * 2); cx.fill(); cx.strokeStyle = '#7a3b10'; cx.lineWidth = 1.5;
      cx.beginPath(); cx.moveTo(bx - br, by); cx.lineTo(bx + br, by); cx.moveTo(bx, by - br); cx.lineTo(bx, by + br); cx.stroke();
      // thanh ngắm
      const y0 = h * 0.93, x0 = w * 0.08, bw = w * 0.84, z = zone();
      cx.fillStyle = 'rgba(255,255,255,.12)'; cx.fillRect(x0, y0 - 9, bw, 18);
      cx.fillStyle = '#3ecf8e'; cx.fillRect(x0 + bw * (0.5 - z), y0 - 9, bw * 2 * z, 18);
      cx.fillStyle = '#ffd54a'; cx.fillRect(x0 + bw * (0.5 - z * 0.3), y0 - 9, bw * 0.6 * z, 18);
      cx.fillStyle = '#fff'; cx.fillRect(x0 + bw * G.m - 2, y0 - 14, 4, 28);
      // điểm 2 bên
      cx.font = `800 ${Math.round(w * 0.06)}px system-ui,sans-serif`; cx.textAlign = 'left'; cx.fillStyle = COL2[me]; cx.fillText(NAME[me] + ' ' + G.my, w * 0.05, h * 0.07);
      cx.textAlign = 'right'; cx.fillStyle = COL2[other]; cx.fillText(G.op + ' ' + NAME[other], w * 0.95, h * 0.07);
      G.fx.forEach(f => { cx.globalAlpha = Math.min(1, f.t * 1.5); cx.textAlign = 'center'; cx.fillStyle = '#fff'; cx.font = `800 ${Math.round(w * 0.09)}px system-ui,sans-serif`; cx.fillText(f.txt, w / 2, h * 0.52 - (1 - f.t) * h * 0.08); cx.globalAlpha = 1; });
      if (G.t < 0) { cx.textAlign = 'center'; cx.fillStyle = '#fff'; cx.font = `800 ${Math.round(w * 0.22)}px system-ui,sans-serif`; cx.fillText(String(Math.ceil(-G.t)), w / 2, h * 0.58); }
    }
    return {stop() { stop(); window.removeEventListener('keydown', onKey, true); S.kill(); }};
  },
};
