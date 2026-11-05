// MINIGAME "TẮT ĐÈN ĐI TRỐN" (trong nhà, 2 người). Vào ván: tắt hết đèn + màn hình phủ đen thui, chỉ thấy trong quầng đèn pin.
// Người trốn: 15 s đi trốn (người tìm bị bịt mắt, màn đen hẳn), rồi 45 s người tìm cầm đèn pin (quầng sáng phía trước nhân vật).
// Người tìm soi trúng (trong 4.5 m, lệch ≤ 28°) liên tục 0.6 s → tìm thấy. Hết giờ chưa thấy → người trốn thắng. Người trốn có 1 nút "Hắt xì" (bắt buộc dùng trước khi hết 25 s đầu lúc tìm, không thì tự hắt xì).
// Chế độ: Giao hữu / Thách đấu cược điểm (dùng chung sổ điểm thách đấu với Khoai nóng). Bên quyết định "tìm thấy" là người tìm.
const HIDE = 15, SEEK = 45, RANGE = 4.5, CONE = 28 * Math.PI / 180, HOLD = 0.6, BETS = [10, 50, 100];
export default {
  id: 'hideseek',
  init(ctx) {
    const VY = () => window.VY, NAME = {bin: 'Bin', vy: 'Vy'}, me = ctx.slot, other = ctx.other, oN = NAME[other] || 'Bạn kia';
    const ledK = 'vyf:potato:led', led = () => { try { return JSON.parse(localStorage.getItem(ledK)) || {pts: 0, w: 0, l: 0}; } catch (e) { return {pts: 0, w: 0, l: 0}; } };
    const ledSet = L => { try { localStorage.setItem(ledK, JSON.stringify(L)); } catch (e) {} };
    const ledTxt = () => { const L = led(); return `Thắng ${L.w} – Thua ${L.l} · Điểm thách đấu: ${L.pts}`; };
    const css = document.createElement('style');
    css.textContent = `#hsBox{position:fixed;left:50%;top:5.5rem;transform:translateX(-50%);z-index:13;width:min(21rem,92vw);padding:1rem 1.25rem;border-radius:1.75rem;color:#fff;text-align:center}
#hsBox[hidden]{display:none}#hsBox h4{margin:.1rem 0 .6rem;font-size:1.05rem}#hsBox .m{font-size:1.1rem;font-weight:700;min-height:1.4rem}#hsBox .s{font-size:.8rem;opacity:.75;margin-top:.4rem}
#hsBox .bt{display:flex;flex-wrap:wrap;gap:.4rem;justify-content:center;margin-top:.6rem}#hsBox button{border:0;border-radius:1rem;padding:.55rem .9rem;font:inherit;font-size:.9rem;color:#fff;background:rgba(255,255,255,.14);cursor:pointer}
#hsBox button.p{background:#6c7cf0}#hsDark{position:fixed;inset:0;z-index:12;pointer-events:none;background:#000;transition:opacity .4s}#hsDark[hidden]{display:none}
#hsSneeze{position:fixed;left:50%;bottom:7rem;transform:translateX(-50%);z-index:13;border:0;border-radius:2rem;padding:.8rem 1.4rem;font:inherit;font-weight:700;color:#fff;background:#e0564b;cursor:pointer}#hsSneeze[hidden]{display:none}`;
    document.head.appendChild(css);
    const box = document.createElement('div'); box.id = 'hsBox'; box.className = 'hud panel'; box.hidden = true;
    const dark = document.createElement('div'); dark.id = 'hsDark'; dark.hidden = true;
    const snz = document.createElement('button'); snz.id = 'hsSneeze'; snz.hidden = true; snz.textContent = '🤧 Hắt xì!';
    document.body.append(dark, box, snz);
    const show = h => { box.innerHTML = h; box.hidden = false; }, hide = () => { box.hidden = true; };
    let G = null, pend = null, raf = 0, peerOn = !ctx.solo, lampsWas = null;
    ctx.onPeer(({present}) => { peerOn = !!present; if (!present && G && !G.done) finish(null, oN + ' đã rời đi — huỷ ván'); });
    const okMap = () => !(VY() && VY().EXT && ctx.mapId === 'exterior');
    const modeTxt = (m, b) => m === 'bet' ? `Thách đấu · cược ${b} điểm` : 'Giao hữu';

    function inviteUI() {
      if (!okMap()) return ctx.toast('Vào trong nhà mới chơi Tắt đèn đi trốn được nha 🏠');
      if (ctx.solo || !peerOn || !VY().remote) return ctx.toast('Cần ' + oN + ' ở cùng phòng để chơi');
      if (G) return ctx.toast('Đang chơi rồi!');
      show(`<h4>🔦 Tắt đèn đi trốn — thách ${oN}</h4><div class="s">Phòng tối thui, chỉ thấy trong quầng đèn pin.</div>
        <div class="bt"><button class="p" data-m="fr">Giao hữu</button>${BETS.map(b => `<button data-m="bet" data-b="${b}">Thách đấu ${b}</button>`).join('')}<button data-x>Huỷ</button></div><div class="s">${ledTxt()}</div>`);
      box.onclick = e => { const b = e.target.closest('button'); if (!b) return; if (b.dataset.x != null) return hide(); sendInv(b.dataset.m, +(b.dataset.b || 0)); };
    }
    function sendInv(mode, bet) {
      pend = {mode, bet, seeker: Math.random() < 0.5 ? 'bin' : 'vy'}; ctx.send('inv', pend);
      show(`<div class="m">Chờ ${oN} nhận lời…</div><div class="s">${modeTxt(mode, bet)}</div>`); box.onclick = null;
      pend.tm = setTimeout(() => { if (pend && !G) { pend = null; hide(); ctx.toast(oN + ' chưa nhận lời'); } }, 20000);
    }
    ctx.on('inv', d => {
      if (G) return ctx.send('busy', {});
      show(`<h4>🔦 ${oN} thách bạn chơi Tắt đèn đi trốn!</h4><div class="m">${modeTxt(d.mode, d.bet)}</div><div class="s">${d.seeker === me ? 'Bạn là người TÌM' : 'Bạn là người TRỐN'}</div>
        <div class="bt"><button class="p" data-a ${okMap() ? '' : 'disabled'}>Nhận lời</button><button data-x>Từ chối</button></div>`);
      box.onclick = e => { const b = e.target.closest('button'); if (!b) return; if (b.dataset.x != null) { ctx.send('no', {}); return hide(); } if (b.dataset.a != null) { ctx.send('yes', {}); begin(d, 3350); } };
    });
    ctx.on('yes', () => { if (pend) { clearTimeout(pend.tm); const d = pend; pend = null; begin(d, 3500); } });
    ctx.on('no', () => { if (pend) { clearTimeout(pend.tm); pend = null; show(`<div class="m">😏 ${oN} từ chối — sợ ma à?</div>`); setTimeout(hide, 2200); } });
    ctx.on('busy', () => { if (pend) { pend = null; hide(); ctx.toast(oN + ' đang bận chơi'); } });

    function begin(d, delay) {
      G = {mode: d.mode, bet: d.bet, seeker: d.seeker, t: -delay / 1000 - HIDE, last: performance.now(), lit: 0, done: false, sneezed: false, sneezeT: 0};
      const api = VY().api; if (api && api.lamps) { lampsWas = {a: api.lampGroup('a'), b: api.lampGroup('b')}; api.lamps(false); }   // tắt hết đèn
      dark.hidden = false; box.onclick = null; snz.hidden = true; cancelAnimationFrame(raf); raf = requestAnimationFrame(loop);
    }
    // t < 0: giai đoạn trốn (từ -HIDE-đếm ngược tới 0) · 0..SEEK: đi tìm
    function mask(L, rad, fwd) {
      const V = VY(), cam = V.camera, TH = V.THREE, p = L.P.pos;
      const v = new TH.Vector3(p.x + Math.sin(L.P.yaw) * fwd, p.y + 0.9, p.z + Math.cos(L.P.yaw) * fwd).project(cam);
      const x = (v.x * 0.5 + 0.5) * innerWidth, y = (-v.y * 0.5 + 0.5) * innerHeight;
      const d = cam.position.distanceTo(new TH.Vector3(p.x, p.y + 0.9, p.z)), r = Math.max(40, rad * innerHeight / (d * 0.9));   // bán kính quầng theo khoảng cách camera
      dark.style.background = `radial-gradient(circle ${r | 0}px at ${x | 0}px ${y | 0}px, rgba(0,0,0,0) 0%, rgba(0,0,0,.25) 55%, rgba(0,0,0,.97) 100%)`;
    }
    function loop(now) {
      if (!G) return; raf = requestAnimationFrame(loop);
      const dt = Math.min(0.1, (now - G.last) / 1000); G.last = now; if (G.done) return;
      G.t += dt; const V = VY(); if (!V || !V.local) return; const L = V.local, R = V.remote, seeker = G.seeker === me;
      if (G.t < -HIDE) { dark.style.background = '#000'; show(`<h4>🔦 Tắt đèn đi trốn · ${modeTxt(G.mode, G.bet)}</h4><div class="m">${Math.ceil(-HIDE - G.t)}…</div><div class="s">${seeker ? 'Bạn là người TÌM' : 'Bạn là người TRỐN'}</div>`); return; }
      if (G.t < 0) {   // trốn
        if (seeker) { dark.style.background = '#000'; show(`<div class="m">🙈 Bịt mắt đếm… ${Math.ceil(-G.t)}</div><div class="s">${oN} đang đi trốn</div>`); }
        else { mask(L, 1.3, 0); show(`<div class="m">🏃 Đi trốn nhanh! ${Math.ceil(-G.t)}</div><div class="s">Núp sau sofa, dưới bàn, trên gác…</div>`); }
        return;
      }
      if (seeker) {
        mask(L, 2.6, 2.0);
        let inCone = false;
        if (R) { const dx = R.P.pos.x - L.P.pos.x, dz = R.P.pos.z - L.P.pos.z, d = Math.hypot(dx, dz);
          const a = Math.abs(Math.atan2(Math.sin(Math.atan2(dx, dz) - L.P.yaw), Math.cos(Math.atan2(dx, dz) - L.P.yaw)));
          inCone = d < RANGE && a < CONE && Math.abs(R.P.pos.y - L.P.pos.y) < 1.5 || d < 0.8; }
        G.lit = inCone ? G.lit + dt : Math.max(0, G.lit - dt * 2);
        if (G.lit >= HOLD) { ctx.send('found', {}); return end(true, `🔦 TÌM THẤY ${oN.toUpperCase()}!`); }
        show(`<div class="m">🔦 Đi tìm ${oN}! ${Math.ceil(SEEK - G.t)} s</div><div class="s">${G.lit > 0.05 ? 'Hình như thấy gì đó…' : 'Soi đèn pin quanh phòng'}</div>`);
      } else {
        mask(L, 1.3, 0);
        if (!G.sneezed) { snz.hidden = false; if (G.t > 25) sneeze(); }
        show(`<div class="m">🤫 Núp im! ${Math.ceil(SEEK - G.t)} s</div><div class="s">${G.sneezed ? 'Đã hắt xì rồi…' : 'Phải hắt xì 1 lần trước giây 25!'}</div>`);
      }
      if (G.t >= SEEK) { if (!seeker) { ctx.send('timeout', {}); end(true, '🎉 Trốn giỏi quá — không bị tìm thấy!'); } else if (G.t >= SEEK + 2.5) end(false, `${oN} trốn kỹ quá!`); }
    }
    function sneeze() { if (!G || G.sneezed) return; G.sneezed = true; snz.hidden = true; ctx.send('sneeze', {}); ctx.toast('🤧 Hắt xììì!'); try { VY().local.mouthSay([[0, 0.5]]); } catch (e) {} }
    snz.onclick = sneeze;
    ctx.on('sneeze', () => { if (!G || G.done) return; const V = VY(); ctx.toast('🤧 Có tiếng hắt xì!'); if (V && V.remote && V.local) { const dx = V.remote.P.pos.x - V.local.P.pos.x, dz = V.remote.P.pos.z - V.local.P.pos.z;
      const a = Math.atan2(dx, dz) - V.local.P.yaw, s = Math.sin(a), c = Math.cos(a); show(`<div class="m">🤧 Hắt xì ở phía ${c > 0.7 ? 'TRƯỚC mặt' : c < -0.7 ? 'SAU lưng' : s > 0 ? 'bên TRÁI' : 'bên PHẢI'}!</div>`); } });
    ctx.on('found', () => end(false, `😱 Bị ${oN} tìm thấy rồi!`));
    ctx.on('timeout', () => end(false, `${oN} trốn kỹ quá!`));
    function end(win, msg) { if (!G || G.done) return; finish(win, msg); }
    function finish(win, msg) {
      const g0 = G; if (G) G.done = true; G = null; cancelAnimationFrame(raf); dark.hidden = true; snz.hidden = true;
      const api = VY() && VY().api; if (api && api.lampGroup && lampsWas) { api.lampGroup('a', lampsWas.a); api.lampGroup('b', lampsWas.b); lampsWas = null; }   // bật lại đèn như trước
      const L = led(), bet = g0 ? g0.bet : 0, bm = g0 && g0.mode === 'bet';
      if (win === true) { L.w++; if (bm) L.pts += bet; } else if (win === false) { L.l++; if (bm) L.pts -= bet; } ledSet(L);
      show(`<div class="m">${msg}</div><div class="s">${win == null ? '' : bm ? (win ? '+' : '−') + bet + ' điểm thách đấu' : win ? 'Thắng giao hữu!' : 'Thua giao hữu'}</div><div class="s">${ledTxt()}</div><div class="bt"><button class="p" data-re>Đổi vai chơi lại 🔁</button><button data-x>Đóng</button></div>`);
      box.onclick = e => { const b = e.target.closest('button'); if (!b) return; if (b.dataset.x != null) return hide();
        if (b.dataset.re != null && g0) { pend = {mode: g0.mode, bet: g0.bet, seeker: g0.seeker === 'bin' ? 'vy' : 'bin'}; ctx.send('inv', pend); show(`<div class="m">Chờ ${oN} nhận lời…</div>`); box.onclick = null; pend.tm = setTimeout(() => { if (pend) { pend = null; hide(); } }, 20000); } };
    }
    const btn = ctx.ui.addButton({icon: '🔦', label: '', title: 'Tắt đèn đi trốn (minigame trong nhà)', onClick: inviteUI});
    if (btn) btn.id = 'iHide';
    window.__hide = {state: () => G && {seeker: G.seeker, t: +G.t.toFixed(2), lit: +G.lit.toFixed(2), done: G.done, sneezed: G.sneezed}, invite: (m = 'fr', b = 0) => sendInv(m, b), accept: () => box.querySelector('[data-a]') && box.querySelector('[data-a]').click()};
  },
};
