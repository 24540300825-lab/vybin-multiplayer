// KHÚC CÔN CẦU BÀN (air hockey) — 2 người, thời gian thực.
// Bàn dài L (đơn vị: bề ngang bàn = 1). y = 0: khung thành của host (người mời), y = L: khung thành người kia.
// Host mô phỏng vật lý (1 nguồn quyết định), gửi trạng thái ~9 lần/giây; người kia gửi vị trí chày ~9 lần/giây.
// Mỗi người luôn thấy MÌNH ở dưới (máy người kia lật bàn khi vẽ). Ai vào 5 bàn trước thắng; hết 3 phút: hơn bàn thắng, hoà thì "bàn vàng" thêm 45 s.
import {COL, COL2, NAME, mkCanvas, rrect, loop, clamp, r3, beep} from './kit.js';

const L = 1.6, RP = 0.075, RK = 0.045, GW = 0.36, WIN = 5, T_GAME = 180, T_GOLD = 45, VMAX = 3.2, PSPD = 4.5, NET_DT = 0.11;

export default {
  id: 'hockey', title: 'Khúc côn cầu', icon: '🏒',
  desc: 'Đẩy quả puck vào khung thành đối phương. Ai vào 5 bàn trước thắng.',
  rules: 'Kéo chuột / ngón tay để di chuyển chày (chỉ trong nửa sân của mình).',
  start(api) {
    const {me, other, host} = api, guest = !host;
    const S = mkCanvas(api.stage, 1 / L * 1.04, () => draw());
    S.cv.style.touchAction = 'none';
    // trạng thái thế giới (toạ độ chuẩn: y=0 phía host)
    const W = {k: {x: 0.5, y: L * 0.3, vx: 0, vy: 0}, h: {x: 0.5, y: 0.18, vx: 0, vy: 0}, g: {x: 0.5, y: L - 0.18, vx: 0, vy: 0},
      sc: {h: 0, g: 0}, t: T_GAME, gold: false, over: false, flash: 0, flashTxt: '', wait: 2.2};
    const hostSlot = host ? me : other, guestSlot = host ? other : me;
    const mine = host ? W.h : W.g;
    let tgt = {x: mine.x, y: mine.y}, netT = 0, remoteTgt = null, kDisp = {x: W.k.x, y: W.k.y}, oDisp = null;
    const half = host ? [RP, L / 2 - RP * 0.3] : [L / 2 + RP * 0.3, L - RP];
    // màn hình → toạ độ chuẩn (bàn có viền 2%)
    const toW = p => { const pad = 0.02; let x = (p.x - pad) / (1 - 2 * pad), y = (1 - (p.y - pad) / (1 - 2 * pad)) * L; if (guest) { x = 1 - x; y = L - y; } return {x, y}; };
    const onMove = e => { const q = toW(S.pt(e)); tgt = {x: clamp(q.x, RP, 1 - RP), y: clamp(q.y, half[0], half[1])}; };
    S.cv.addEventListener('pointermove', onMove); S.cv.addEventListener('pointerdown', e => { S.cv.setPointerCapture && S.cv.setPointerCapture(e.pointerId); onMove(e); });

    const movePaddle = (P, to, dt, spd) => {
      const dx = to.x - P.x, dy = to.y - P.y, d = Math.hypot(dx, dy), m = Math.min(d, spd * dt);
      const nx = d > 1e-6 ? P.x + dx / d * m : P.x, ny = d > 1e-6 ? P.y + dy / d * m : P.y;
      P.vx = P.vx * 0.5 + (nx - P.x) / dt * 0.5; P.vy = P.vy * 0.5 + (ny - P.y) / dt * 0.5; P.x = nx; P.y = ny;
    };
    const hit = (P, k) => {
      const dx = k.x - P.x, dy = k.y - P.y, d = Math.hypot(dx, dy), R = RP + RK; if (d >= R || d < 1e-6) return false;
      const nx = dx / d, ny = dy / d; k.x = P.x + nx * R; k.y = P.y + ny * R;
      const rvx = k.vx - P.vx, rvy = k.vy - P.vy, vn = rvx * nx + rvy * ny;
      if (vn < 0) { k.vx -= 1.9 * vn * nx; k.vy -= 1.9 * vn * ny; }
      const sp = Math.hypot(k.vx, k.vy); if (sp > VMAX) { k.vx *= VMAX / sp; k.vy *= VMAX / sp; }
      return true;
    };
    // tường + khung thành; trả 'h' nếu bóng lọt khung thành host, 'g' nếu lọt khung người kia
    const walls = k => {
      if (k.x < RK) { k.x = RK; k.vx = Math.abs(k.vx) * 0.9; } if (k.x > 1 - RK) { k.x = 1 - RK; k.vx = -Math.abs(k.vx) * 0.9; }
      const inGoal = Math.abs(k.x - 0.5) < GW / 2 - RK * 0.3;
      if (k.y < RK && !inGoal) { k.y = RK; k.vy = Math.abs(k.vy) * 0.9; }
      if (k.y > L - RK && !inGoal) { k.y = L - RK; k.vy = -Math.abs(k.vy) * 0.9; }
      if (k.y < -RK) return 'h'; if (k.y > L + RK) return 'g'; return null;
    };
    // máy (bot) đóng vai người kia: thủ trước khung, puck sang sân mình chậm thì lao vào đánh
    const botTgt = () => {
      const k = W.k, home = {x: clamp(0.5 + (k.x - 0.5) * 0.6, RP, 1 - RP), y: L - 0.16};
      if (k.y > L / 2 && (k.vy < 0.5 || k.y > L - 0.35)) return {x: clamp(k.x + (k.x - 0.5) * 0.15, RP, 1 - RP), y: clamp(k.y + 0.06, L / 2 + RP, L - RP)};
      return home;
    };
    const goal = side => {   // side: khung thành bị thủng
      if (side === 'h') W.sc.g++; else W.sc.h++;
      const who = side === 'h' ? guestSlot : hostSlot;
      W.flash = 1.6; W.flashTxt = 'VÀO! ' + NAME[who] + ' ghi bàn'; beep(who === me ? 880 : 300, 0.25, 'triangle', 0.15);
      W.k = {x: 0.5, y: side === 'h' ? L * 0.3 : L * 0.7, vx: 0, vy: 0}; W.wait = 1.4;
      pushScore();
      if (W.sc.h >= WIN || W.sc.g >= WIN || W.gold) finish();
    };
    const pushScore = () => api.score({[hostSlot]: W.sc.h, [guestSlot]: W.sc.g});
    const finish = () => {
      if (W.over) return; W.over = true;
      const winner = W.sc.h > W.sc.g ? hostSlot : W.sc.g > W.sc.h ? guestSlot : null;
      if (host) { sendState(true); api.end({winner, score: {[hostSlot]: W.sc.h, [guestSlot]: W.sc.g}}); }
    };
    const sendState = (force) => {
      if (api.bot) return;
      api.send({k: 's', p: [r3(W.k.x), r3(W.k.y), r3(W.k.vx), r3(W.k.vy)], h: [r3(W.h.x), r3(W.h.y)], sc: [W.sc.h, W.sc.g], t: Math.ceil(W.t), gd: W.gold ? 1 : 0, w: r3(W.wait), f: force ? W.flashTxt : undefined});
    };
    api.onMsg(d => {
      if (host && d.k === 'm') remoteTgt = {x: d.q[0], y: d.q[1]};
      if (guest && d.k === 's') {
        W.k.x = d.p[0]; W.k.y = d.p[1]; W.k.vx = d.p[2]; W.k.vy = d.p[3]; oDisp = oDisp || {x: d.h[0], y: d.h[1]}; W.h.tx = d.h[0]; W.h.ty = d.h[1];
        if (d.sc[0] !== W.sc.h || d.sc[1] !== W.sc.g) { const gotH = d.sc[0] > W.sc.h; W.sc.h = d.sc[0]; W.sc.g = d.sc[1]; W.flash = 1.6; W.flashTxt = 'VÀO! ' + NAME[gotH ? hostSlot : guestSlot] + ' ghi bàn'; beep(gotH ? 300 : 880, 0.25, 'triangle', 0.15); pushScore(); }
        W.t = d.t; W.gold = !!d.gd; W.wait = d.w;
      }
    });
    pushScore();
    const stop = loop(dt => {
      if (W.flash > 0) W.flash -= dt;
      movePaddle(mine, tgt, dt, PSPD);
      if (host) {
        if (!W.over) {
          W.t -= dt;
          if (W.t <= 0) { if (W.sc.h !== W.sc.g || W.gold) finish(); else { W.gold = true; W.t = T_GOLD; W.flash = 2; W.flashTxt = 'HOÀ — BÀN VÀNG!'; beep(520, 0.3); } }
          const o = W.g; if (api.bot) movePaddle(o, botTgt(), dt, 1.6); else if (remoteTgt) movePaddle(o, remoteTgt, dt, 8);
          if (W.wait > 0) W.wait -= dt;
          else {
            const n = 4; for (let i = 0; i < n; i++) {
              const k = W.k, h = dt / n; k.x += k.vx * h; k.y += k.vy * h; k.vx *= 0.9985; k.vy *= 0.9985;
              if (hit(W.h, k) | hit(W.g, k)) beep(440 + Math.random() * 80, 0.04, 'square', 0.06);
              const s = walls(k); if (s) { goal(s); break; }
            }
          }
        }
        netT += dt; if (netT >= NET_DT) { netT = 0; sendState(false); }
      } else {
        // người kia: dự đoán puck giữa 2 gói tin (chỉ trôi + nảy tường), vẽ mượt về vị trí thật
        if (W.wait <= 0) { const k = W.k; k.x += k.vx * dt; k.y += k.vy * dt; k.vx *= 0.994; k.vy *= 0.994; walls(k); } else W.wait -= dt;
        if (oDisp && W.h.tx != null) { oDisp.x += (W.h.tx - oDisp.x) * Math.min(1, dt * 14); oDisp.y += (W.h.ty - oDisp.y) * Math.min(1, dt * 14); W.h.x = oDisp.x; W.h.y = oDisp.y; }
        netT += dt; if (netT >= NET_DT) { netT = 0; api.send({k: 'm', q: [r3(mine.x), r3(mine.y)]}); }
        W.t = Math.max(0, W.t - dt);
      }
      kDisp.x += (W.k.x - kDisp.x) * Math.min(1, dt * (host ? 60 : 18)); kDisp.y += (W.k.y - kDisp.y) * Math.min(1, dt * (host ? 60 : 18));
      api.status((W.gold ? '⭐ Bàn vàng · ' : '') + Math.max(0, Math.ceil(W.t)) + ' s');
      draw();
    });

    function draw() {
      const {cx, w, h} = S; if (!cx) return; cx.clearRect(0, 0, w, h);
      const pad = 0.02, X = x => (pad + (guest ? 1 - x : x) * (1 - 2 * pad)) * w, Y = y => (pad + (1 - (guest ? L - y : y) / L) * (1 - 2 * pad)) * h, R = r => r * (1 - 2 * pad) * w;
      rrect(cx, 2, 2, w - 4, h - 4, w * 0.06); cx.fillStyle = '#1d2a3a'; cx.fill();
      rrect(cx, pad * w, pad * h, (1 - 2 * pad) * w, (1 - 2 * pad) * h, w * 0.05);
      cx.fillStyle = '#eef6ff'; cx.fill();
      cx.strokeStyle = '#c9dcf0'; cx.lineWidth = 2; cx.beginPath(); cx.moveTo(X(0), Y(L / 2)); cx.lineTo(X(1), Y(L / 2)); cx.stroke();
      cx.beginPath(); cx.arc(X(0.5), Y(L / 2), R(0.14), 0, Math.PI * 2); cx.stroke();
      // khung thành: mình ở dưới (màu mình), người kia ở trên
      const gy = [[0, hostSlot], [L, guestSlot]];
      gy.forEach(([yy, s]) => { cx.fillStyle = COL[s]; const y0 = Y(yy); cx.fillRect(X(0.5) - R(GW) / 2, y0 - (y0 > h / 2 ? 6 : 0), R(GW), 6);
        cx.globalAlpha = 0.12; cx.beginPath(); cx.arc(X(0.5), y0, R(0.24), 0, Math.PI * 2); cx.fill(); cx.globalAlpha = 1; });
      const pd = (P, s) => { cx.fillStyle = COL[s]; cx.beginPath(); cx.arc(X(P.x), Y(P.y), R(RP), 0, Math.PI * 2); cx.fill();
        cx.fillStyle = COL2[s]; cx.beginPath(); cx.arc(X(P.x), Y(P.y), R(RP * 0.5), 0, Math.PI * 2); cx.fill(); };
      pd(W.h, hostSlot); pd(W.g, guestSlot);
      cx.fillStyle = '#20242c'; cx.beginPath(); cx.arc(X(kDisp.x), Y(kDisp.y), R(RK), 0, Math.PI * 2); cx.fill();
      cx.strokeStyle = '#ffd54a'; cx.lineWidth = 2; cx.stroke();
      if (W.flash > 0 && W.flashTxt) { cx.globalAlpha = Math.min(1, W.flash); cx.fillStyle = '#1d2a3a'; cx.font = `800 ${Math.round(w * 0.075)}px system-ui,sans-serif`; cx.textAlign = 'center'; cx.fillText(W.flashTxt, w / 2, h / 2 - R(0.2)); cx.globalAlpha = 1; }
      if (W.wait > 0 && !W.over && W.sc.h + W.sc.g === 0) { cx.fillStyle = '#1d2a3a'; cx.font = `800 ${Math.round(w * 0.16)}px system-ui,sans-serif`; cx.textAlign = 'center'; cx.fillText(String(Math.ceil(W.wait)), w / 2, h / 2 + R(0.3)); }
    }
    return {stop() { stop(); S.kill(); }, finishNow: finish};
  },
};
