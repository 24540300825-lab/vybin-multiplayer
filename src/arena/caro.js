// CỜ CARO 15×15 — 5 quân liền (ngang / dọc / chéo) là thắng. Người mời đi trước (X), người kia (O).
// Theo lượt: mỗi nước gửi {k:'mv', i}. 2 máy cùng kiểm tra thắng; host báo kết quả. Mỗi nước tối đa 45 s, quá giờ → mất lượt.
import {COL, COL2, NAME, mkCanvas, loop, beep} from './kit.js';

const N = 15, T_MOVE = 45;
const DIRS = [[1, 0], [0, 1], [1, 1], [1, -1]];

export function line5(b, i) {
  const p = b[i]; if (!p) return null; const x = i % N, y = (i / N) | 0;
  for (const [dx, dy] of DIRS) {
    const cells = [i];
    for (const s of [1, -1]) for (let k = 1; k < 5; k++) { const xx = x + dx * k * s, yy = y + dy * k * s; if (xx < 0 || yy < 0 || xx >= N || yy >= N || b[yy * N + xx] !== p) break; cells.push(yy * N + xx); }
    if (cells.length >= 5) return cells;
  }
  return null;
}
// máy đánh: chấm điểm mỗi ô trống gần quân (tấn công + phòng thủ)
function evalCell(b, i, p) {
  const x = i % N, y = (i / N) | 0; let sc = 0;
  for (const [dx, dy] of DIRS) {
    let n = 1, open = 0;
    for (const s of [1, -1]) { let k = 1; for (; k < 5; k++) { const xx = x + dx * k * s, yy = y + dy * k * s; if (xx < 0 || yy < 0 || xx >= N || yy >= N) break; const c = b[yy * N + xx]; if (c === p) n++; else { if (!c) open++; break; } } }
    sc += n >= 5 ? 1e6 : n === 4 ? (open === 2 ? 1e5 : open ? 1e4 : 0) : n === 3 ? (open === 2 ? 5e3 : open ? 400 : 0) : n === 2 ? (open === 2 ? 200 : open ? 30 : 0) : open;
  }
  return sc;
}
export function botMove(b, me, opp, rng) {
  let best = -1, bi = -1, any = false;
  for (let i = 0; i < N * N; i++) {
    if (b[i]) { any = true; continue; }
    const x = i % N, y = (i / N) | 0; let near = false;
    for (let dy = -2; dy <= 2 && !near; dy++) for (let dx = -2; dx <= 2; dx++) { const xx = x + dx, yy = y + dy; if (xx >= 0 && yy >= 0 && xx < N && yy < N && b[yy * N + xx]) { near = true; break; } }
    if (!near) continue;
    const s = evalCell(b, i, me) * 1.1 + evalCell(b, i, opp) + rng() * 5;
    if (s > best) { best = s; bi = i; }
  }
  return any ? bi : (N * N / 2) | 0;
}

