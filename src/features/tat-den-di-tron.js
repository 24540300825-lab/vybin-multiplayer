// MINIGAME "TẮT ĐÈN ĐI TRỐN" (trong nhà, 2 người). Vào ván: tắt hết đèn + màn hình phủ đen thui, chỉ thấy trong quầng đèn pin.
// Người trốn: 15 s đi trốn (người tìm bị bịt mắt, màn đen hẳn), rồi 45 s người tìm cầm đèn pin (quầng sáng phía trước nhân vật).
// Người tìm soi trúng (trong 4.5 m, lệch ≤ 28°) liên tục 0.6 s → tìm thấy. Hết giờ chưa thấy → người trốn thắng. Người trốn có 1 nút "Hắt xì" (tự động hắt xì 1 lần ở giây ngẫu nhiên; người tìm thấy vòng sáng 🤧 chỉ chỗ phát ra tiếng).
// Chế độ: Giao hữu / Thách đấu cược điểm (dùng chung sổ điểm thách đấu với Khoai nóng). Bên quyết định "tìm thấy" là người tìm.
const HIDES = [15, 30, 60], SEEK = 45, RANGE = 4.5, CONE = 28 * Math.PI / 180, HOLD = 0.6, BETS = [10, 50, 100];
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
#hsPing{position:fixed;z-index:14;pointer-events:none;width:7rem;height:7rem;margin:-3.5rem 0 0 -3.5rem;border-radius:50%;border:3px solid #ffd54f;box-shadow:0 0 1.5rem #ffd54f,inset 0 0 1.2rem #ffd54f;animation:hsp 1s ease-out 3}#hsPing[hidden]{display:none}#hsPing b{position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);font-size:1.6rem;animation:none}
@keyframes hsp{0%{transform:scale(.3);opacity:1}100%{transform:scale(1.4);opacity:0}}
#hsSneeze{position:fixed;left:50%;bottom:7rem;transform:translateX(-50%);z-index:13;border:0;border-radius:2rem;padding:.8rem 1.4rem;font:inherit;font-weight:700;color:#fff;background:#e0564b;cursor:pointer}#hsSneeze[hidden]{display:none}`;
    document.head.appendChild(css);
    const box = document.createElement('div'); box.id = 'hsBox'; box.className = 'hud panel'; box.hidden = true;
    const dark = document.createElement('div'); dark.id = 'hsDark'; dark.hidden = true;
    const snz = document.createElement('button'); snz.id = 'hsSneeze'; snz.hidden = true; snz.textContent = '🤧 Hắt xì!';
    const ping = document.createElement('div'); ping.id = 'hsPing'; ping.hidden = true; ping.innerHTML = '<b>🤧</b>';
    document.body.append(dark, box, snz, ping);
    const show = h => { box.innerHTML = h; box.hidden = false; }, hide = () => { box.hidden = true; };
    let hsel = 30, G = null, pend = null, raf = 0, peerOn = !ctx.solo, lampsWas = null;
    ctx.onPeer(({present}) => { peerOn = !!present; if (!present && G && !G.done) finish(null, oN + ' đã rời đi — huỷ ván'); });
    // Đổi map = tải lại iframe nên tính năng khởi tạo lại → ván bị mất. Lưu ván ra localStorage và khôi phục ngay sau khi đổi map (đồng hồ theo giờ thật).
    const RK = 'vyf:hs:resume:' + me; let peerMap = null;
    if (ctx.sess) ctx.sess.on('msg', m => { if (m.k === 's' && m.mp) peerMap = m.mp; });
    const sameMap = () => !ctx.sess || !peerMap || peerMap === ctx.mapId;
    const saveG = () => { try { if (G && !G.done) localStorage.setItem(RK, JSON.stringify({ts: Date.now(), slot: me, mode: G.mode, bet: G.bet, hide: G.hide, seeker: G.seeker, start: Date.now() - G.t * 1000, sneezeAt: G.sneezeAt, sneezed: G.sneezed, lamps: lampsWas})); else localStorage.removeItem(RK); } catch (e) {} };
    addEventListener('pagehide', saveG); setInterval(saveG, 1000);
    const okMap = () => !(VY() && VY().EXT && ctx.mapId === 'exterior');
    const modeTxt = (m, b) => m === 'bet' ? `Thách đấu · cược ${b} điểm` : 'Giao hữu';

    function inviteUI() {
      if (!okMap()) return ctx.toast('Vào trong nhà mới chơi Tắt đèn đi trốn được nha 🏠');
      if (ctx.solo || !peerOn || !VY().remote) return ctx.toast('Cần ' + oN + ' ở cùng phòng để chơi');
      if (G) return ctx.toast('Đang chơi rồi!');
      show(`<h4>🔦 Tắt đèn đi trốn — thách ${oN}</h4><div class="s">Tối thui, chỉ thấy trong quầng đèn pin. Trốn được cả nhà, kể cả khác tầng.</div>
        <div class="s">Thời gian đi trốn (hết giờ người trốn mất đèn pin):</div><div class="bt">${HIDES.map(h => `<button data-h="${h}" class="${h === hsel ? 'p' : ''}">${h} s</button>`).join('')}</div>
        <div class="bt"><button class="p" data-m="fr">Giao hữu</button>${BETS.map(b => `<button data-m="bet" data-b="${b}">Thách đấu ${b}</button>`).join('')}<button data-x>Huỷ</button></div><div class="s">${ledTxt()}</div>`);
      box.onclick = e => { const b = e.target.closest('button'); if (!b) return; if (b.dataset.x != null) return hide(); if (b.dataset.h) { hsel = +b.dataset.h; box.querySelectorAll('[data-h]').forEach(x => x.classList.toggle('p', x === b)); return; } sendInv(b.dataset.m, +(b.dataset.b || 0)); };
    }
    function sendInv(mode, bet) {
      pend = {mode, bet, hide: hsel, seeker: Math.random() < 0.5 ? 'bin' : 'vy'}; ctx.send('inv', pend);
      show(`<div class="m">Chờ ${oN} nhận lời…</div><div class="s">${modeTxt(mode, bet)}</div>`); box.onclick = null;
      pend.tm = setTimeout(() => { if (pend && !G) { pend = null; hide(); ctx.toast(oN + ' chưa nhận lời'); } }, 20000);
    }
    ctx.on('inv', d => {
      if (G) return ctx.send('busy', {});
      show(`<h4>🔦 ${oN} thách bạn chơi Tắt đèn đi trốn!</h4><div class="m">${modeTxt(d.mode, d.bet)} · trốn ${d.hide || 15} s</div><div class="s">${d.seeker === me ? 'Bạn là người TÌM' : 'Bạn là người TRỐN'}</div>
        <div class="bt"><button class="p" data-a ${okMap() ? '' : 'disabled'}>Nhận lời</button><button data-x>Từ chối</button></div>`);
      box.onclick = e => { const b = e.target.closest('button'); if (!b) return; if (b.dataset.x != null) { ctx.send('no', {}); return hide(); } if (b.dataset.a != null) { ctx.send('yes', {}); begin(d, 3350); } };
    });
    ctx.on('yes', () => { if (pend) { clearTimeout(pend.tm); const d = pend; pend = null; begin(d, 3500); } });
    ctx.on('no', () => { if (pend) { clearTimeout(pend.tm); pend = null; show(`<div class="m">😏 ${oN} từ chối — sợ ma à?</div>`); setTimeout(hide, 2200); } });
    ctx.on('busy', () => { if (pend) { pend = null; hide(); ctx.toast(oN + ' đang bận chơi'); } });

    function begin(d, delay, resume) {
      G = {mode: d.mode, bet: d.bet, hide: d.hide || 15, seeker: d.seeker, t: -delay / 1000 - (d.hide || 15), last: performance.now(), lit: 0, start: Date.now() - (-delay / 1000 - (d.hide || 15)) * 1000, done: false, sneezed: false, sneezeAt: 6 + Math.random() * 18};   // hắt xì TỰ ĐỘNG ở giây ngẫu nhiên 6–24 của lượt tìm
      const api = VY().api; if (api && api.lamps) { lampsWas = resume ? resume.lamps : {a: api.lampGroup('a'), b: api.lampGroup('b')}; api.lamps(false); }   // tắt hết đèn
      if (resume) { G.t = (Date.now() - resume.start) / 1000; G.sneezeAt = resume.sneezeAt; G.sneezed = resume.sneezed; }
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
      if (G.t < -G.hide) { dark.style.background = '#000'; show(`<h4>🔦 Tắt đèn đi trốn · ${modeTxt(G.mode, G.bet)}</h4><div class="m">${Math.ceil(-G.hide - G.t)}…</div><div class="s">${seeker ? 'Bạn là người TÌM' : 'Bạn là người TRỐN'}</div>`); return; }
      if (G.t < 0) {   // trốn
        if (seeker) { dark.style.background = '#000'; show(`<div class="m">🙈 Bịt mắt đếm… ${Math.ceil(-G.t)}</div><div class="s">${oN} đang đi trốn</div>`); }
        else { mask(L, 2.6, 0); show(`<div class="m">🏃 Đi trốn nhanh! ${Math.ceil(-G.t)}</div><div class="s">Trốn phòng nào cũng được, lên gác cũng được. Hết giờ là mất đèn pin!</div>`); }
        return;
      }
      if (R && R.char && sameMap()) { const same = Math.abs(R.P.pos.y - L.P.pos.y) < 1.5, d = Math.hypot(R.P.pos.x - L.P.pos.x, R.P.pos.z - L.P.pos.z); R.char.visible = same && (seeker ? d < RANGE + 0.5 : d < 9); }   // khác tầng: không thấy nhau
      if (seeker) {
        mask(L, 2.6, 2.0);
        let inCone = false;
        if (R && sameMap()) { const dx = R.P.pos.x - L.P.pos.x, dz = R.P.pos.z - L.P.pos.z, d = Math.hypot(dx, dz);
          const a = Math.abs(Math.atan2(Math.sin(Math.atan2(dx, dz) - L.P.yaw), Math.cos(Math.atan2(dx, dz) - L.P.yaw)));
          const same = Math.abs(R.P.pos.y - L.P.pos.y) < 1.5;   // khác tầng thì KHÔNG tính (kể cả đứng chồng lên nhau trên màn hình)
          inCone = same && (d < RANGE && a < CONE || d < 0.8); }   // same = cùng tầng (chênh cao < 1.5 m)
        G.lit = inCone ? G.lit + dt : Math.max(0, G.lit - dt * 2);
        if (G.claim && now - G.claim > 2000) { G.claim = 0; return end(true, `🔦 TÌM THẤY ${oN.toUpperCase()}!`); }   // không thấy trả lời: coi như đúng
        if (G.lit >= HOLD && !G.claim) { G.claim = now; ctx.send('found', {sy: +L.P.pos.y.toFixed(2), sx: +L.P.pos.x.toFixed(2), sz: +L.P.pos.z.toFixed(2)}); }   // xin xác nhận: người trốn kiểm tra lại độ cao thật của chính mình
        show(`<div class="m">🔦 Đi tìm ${oN}! ${Math.ceil(SEEK - G.t)} s</div><div class="s">${G.lit > 0.05 ? 'Hình như thấy gì đó…' : 'Soi đèn pin quanh phòng'}</div>`);
      } else {
        mask(L, 0.4, 0);   // hết giờ trốn: mất đèn pin, chỉ còn chút ánh sáng quanh chân
        if (!G.sneezed && G.t > G.sneezeAt) sneeze();
        show(`<div class="m">🤫 Núp im! ${Math.ceil(SEEK - G.t)} s</div><div class="s">${G.sneezed ? 'Lỡ hắt xì rồi…' : 'Cố nhịn hắt xì nha… 🤧'}</div>`);
      }
      if (G.t >= SEEK) { if (!seeker) { ctx.send('timeout', {}); end(true, '🎉 Trốn giỏi quá — không bị tìm thấy!'); } else if (G.t >= SEEK + 2.5) end(false, `${oN} trốn kỹ quá!`); }
    }
    function sneeze() { if (!G || G.sneezed) return; G.sneezed = true; ctx.send('sneeze', {}); ctx.toast('🤧 Hắt xììì!'); try { VY().local.mouthSay([[0, 0.5]]); } catch (e) {} }
        let pingTm = 0;
    ctx.on('sneeze', () => { if (!G || G.done) return; const V = VY(); ctx.toast('🤧 Có tiếng hắt xì!'); if (!(V && V.remote && V.local)) return; if (!sameMap()) { ctx.toast('🤧 Tiếng hắt xì vọng từ PHÒNG KHÁC!'); return; }
      const TH = V.THREE, cam = V.camera, q = V.remote.P.pos, v = new TH.Vector3(q.x, q.y + 1, q.z).project(cam);   // chiếu vị trí phát tiếng lên màn hình; ngoài màn hình thì kẹp vào mép
      let x = (v.x * 0.5 + 0.5) * innerWidth, y = (-v.y * 0.5 + 0.5) * innerHeight; if (v.z > 1) { x = innerWidth - x; y = innerHeight - y; }
      const m = 70; ping.style.left = Math.max(m, Math.min(innerWidth - m, x)) + 'px'; ping.style.top = Math.max(m, Math.min(innerHeight - m, y)) + 'px';
      ping.hidden = false; ping.style.animation = 'none'; void ping.offsetWidth; ping.style.animation = ''; clearTimeout(pingTm); pingTm = setTimeout(() => { ping.hidden = true; }, 3000); });
    ctx.on('found', d => { if (!G || G.done) return; const L = VY() && VY().local;   // người trốn là bên biết chắc mình ở tầng nào
      if (L && d && d.sy != null && (Math.abs(d.sy - L.P.pos.y) >= 1.5 || !sameMap())) { ctx.send('foundno', {}); return; }
      ctx.send('foundok', {}); end(false, `😱 Bị ${oN} tìm thấy rồi!`); });
    ctx.on('foundok', () => { if (G && !G.done && G.claim) end(true, `🔦 TÌM THẤY ${oN.toUpperCase()}!`); });
    ctx.on('foundno', () => { if (G && !G.done) { G.claim = 0; G.lit = 0; ctx.toast('Khác tầng — chưa thấy được 😅'); } });
    ctx.on('timeout', () => end(false, `${oN} trốn kỹ quá!`));
    function end(win, msg) { if (!G || G.done) return; finish(win, msg); }
    function finish(win, msg) {
      const g0 = G; if (G) G.done = true; G = null; try { localStorage.removeItem(RK); } catch (e) {} cancelAnimationFrame(raf); dark.hidden = true; snz.hidden = true; ping.hidden = true; try { const R = VY().remote; if (R && R.char) R.char.visible = true; } catch (e) {}
      const api = VY() && VY().api; if (api && api.lampGroup && lampsWas) { api.lampGroup('a', lampsWas.a); api.lampGroup('b', lampsWas.b); lampsWas = null; }   // bật lại đèn như trước
      const L = led(), bet = g0 ? g0.bet : 0, bm = g0 && g0.mode === 'bet';
      if (win === true) { L.w++; if (bm) L.pts += bet; } else if (win === false) { L.l++; if (bm) L.pts -= bet; } ledSet(L);
      show(`<div class="m">${msg}</div><div class="s">${win == null ? '' : bm ? (win ? '+' : '−') + bet + ' điểm thách đấu' : win ? 'Thắng giao hữu!' : 'Thua giao hữu'}</div><div class="s">${ledTxt()}</div><div class="bt"><button class="p" data-re>Đổi vai chơi lại 🔁</button><button data-x>Đóng</button></div>`);
      box.onclick = e => { const b = e.target.closest('button'); if (!b) return; if (b.dataset.x != null) return hide();
        if (b.dataset.re != null && g0) { pend = {mode: g0.mode, bet: g0.bet, hide: g0.hide, seeker: g0.seeker === 'bin' ? 'vy' : 'bin'}; ctx.send('inv', pend); show(`<div class="m">Chờ ${oN} nhận lời…</div>`); box.onclick = null; pend.tm = setTimeout(() => { if (pend) { pend = null; hide(); } }, 20000); } };
    }
    try { const sv = JSON.parse(localStorage.getItem(RK) || 'null'); localStorage.removeItem(RK);
      if (sv && sv.slot === me && Date.now() - sv.ts < 25000 && !ctx.solo && Date.now() - sv.start < (sv.hide + SEEK + 3) * 1000) { begin(sv, 0, sv); ctx.toast('🔦 Tiếp tục ván trốn tìm ở phòng mới'); } } catch (e) { console.warn('hs resume', e); }
    const btn = ctx.ui.addButton({icon: '🔦', label: '', title: 'Tắt đèn đi trốn (minigame trong nhà)', onClick: inviteUI});
    if (btn) btn.id = 'iHide';
    window.__hide = {state: () => G && {seeker: G.seeker, t: +G.t.toFixed(2), lit: +G.lit.toFixed(2), done: G.done, sneezed: G.sneezed}, invite: (m = 'fr', b = 0) => sendInv(m, b), accept: () => box.querySelector('[data-a]') && box.querySelector('[data-a]').click()};
  },
};
