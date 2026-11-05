// MINIGAME "KHOAI NÓNG" — rượt nhau ngoài vườn (map exterior), 2 người.
// Ai cầm khoai phải chạm vào người kia để chuyền. Hết giờ (ẩn, 15–35 s) mà khoai còn trên tay → BÙM, đen mặt.
// Chuyền xong có 1.2 s người nhận không chuyền ngược lại được. Chế độ: Giao hữu (không cược) / Thách đấu (cược điểm thách đấu).
// Đồng bộ: người đang cầm là người xét chạm & xét nổ (1 nguồn quyết định → không cãi nhau), gửi 'pass' / 'boom' cho bên kia.
const TOUCH = 0.95, NOPASS = 1.2, BETS = [10, 50, 100];
// tốc độ trong ván: 2 bên GIỐNG HỆT nhau (đi 5, chạy 7 m/s); anim nhanh theo (không tuyến tính hoàn toàn để chân không quay như chong chóng)
const SPD = {walk: 5, run: 7, walkAnim: 3.4, runAnim: 2.3};
// Turbo: dùng được mỗi 10 s (tính từ đầu ván / lúc hết turbo trước), kéo dài 5 s, nhân tốc độ ×1.5. Phím G (đổi được trong Cài đặt phím).
const BOOST_CD = 10, BOOST_T = 5, BOOST_X = 1.5;
const rngOf = seed => { let s = seed >>> 0 || 1; return () => (s = (s * 16807) % 2147483647) / 2147483647; };
export default {
  id: 'potato',
  init(ctx) {
    const VY = () => window.VY, T = () => VY().THREE, CFG = window.CFG;
    const css = document.createElement('style');
    css.textContent = `#hpBox{position:fixed;left:50%;top:5.5rem;transform:translateX(-50%);z-index:13;width:min(21rem,92vw);padding:1rem 1.25rem;border-radius:1.75rem;color:#fff;text-align:center}
#hpBox[hidden]{display:none}#hpBox h4{margin:.1rem 0 .6rem;font-size:1.05rem}#hpBox .m{font-size:1.1rem;font-weight:700;min-height:1.4rem}#hpBox .s{font-size:.8rem;opacity:.75;margin-top:.4rem}
#hpBox .bt{display:flex;flex-wrap:wrap;gap:.4rem;justify-content:center;margin-top:.6rem}#hpBox button{border:0;border-radius:1rem;padding:.55rem .9rem;font:inherit;font-size:.9rem;color:#fff;background:rgba(255,255,255,.14);cursor:pointer}
#hpBox button:hover{background:rgba(255,255,255,.24)}#hpBox button.p{background:#e8913a}#hpBox.hot{animation:hpH .5s infinite alternate}@keyframes hpH{to{box-shadow:0 0 2rem #ff5a2a}}`;
    document.head.appendChild(css);
    const box = document.createElement('div'); box.id = 'hpBox'; box.className = 'hud panel'; box.hidden = true; document.body.appendChild(box);
    const NAME = {bin: 'Bin', vy: 'Vy'}, me = ctx.slot, other = ctx.other, oN = NAME[other] || 'Bạn kia';
    const led = () => ctx.store.get('led', {pts: 0, w: 0, l: 0});
    const ledTxt = () => { const L = led(); return `Thắng ${L.w} – Thua ${L.l} · Điểm thách đấu: ${L.pts}`; };
    const show = (html, hot) => { box.innerHTML = html; box.hidden = false; box.classList.toggle('hot', !!hot); };
    const hide = () => { box.hidden = true; box.classList.remove('hot'); };
    let G = null, pend = null, raf = 0, peerOn = !ctx.solo, cfg0 = null;
    ctx.onPeer(({present}) => { peerOn = !!present; if (!present && G && !G.done) finish(null, oN + ' đã rời đi — huỷ ván'); });
    const okMap = () => ctx.mapId === 'exterior';
    const modeTxt = (mode, bet) => mode === 'bet' ? `Thách đấu · cược ${bet} điểm` : 'Giao hữu';

    // ---- quả khoai (mesh nhỏ gắn trên đầu người cầm) + nổ đen mặt ----
    let potato = null;
    function potatoMesh() {
      if (potato) return potato; const TH = T();
      const g = new TH.Group(), body = new TH.Mesh(new TH.SphereGeometry(0.13, 12, 9), new TH.MeshStandardMaterial({color: 0x9a6233, roughness: 0.8, emissive: 0xff3300, emissiveIntensity: 0}));
      body.scale.set(1.25, 0.85, 0.9); g.add(body);
      for (let i = 0; i < 3; i++) { const p = new TH.Mesh(new TH.SphereGeometry(0.045, 6, 5), new TH.MeshBasicMaterial({color: 0xdddddd, transparent: true, opacity: 0.6, depthWrite: false})); p.userData.ph = i / 3; g.add(p); }
      g.userData.body = body; potato = g; return g;
    }
    const charOf = slot => { const V = VY(); if (!V) return null; return slot === me ? V.local : V.remote; };
    function placePotato(now) {
      if (!G || G.done) { if (potato && potato.parent) potato.parent.remove(potato); return; }
      const c = charOf(G.holder); if (!c || !c.char) return; const m = potatoMesh(); const V = VY();
      if (m.parent !== V.scene) V.scene.add(m);
      const p = c.P.pos; const k = Math.min(1, G.t / G.fuse), bob = Math.sin(now / 90) * 0.03 * (1 + k * 3);
      m.position.set(p.x, p.y + 1.55 + bob, p.z); m.rotation.y = now / 300;
      m.userData.body.material.emissiveIntensity = k > 0.6 ? (0.4 + 0.6 * Math.abs(Math.sin(now / (160 - k * 100)))) * k : 0;   // gần nổ: nhấp nháy đỏ, nhanh dần
      m.children.forEach(s => { if (s === m.userData.body) return; const f = ((now / 900) + s.userData.ph) % 1; s.position.set(Math.sin(f * 9) * 0.05, 0.12 + f * 0.45, 0); s.material.opacity = 0.6 * (1 - f); s.scale.setScalar(0.6 + f * 1.4); });
    }
    function blacken(slot, on) {
      const c = charOf(slot); if (!c || !c.char) return;
      c.char.traverse(o => { if (!o.isMesh) return; [].concat(o.material).forEach(m => { if (!m || !m.color) return;
        if (on) { if (m.userData.hpC == null) m.userData.hpC = m.color.getHex(); m.color.setRGB(0.09, 0.08, 0.08); } else if (m.userData.hpC != null) { m.color.setHex(m.userData.hpC); delete m.userData.hpC; } }); });
    }
    // nạp sẵn (biên dịch shader) quả khoai + quả cầu nổ ngay lúc vào ván → lúc nổ không phải tạo vật liệu/biên dịch shader mới (tránh khựng đứng máy)
    let boomS = null;
    function prewarm() {
      const V = VY(), TH = T(); if (!V || !V.renderer) return;
      if (!boomS) { boomS = new TH.Mesh(new TH.SphereGeometry(1, 12, 8), new TH.MeshBasicMaterial({color: 0xffa040, transparent: true, opacity: 0.9, depthWrite: false})); boomS.frustumCulled = false; }
      const pm = potatoMesh(); pm.position.set(0, -50, 0); boomS.position.set(0, -50, 0); boomS.scale.setScalar(0.01);
      V.scene.add(pm); V.scene.add(boomS);
      try { V.renderer.compile(V.scene, V.camera); } catch (e) {}
      V.scene.remove(boomS);
    }
    function boomFx(slot) {
      const c = charOf(slot), V = VY(); if (!c || !V) return; if (!boomS) prewarm(); const s = boomS;
      s.position.copy(c.P.pos); s.position.y += 1.2; V.scene.add(s); const t0 = performance.now();
      const step = () => { const u = (performance.now() - t0) / 600; if (u >= 1) { V.scene.remove(s); return; } s.scale.setScalar(0.2 + u * 2.4); s.material.opacity = 0.9 * (1 - u); s.material.color.setHSL(0.08 - u * 0.08, 1, 0.6 - u * 0.4); requestAnimationFrame(step); };
      step(); blacken(slot, true); setTimeout(() => blacken(slot, false), 6000);
      try { if (c.mouthSay) c.mouthSay([[0, 1.0]]); } catch (e) {}
    }

    // ---- mời / nhận lời ----
    function inviteUI() {
      if (!okMap()) return ctx.toast('Ra ngoài vườn mới chơi Khoai nóng được nha 🌳');
      if (ctx.solo || !peerOn || !VY().remote) return ctx.toast('Cần ' + oN + ' cùng ở trong vườn để chơi');
      if (G) return ctx.toast('Đang chơi rồi!');
      show(`<h4>🥔 Khoai nóng — thách ${oN}</h4><div class="s">Bị chạm là dính khoai. Hết giờ còn cầm → BÙM, đen mặt!</div>
        <div class="bt"><button class="p" data-m="fr">Giao hữu</button>${BETS.map(b => `<button data-m="bet" data-b="${b}">Thách đấu ${b} điểm</button>`).join('')}<button data-x>Huỷ</button></div><div class="s">${ledTxt()}</div>`);
      box.onclick = e => { const b = e.target.closest('button'); if (!b) return; if (b.dataset.x != null) return hide();
        const mode = b.dataset.m, bet = +(b.dataset.b || 0); if (mode === 'bet' && led().pts < bet && led().pts > -1000) {/* cho phép âm điểm: chơi vui */}
        pend = {mode, bet, seed: (Math.random() * 2e9) | 0, from: me}; ctx.send('inv', pend);
        show(`<h4>🥔 Đã gửi lời thách</h4><div class="m">Chờ ${oN} nhận…</div><div class="s">${modeTxt(mode, bet)}</div><div class="bt"><button data-x>Huỷ</button></div>`);
        box.onclick = e2 => { if (e2.target.closest('[data-x]')) { ctx.send('cancel', {}); pend = null; hide(); } };
        clearTimeout(pend.tm); pend.tm = setTimeout(() => { if (pend && !G) { pend = null; show(`<div class="m">${oN} chưa nhận lời</div>`); setTimeout(hide, 2000); } }, 20000); };
    }
    ctx.on('inv', d => {
      if (G) return ctx.send('busy', {});
      show(`<h4>🥔 ${oN} thách bạn chơi Khoai nóng!</h4><div class="m">${modeTxt(d.mode, d.bet)}</div><div class="s">${okMap() ? 'Rượt nhau ngoài vườn — bị chạm là dính khoai' : 'Bạn cần ra vườn để chơi'}</div>
        <div class="bt"><button class="p" data-a ${okMap() ? '' : 'disabled'}>Nhận lời</button><button data-x>Từ chối</button></div>`);
      box.onclick = e => { const b = e.target.closest('button'); if (!b) return; if (b.dataset.x != null) { ctx.send('no', {}); return hide(); }
        if (b.dataset.a != null) { ctx.send('yes', {}); begin(d, 3500 - 150); } };
    });
    ctx.on('yes', () => { if (pend) { clearTimeout(pend.tm); const d = pend; pend = null; begin(d, 3500); } });
    ctx.on('no', () => { if (pend) { clearTimeout(pend.tm); pend = null; show(`<div class="m">😤 ${oN} từ chối — sợ đen mặt à?</div>`); setTimeout(hide, 2200); } });
    ctx.on('busy', () => { if (pend) { pend = null; ctx.toast(oN + ' đang bận chơi'); hide(); } });
    ctx.on('cancel', () => { if (!G) hide(); });

    // ---- ván chơi ----
    function begin(d, delay) {
      const r = rngOf(d.seed);
      G = {mode: d.mode, bet: d.bet, holder: r() < 0.5 ? 'bin' : 'vy', fuse: 15 + r() * 20, t: -delay / 1000, bNext: 10, bUntil: -1, last: performance.now(), noPass: 0, passes: 0, done: false, waitBoom: 0};
      cfg0 = {walk: CFG.walk, run: CFG.run, walkAnim: CFG.walkAnim, runAnim: CFG.runAnim}; Object.assign(CFG, SPD); window.__spd.mL = window.__spd.mR = 1;
      prewarm();
      box.onclick = null; cancelAnimationFrame(raf); raf = requestAnimationFrame(loop);
    }
    function useBoost() {
      if (!G || G.done || G.t < 0) return; if (G.t < G.bNext || G.bUntil > G.t) return;
      G.bUntil = G.t + BOOST_T; G.bNext = G.bUntil + BOOST_CD; window.__spd.mL = BOOST_X; ctx.send('boost', {on: 1}); ctx.toast('⚡ TURBO!');
    }
    function boostTick() {
      if (G.bUntil > 0 && G.t >= G.bUntil && window.__spd.mL !== 1) { window.__spd.mL = 1; ctx.send('boost', {on: 0}); }
    }
    ctx.on('boost', d => { window.__spd.mR = d.on ? BOOST_X : 1; });
    addEventListener('vy:act', e => { if (e.detail === 'boost') useBoost(); });
    function boostTxt() { if (G.t < 0) return ''; if (G.bUntil > G.t) return `⚡ Turbo ${Math.ceil(G.bUntil - G.t)} s`; return G.t >= G.bNext ? '⚡ Turbo sẵn sàng — bấm G' : `Turbo hồi ${Math.ceil(G.bNext - G.t)} s`; }
    function hud() {
      if (G.t < 0) return show(`<h4>🥔 Khoai nóng · ${modeTxt(G.mode, G.bet)}</h4><div class="m">${Math.ceil(-G.t)}…</div><div class="s">${G.holder === me ? 'Bạn cầm khoai trước! Chạm ' + oN + ' để chuyền' : oN + ' cầm khoai trước — chạy đi!'}</div>`);
      const mine = G.holder === me, k = G.t / G.fuse;
      show(`<div class="m">${mine ? '🔥 KHOAI TRÊN TAY BẠN — chạm ' + oN + '!' : '🏃 Chạy đi! ' + oN + ' đang cầm khoai'}</div><div class="s">${mine && G.noPass > 0 ? 'Vừa nhận — chưa chuyền lại được' : k > 0.66 ? 'Khoai sắp nổ!!' : 'Chuyền ' + G.passes + ' lần'} · ${boostTxt()}</div>`, mine && k > 0.66);
    }
    function loop(now) {
      if (!G) return; raf = requestAnimationFrame(loop);
      const dt = Math.min(0.1, (now - G.last) / 1000); G.last = now; if (G.done) return;
      G.t += dt; if (G.noPass > 0) G.noPass -= dt; boostTick();
      placePotato(now);
      if ((now | 0) % 4 === 0 || G.t < 0.2) hud();
      if (G.t < 0) return;
      const V = VY(); if (!V || !V.remote) return;
      if (G.holder === me) {
        const a = V.local.P.pos, b = V.remote.P.pos;
        if (G.noPass <= 0 && Math.hypot(a.x - b.x, a.z - b.z) < TOUCH && Math.abs(a.y - b.y) < 1.2) { G.holder = other; G.passes++; ctx.send('pass', {n: G.passes}); ctx.toast('Chuyền khoai cho ' + oN + '! 🥔'); hud(); }
        else if (G.t >= G.fuse) { ctx.send('boom', {loser: me}); explode(me); }
      } else if (G.t >= G.fuse + 2.5) { ctx.send('boom', {loser: other}); explode(other); }   // không nhận được tin nổ (mất gói): coi như người cầm thua
    }
    ctx.on('pass', d => { if (!G || G.done) return; G.holder = me; G.passes = d.n || G.passes + 1; G.noPass = NOPASS; ctx.toast('😱 Dính khoai rồi! Chạm ' + oN + ' để chuyền'); hud(); });
    ctx.on('boom', d => { if (G && !G.done) explode(d.loser); });
    function explode(loser) {
      if (!G || G.done) return; G.done = true; G.holder = loser; placePotato(0); boomFx(loser);
      finish(loser !== me, loser === me ? '💥 BÙM! Bạn đen thui rồi 😂' : `💥 BÙM! ${oN} đen thui 😆`);
    }
    function finish(win, msg) {
      if (G) G.done = true; cancelAnimationFrame(raf); if (potato && potato.parent) potato.parent.remove(potato);
      if (cfg0) { Object.assign(CFG, cfg0); cfg0 = null; } window.__spd.mL = window.__spd.mR = 1;
      const L = led(), mode = G && G.mode, bet = (G && G.bet) || 0;
      if (win === true) { L.w++; if (mode === 'bet') L.pts += bet; } else if (win === false) { L.l++; if (mode === 'bet') L.pts -= bet; }
      ctx.store.set('led', L);
      const res = win == null ? '' : mode === 'bet' ? (win ? `+${bet} điểm thách đấu` : `−${bet} điểm thách đấu`) : (win ? 'Thắng giao hữu!' : 'Thua giao hữu');
      show(`<div class="m">${msg}</div><div class="s">${res}</div><div class="s">${ledTxt()}</div><div class="bt"><button class="p" data-re>Phục thù 🔁</button><button data-x>Đóng</button></div>`);
      const g0 = G; G = null;
      box.onclick = e => { const b = e.target.closest('button'); if (!b) return; if (b.dataset.x != null) return hide();
        if (b.dataset.re != null && g0) { pend = {mode: g0.mode, bet: g0.bet, seed: (Math.random() * 2e9) | 0, from: me}; ctx.send('inv', pend); show(`<div class="m">Chờ ${oN} nhận lời phục thù…</div>`); pend.tm = setTimeout(() => { if (pend) { pend = null; hide(); } }, 20000); } };
    }
    const btn = ctx.ui.addButton({icon: '🥔', label: '', title: 'Khoai nóng (minigame ngoài vườn)', onClick: inviteUI});
    if (btn) btn.id = 'iPotato';
    window.__potato = {state: () => G && {holder: G.holder, t: +G.t.toFixed(2), fuse: +G.fuse.toFixed(2), passes: G.passes, done: G.done}, led, invite: (mode = 'fr', bet = 0) => { pend = {mode, bet, seed: (Math.random() * 2e9) | 0, from: me}; ctx.send('inv', pend); }, accept: () => box.querySelector('[data-a]') && box.querySelector('[data-a]').click()};
  },
};