export default {
  id: 'caro', title: 'Cờ caro', icon: '⭕',
  desc: 'Bàn 15×15 — ai xếp được 5 quân liền trước thì thắng.',
  rules: 'Bấm vào ô để đặt quân. Người mời đi trước (✕).',
  start(api) {
    const {me, other, host} = api, X = host ? me : other, O = host ? other : me;
    const b = new Array(N * N).fill(null); let turn = X, last = -1, win = null, tLeft = T_MOVE, over = false, hover = -1;
    const S = mkCanvas(api.stage, 1, () => draw()); S.cv.style.touchAction = 'none';
    const cell = e => { const p = S.pt(e), pad = 0.03, gx = Math.floor((p.x - pad) / (1 - 2 * pad) * N), gy = Math.floor((p.y - pad) / (1 - 2 * pad) * N); return gx >= 0 && gy >= 0 && gx < N && gy < N ? gy * N + gx : -1; };
    const place = (i, who, net) => {
      if (over || b[i] || turn !== who) return false;
      b[i] = who; last = i; beep(who === me ? 720 : 520, 0.06, 'triangle'); if (net) api.send({k: 'mv', i});
      const ln = line5(b, i);
      if (ln) { win = ln; over = true; if (host || api.bot) api.end({winner: who, score: {[who]: 1, [who === me ? other : me]: 0}}); }
      else if (b.every(Boolean)) { over = true; if (host || api.bot) api.end({winner: null, score: {}}); }
      else { turn = who === X ? O : X; tLeft = T_MOVE; if (api.bot && turn === other) setTimeout(() => place(botMove(b, other, me, api.rng), other, false), 450 + api.rng() * 500); }
      draw(); return true;
    };
    S.cv.addEventListener('pointermove', e => { hover = cell(e); draw(); });
    S.cv.addEventListener('pointerleave', () => { hover = -1; draw(); });
    S.cv.addEventListener('pointerdown', e => { const i = cell(e); if (i >= 0 && turn === me) place(i, me, true); });
    api.onMsg(d => {
      if (d.k === 'mv' && typeof d.i === 'number') place(d.i, other, false);
      if (d.k === 'skip' && turn === other) { turn = me; tLeft = T_MOVE; draw(); }
    });
    if (api.bot && turn === other) setTimeout(() => place(botMove(b, other, me, api.rng), other, false), 600);
    api.score({[X]: '✕', [O]: '◯'});
    const stop = loop(dt => {
      if (over) return; tLeft -= dt;
      if (tLeft <= 0 && turn === me) { turn = other; tLeft = T_MOVE; api.send({k: 'skip'}); beep(200, 0.2); if (api.bot) setTimeout(() => place(botMove(b, other, me, api.rng), other, false), 500); }
      api.status(turn === me ? '👉 Lượt của bạn · ' + Math.ceil(tLeft) + ' s' : 'Chờ ' + NAME[other] + ' đánh… ' + Math.ceil(Math.max(0, tLeft)) + ' s');
    });
    function draw() {
      const {cx, w, h} = S; if (!cx) return; cx.clearRect(0, 0, w, h);
      const pad = 0.03 * w, c = (w - 2 * pad) / N;
      cx.fillStyle = '#fbf3e1'; cx.fillRect(0, 0, w, h);
      cx.strokeStyle = '#d9c7a1'; cx.lineWidth = 1;
      for (let k = 0; k <= N; k++) { cx.beginPath(); cx.moveTo(pad + k * c, pad); cx.lineTo(pad + k * c, pad + N * c); cx.stroke(); cx.beginPath(); cx.moveTo(pad, pad + k * c); cx.lineTo(pad + N * c, pad + k * c); cx.stroke(); }
      if (win) { cx.fillStyle = 'rgba(255,213,74,.45)'; win.forEach(i => cx.fillRect(pad + (i % N) * c, pad + ((i / N) | 0) * c, c, c)); }
      if (hover >= 0 && !b[hover] && turn === me && !over) { cx.fillStyle = COL2[me]; cx.globalAlpha = 0.5; cx.fillRect(pad + (hover % N) * c, pad + ((hover / N) | 0) * c, c, c); cx.globalAlpha = 1; }
      cx.lineWidth = Math.max(2, c * 0.13); cx.lineCap = 'round';
      b.forEach((p, i) => {
        if (!p) return; const x = pad + (i % N + 0.5) * c, y = pad + (((i / N) | 0) + 0.5) * c, r = c * 0.3;
        cx.strokeStyle = COL[p];
        if (p === X) { cx.beginPath(); cx.moveTo(x - r, y - r); cx.lineTo(x + r, y + r); cx.moveTo(x + r, y - r); cx.lineTo(x - r, y + r); cx.stroke(); }
        else { cx.beginPath(); cx.arc(x, y, r, 0, Math.PI * 2); cx.stroke(); }
        if (i === last) { cx.strokeStyle = 'rgba(0,0,0,.25)'; cx.lineWidth = 1.5; cx.strokeRect(pad + (i % N) * c + 1, pad + ((i / N) | 0) * c + 1, c - 2, c - 2); cx.lineWidth = Math.max(2, c * 0.13); }
      });
    }
    return {stop() { stop(); S.kill(); }};
  },
};
