// PHÒNG GAME (nhà L2) — khung chung cho các trò đối kháng Vy ⇄ Bin: mời / nhận lời, Giao hữu hoặc Thách đấu (cược xu),
// màn chơi toàn màn hình, gửi kết quả lên server (bảng game_arena — supabase/migrations/015_game_arena.sql) + bảng điểm VY–BIN.
// Mở bằng ghim ⭐ trên các máy trong Phòng Game (map-configs.js: spots có id = id trò). Trò mới: thêm file vào src/arena/ + 1 dòng GAMES.
// Sau này: Vy / Bin sẽ "hoá thân" vào nhân vật trong từng trò — bản này là phần trò chơi (luật, điểm, đồng bộ).
import {NAME, COL, rngOf} from '../arena/kit.js';

const GAMES = {
  hockey: () => import('../arena/hockey.js'),
  caro: () => import('../arena/caro.js'),
  bball: () => import('../arena/bball.js'),
  quiz: () => import('../arena/quiz.js'),
};
const BETS = [20, 50, 100];
const GAME_NAME = {hockey: 'Khúc côn cầu', caro: 'Cờ caro', bball: 'Bóng rổ', quiz: 'Ai hiểu ai hơn'};

export default {
  id: 'arena',
  init(ctx) {
    const me = ctx.slot || 'bin', other = ctx.other || (me === 'bin' ? 'vy' : 'bin'), oN = NAME[other];
    const css = document.createElement('style');
    css.textContent = `
#arBox{position:fixed;left:50%;top:5.5rem;transform:translateX(-50%);z-index:30;width:min(23rem,92vw);padding:1rem 1.25rem;border-radius:1.75rem;color:#fff;text-align:center}
#arBox[hidden],#arOv[hidden]{display:none}#arBox h4{margin:.1rem 0 .5rem;font-size:1.1rem}#arBox .m{font-size:1.05rem;font-weight:700;min-height:1.3rem}#arBox .s{font-size:.8rem;opacity:.78;margin-top:.4rem;line-height:1.35}
#arBox .bt{display:flex;flex-wrap:wrap;gap:.4rem;justify-content:center;margin-top:.7rem}#arBox button,#arOv button{border:0;border-radius:1rem;padding:.55rem .9rem;font:inherit;font-size:.9rem;color:#fff;background:rgba(255,255,255,.14);cursor:pointer}
#arBox button:hover,#arOv button:hover{background:rgba(255,255,255,.26)}#arBox button.p,#arOv button.p{background:#e8913a}#arBox button:disabled{opacity:.4;cursor:default}
#arBox table{width:100%;border-collapse:collapse;font-size:.85rem;margin-top:.5rem}#arBox td{padding:.25rem .3rem;border-top:1px solid rgba(255,255,255,.1)}#arBox td:first-child{text-align:left}
#arBox .big{display:flex;justify-content:center;gap:1.4rem;font-size:2rem;font-weight:800;margin:.3rem 0}#arBox .big small{display:block;font-size:.75rem;font-weight:600;opacity:.8}
#arOv{position:fixed;inset:0;z-index:40;background:rgba(10,12,22,.82);backdrop-filter:blur(6px);display:flex;flex-direction:column;align-items:center;color:#fff;font-family:inherit}
#arOv .top{display:flex;align-items:center;gap:.8rem;width:min(40rem,96vw);padding:.7rem .4rem .4rem}
#arOv .ttl{flex:1;font-weight:800;font-size:1.05rem}#arOv .ttl small{display:block;font-weight:500;font-size:.75rem;opacity:.75}
#arOv .sc{display:flex;gap:.5rem;align-items:center;font-weight:800;font-size:1.3rem}#arOv .sc span{padding:.15rem .7rem;border-radius:.8rem;min-width:2.4rem;text-align:center}
#arOv .st{font-size:.85rem;opacity:.85;min-height:1.2rem;text-align:center}
#arOv .stage{flex:1;width:min(40rem,96vw);min-height:0;display:flex;align-items:center;justify-content:center;padding:.4rem 0 1rem;position:relative}
#arOv .ar-cv{display:block;border-radius:1.2rem;box-shadow:0 1rem 3rem rgba(0,0,0,.45);touch-action:none;user-select:none}
#arOv .res{position:absolute;inset:0;display:flex;align-items:center;justify-content:center}#arOv .res>div{background:rgba(20,24,40,.94);border-radius:1.5rem;padding:1.4rem 1.6rem;text-align:center;min-width:16rem;box-shadow:0 1rem 3rem rgba(0,0,0,.5)}
#arOv .res h3{margin:0 0 .4rem;font-size:1.5rem}#arOv .res .bt{display:flex;gap:.5rem;justify-content:center;margin-top:1rem}
.ar-quiz{width:100%;max-width:34rem;background:rgba(255,255,255,.06);border-radius:1.4rem;padding:1.2rem}.ar-quiz .qz-n{font-size:.8rem;opacity:.8}.ar-quiz .qz-q{font-size:1.35rem;font-weight:800;margin:.6rem 0 .3rem;line-height:1.3}
.ar-quiz .qz-h{font-size:.9rem;opacity:.85;margin-bottom:.8rem}.ar-quiz .qz-o{display:grid;grid-template-columns:1fr 1fr;gap:.55rem}.ar-quiz .qz-o button{padding:.85rem .7rem;font-size:.95rem;border-radius:1rem;text-align:left;background:rgba(255,255,255,.1)}
.ar-quiz .qz-o button.me{outline:2px solid #ffd54a}.ar-quiz .qz-o button.ans{background:#2f9e6a}.ar-quiz .qz-o button.bad{background:#a8443f}.ar-quiz .qz-o button i{font-style:normal;font-size:.75rem;opacity:.9;display:block}
.ar-quiz .qz-w{font-size:.8rem;opacity:.7;margin-top:.6rem;min-height:1rem}
@media (max-width:520px){.ar-quiz .qz-o{grid-template-columns:1fr}}`;
    document.head.appendChild(css);
    const box = document.createElement('div'); box.id = 'arBox'; box.className = 'hud panel'; box.hidden = true; document.body.appendChild(box);
    const ov = document.createElement('div'); ov.id = 'arOv'; ov.hidden = true; document.body.appendChild(ov);
    const show = html => { box.innerHTML = html; box.hidden = false; };
    const hide = () => { box.hidden = true; box.onclick = null; };
    let peerOn = !ctx.solo, pend = null, M = null;   // M = trận đang chơi
    ctx.onPeer(({present}) => { peerOn = !!present; if (!present && M && !M.bot && !M.done) endMatch({winner: null, score: M.lastScore || {}, abort: oN + ' đã rời đi — huỷ trận (không tính)'}); });
    const prog = () => window.VYPROG && window.VYPROG.ok ? window.VYPROG : null;
    const xu = () => { const p = prog(); return p && p.me ? (p.me.xu | 0) : null; };
    const modeTxt = (mode, bet) => mode === 'bet' ? `⚔️ Thách đấu · cược ${bet} xu` : mode === 'bot' ? '🤖 Luyện với máy' : '🤝 Giao hữu';
    const newKey = g => g + '-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 8);

    // ---------- sảnh của từng máy ----------
    async function lobby(gid) {
      if (M) return ctx.toast('Đang chơi rồi!');
      const G = (await GAMES[gid]()).default, x = xu(), canPeer = !ctx.solo && peerOn;
      show(`<h4>${G.icon} ${G.title}</h4><div class="s">${G.desc}<br>${G.rules}</div>
        <div class="bt">${canPeer ? `<button class="p" data-m="fr">🤝 Giao hữu với ${oN}</button>${BETS.map(b => `<button data-m="bet" data-b="${b}" ${x != null && x < b ? 'disabled title="Chưa đủ xu"' : x == null ? 'disabled title="Cần đăng nhập để cược xu"' : ''}>⚔️ Thách đấu ${b} xu</button>`).join('')}` : ''}
        <button data-m="bot">🤖 Luyện với máy</button><button data-x>Đóng</button></div>
        <div class="s">${canPeer ? (x != null ? 'Xu của bạn: ' + x + ' · Thua thách đấu mất xu cho người thắng' : '') : oN + ' chưa vào — luyện với máy trước nha'}</div>`);
      box.onclick = e => {
        const b = e.target.closest('button'); if (!b || b.disabled) return; if (b.dataset.x != null) return hide();
        const mode = b.dataset.m, bet = +(b.dataset.b || 0);
        if (mode === 'bot') { hide(); return begin({g: gid, mode: 'bot', bet: 0, seed: (Math.random() * 2e9) | 0, key: null}, true, true); }
        pend = {g: gid, mode, bet, seed: (Math.random() * 2e9) | 0, key: newKey(gid)}; ctx.send('inv', pend);
        show(`<h4>${G.icon} Đã gửi lời mời</h4><div class="m">Chờ ${oN} nhận…</div><div class="s">${G.title} · ${modeTxt(mode, bet)}</div><div class="bt"><button data-x>Huỷ</button></div>`);
        box.onclick = e2 => { if (e2.target.closest('[data-x]')) { ctx.send('cancel', {}); pend = null; hide(); } };
        clearTimeout(pend.tm); pend.tm = setTimeout(() => { if (pend && !M) { pend = null; show(`<div class="m">${oN} chưa nhận lời</div>`); setTimeout(hide, 2000); } }, 25000);
      };
    }
    ctx.on('inv', d => {
      if (M || !GAMES[d.g]) return ctx.send('busy', {});
      const x = xu(), short = d.mode === 'bet' && x != null && x < d.bet;
      show(`<h4>🎮 ${oN} rủ bạn chơi ${GAME_NAME[d.g] || d.g}!</h4><div class="m">${modeTxt(d.mode, d.bet)}</div>
        <div class="s">${short ? 'Bạn chỉ có ' + x + ' xu — thua sẽ mất tối đa số xu đang có' : 'Chơi ngay trên màn hình, ở đâu cũng được'}</div>
        <div class="bt"><button class="p" data-a>Nhận lời</button><button data-x>Để sau</button></div>`);
      box.onclick = e => { const b = e.target.closest('button'); if (!b) return; if (b.dataset.x != null) { ctx.send('no', {}); return hide(); }
        if (b.dataset.a != null) { ctx.send('yes', {key: d.key}); hide(); begin(d, false, false); } };
    });
    ctx.on('yes', d => { if (pend && (!d || !d.key || d.key === pend.key)) { clearTimeout(pend.tm); const p = pend; pend = null; hide(); begin(p, true, false); } });
    ctx.on('no', () => { if (pend) { clearTimeout(pend.tm); pend = null; show(`<div class="m">${oN} để lần sau nha 😌</div>`); setTimeout(hide, 2200); } });
    ctx.on('busy', () => { if (pend) { clearTimeout(pend.tm); pend = null; ctx.toast(oN + ' đang bận chơi'); hide(); } });
    ctx.on('cancel', () => { if (!M) hide(); });

    // ---------- trận đấu ----------
    const keyBlock = e => { if (!M) return; if (e.code === 'Escape') { e.preventDefault(); quit(); } e.stopPropagation(); };
    async function begin(d, host, bot) {
      const G = (await GAMES[d.g]()).default;
      M = {d, host, bot, G, done: false, msgs: [], lastScore: {}};
      ov.innerHTML = `<div class="top"><div class="ttl">${G.icon} ${G.title}<small>${modeTxt(d.mode, d.bet)}${bot ? '' : ' · với ' + oN}</small></div>
        <div class="sc"><span style="background:${COL[me]}" data-s="${me}">0</span><span style="background:${COL[other]}" data-s="${other}">0</span></div>
        <button data-q title="Bỏ cuộc (Esc)">✕</button></div><div class="st"></div><div class="stage"></div>`;
      ov.hidden = false; ov.querySelector('[data-q]').onclick = quit;
      window.addEventListener('keydown', keyBlock, true);
      const stage = ov.querySelector('.stage'), stEl = ov.querySelector('.st');
      const api = {
        stage, me, other, host, bot, seed: d.seed, rng: rngOf(d.seed),
        send: m => bot ? false : ctx.send('g', m),
        onMsg: fn => M.msgs.push(fn),
        score: s => { M.lastScore = Object.assign({}, M.lastScore, s); for (const k of [me, other]) { const el = ov.querySelector(`[data-s="${k}"]`); if (el && s[k] != null) el.textContent = s[k]; } },
        status: t => { if (stEl.textContent !== t) stEl.textContent = t; },
        end: res => { if (host || bot) endMatch(res); },
      };
      try { M.inst = G.start(api); } catch (e) { console.error('[arena]', e); endMatch({winner: null, abort: 'Lỗi khi mở trò'}); }
    }
    ctx.on('g', m => { if (M && !M.done) M.msgs.forEach(fn => { try { fn(m); } catch (e) { console.error('[arena]', e); } }); });
    function quit() {
      if (!M) return; if (M.done) return close();
      if (!confirm(M.bot ? 'Dừng luyện tập?' : 'Bỏ cuộc? (tính là thua' + (M.d.mode === 'bet' ? ', mất ' + M.d.bet + ' xu' : '') + ')')) return;
      if (M.bot) return close();
      if (M.host) endMatch({winner: other, score: M.lastScore, note: 'Bạn bỏ cuộc'});
      else { ctx.send('quit', {}); resultUI({winner: other, score: M.lastScore, note: 'Bạn bỏ cuộc'}); M.done = true; stopInst(); }
    }
    ctx.on('quit', () => { if (M && !M.done && M.host) endMatch({winner: me, score: M.lastScore, note: oN + ' bỏ cuộc'}); });
    const stopInst = () => { try { M && M.inst && M.inst.stop(); } catch (e) {} };
    // host (hoặc luyện máy): chốt kết quả → báo người kia → ghi server (Thách đấu: chuyển xu)
    async function endMatch(res) {
      if (!M || M.done) return; M.done = true; const d = M.d;
      setTimeout(stopInst, 1200);
      if (res.abort) { resultUI(res); return; }
      if (!M.bot) ctx.send('res', {winner: res.winner, score: res.score, note: res.note ? res.note.replace('Bạn bỏ cuộc', NAME[me] + ' bỏ cuộc') : null});
      resultUI(res);
      if (M.bot || !d.key) return;
      const p = prog(); if (!p) { setNote('(Chưa đăng nhập — trận này không lưu lên bảng điểm)'); return; }
      try {
        const r = await p._rpc('game_arena_report', {p_key: d.key, p_game: d.g, p_mode: d.mode, p_bet: d.bet | 0, p_winner: res.winner || null, p_score: res.score || {}});
        ctx.send('xu', {xu: r && r.xu || 0, winner: res.winner}); xuNote(r && r.xu || 0, res.winner); p.refresh(); p._poke && p._poke();
      } catch (e) { console.warn('[arena] report', e); setNote('Không lưu được kết quả: ' + (e.message || e)); }
    }
    ctx.on('res', r => { if (!M || M.done) return; M.done = true; setTimeout(stopInst, 1200); resultUI(r); });
    ctx.on('xu', r => { xuNote(r.xu, r.winner); const p = prog(); p && p.refresh(); });
    const setNote = t => { const n = ov.querySelector('.res .xn'); if (n) n.textContent = t; };
    const xuNote = (n, w) => { if (!M || M.d.mode !== 'bet') return setNote('Đã lưu vào bảng điểm VY–BIN ✓'); setNote(n > 0 ? (w === me ? `+${n} xu 💰` : `−${n} xu`) + ' · đã lưu bảng điểm ✓' : 'Đã lưu bảng điểm ✓'); };
    function resultUI(r) {
      if (!M) return; const st = ov.querySelector('.stage'); const old = st.querySelector('.res'); if (old) old.remove();
      const w = r.winner, s = r.score || {};
      const head = r.abort ? '⚠️ ' + r.abort : w == null ? '🤝 Hoà!' : w === me ? '🏆 Bạn thắng!' : (M.bot ? '🤖 Máy thắng rồi' : `😤 ${NAME[w]} thắng`);
      const div = document.createElement('div'); div.className = 'res';
      div.innerHTML = `<div><h3>${head}</h3><div>${r.note ? r.note + ' · ' : ''}${s[me] != null ? `${NAME[me]} ${s[me]} – ${s[other]} ${M.bot ? 'Máy' : NAME[other]}` : ''}</div>
        <div class="xn" style="font-size:.85rem;opacity:.85;margin-top:.4rem">${M.bot || r.abort ? 'Luyện tập — không tính điểm' : 'Đang lưu…'}</div>
        <div class="bt">${r.abort ? '' : `<button class="p" data-re>${M.bot ? 'Chơi lại' : 'Phục thù 🔁'}</button>`}<button data-c>Đóng</button></div></div>`;
      st.appendChild(div);
      div.onclick = e => { const b = e.target.closest('button'); if (!b) return; if (b.dataset.c != null) return close();
        if (b.dataset.re != null) { const d = M.d; close(); if (M === null && d.mode === 'bot') return begin({...d, seed: (Math.random() * 2e9) | 0}, true, true);
          pend = {g: d.g, mode: d.mode, bet: d.bet, seed: (Math.random() * 2e9) | 0, key: newKey(d.g)}; ctx.send('inv', pend); show(`<div class="m">Chờ ${oN} nhận lời phục thù…</div><div class="bt"><button data-x>Huỷ</button></div>`);
          box.onclick = e2 => { if (e2.target.closest('[data-x]')) { ctx.send('cancel', {}); pend = null; hide(); } };
          pend.tm = setTimeout(() => { if (pend) { pend = null; hide(); } }, 25000); } };
    }
    function close() { stopInst(); M = null; ov.hidden = true; ov.innerHTML = ''; window.removeEventListener('keydown', keyBlock, true); }

    // ---------- bảng điểm VY–BIN ----------
    async function board() {
      const p = prog(); if (!p) return show(`<h4>🏆 Bảng điểm VY–BIN</h4><div class="s">Cần đăng nhập (2 người) để xem bảng điểm.</div><div class="bt"><button data-x>Đóng</button></div>`), (box.onclick = e => { if (e.target.closest('[data-x]')) hide(); });
      show(`<h4>🏆 Bảng điểm VY–BIN</h4><div class="s">Đang tải…</div>`);
      let b; try { b = await p._rpc('game_arena_board'); } catch (e) { return show(`<h4>🏆 Bảng điểm</h4><div class="s">Lỗi: ${e.message || e}</div><div class="bt"><button data-x>Đóng</button></div>`); }
      const T = b.total || {}, W = b.week || {};
      const rows = (b.games || []).map(g => `<tr><td>${GAME_NAME[g.game] || g.game}</td><td style="color:${COL.vy}">${g.vy}</td><td style="color:${COL.bin}">${g.bin}</td><td>${g.draw}</td></tr>`).join('');
      const rec = (b.recent || []).slice(0, 6).map(r => `<tr><td>${GAME_NAME[r.game] || r.game}${r.mode === 'bet' ? ' ⚔️' + (r.xu || 0) : ''}</td><td colspan="3">${r.winner ? NAME[r.winner] + ' thắng' : 'Hoà'} · ${new Date(r.created_at).toLocaleDateString('vi-VN')}</td></tr>`).join('');
      show(`<h4>🏆 Bảng điểm VY–BIN</h4>
        <div class="big"><div style="color:${COL.vy}">${T.vy | 0}<small>Vy thắng</small></div><div style="opacity:.5">–</div><div style="color:${COL.bin}">${T.bin | 0}<small>Bin thắng</small></div></div>
        <div class="s">Tuần này: Vy ${W.vy | 0} – ${W.bin | 0} Bin · Hoà ${T.draw | 0} · Xu thắng cược: Vy ${T.xu_vy | 0} / Bin ${T.xu_bin | 0}</div>
        ${rows ? `<table><tr><td>Trò</td><td>Vy</td><td>Bin</td><td>Hoà</td></tr>${rows}</table>` : '<div class="s">Chưa có trận nào — ra máy chơi thử đi!</div>'}
        ${rec ? `<table>${rec}</table>` : ''}<div class="bt"><button data-x>Đóng</button></div>`);
      box.onclick = e => { if (e.target.closest('[data-x]')) hide(); };
    }

    // ghim ⭐ trong Phòng Game gọi vào đây (src/game.js): trả true = đã xử lý
    const prev = window.__vySpot;
    window.__vySpot = (id, d) => {
      if (GAMES[id]) { lobby(id); return true; }
      if (id === 'board') { board(); return true; }
      return prev ? prev(id, d) : false;
    };
    window.__arena = {lobby, board, begin: (g, mode = 'bot') => begin({g, mode, bet: 0, seed: 12345, key: null}, true, mode === 'bot'), state: () => M && {g: M.d.g, done: M.done, score: M.lastScore}, close};
  },
};
