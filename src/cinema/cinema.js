// ===== RẠP CHUNG (xem TV cùng nhau) =====
// Luồng: bấm ghim TV → nhân vật tới sofa, ngồi (WATCHING) → WATCHING_IDLE + lấy bắp → camera lướt ra sau lưng sofa (cutscene) → màn rạp mở.
// 1 người là HOST (chọn phim, điều khiển phát, chuyển quyền host); người kia là KHÁCH (xem theo, gợi ý phim, xin quyền).
// Tạm rời: màn rạp thu thành khung nhỏ, phim vẫn chạy theo host, nhân vật đi lại tự do; Vào lại: ngồi lại → cutscene → màn rạp.
// Tắt TV: cất bắp, OFFWATCH, camera về góc mặc định. Không ai xem nữa → TV tắt.
// Đồng bộ qua kênh realtime sẵn có ({k:'cin'}); host là nguồn sự thật: gửi trạng thái khi đổi + nhịp 4s lúc đang phát.
// Chia sẻ tab / file trên máy: truyền hình + tiếng từ máy host bằng WebRTC riêng (dùng chung máy chủ TURN của cuộc gọi).
import {ic, paintIcons} from '../ui/icons.js';
import {parseSource, srcKey, thumbOf, titleOf, KIND, SYNCED} from './sources.js';
import {createPlayer} from './players.js';
import {CONFIG} from '../config.js';

const $ = id => document.getElementById(id);
const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[c]));
const fmt = s => { s = Math.max(0, Math.floor(s || 0)); const h = (s / 3600) | 0, m = ((s % 3600) / 60) | 0, x = s % 60; return (h ? h + ':' + String(m).padStart(2, '0') : m) + ':' + String(x).padStart(2, '0'); };
const NAME = {bin: 'Bin', vy: 'Vy'};
const AV = s => 'assets/ui/avatars/' + s + '.v1.png';
const HKEY = 'vyCineHist';
const lsGet = (k, d) => { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch (e) { return d; } };
const lsSet = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} };

export function mountCinema({api, sess, voice, slot, other, toast, music}) {
  if (!api.hasTV || !api.hasTV()) return null;
  const me = {st: 'off'};                 // off | watch | away
  let peerSt = 'off';
  let S = null;                           // trạng thái rạp: {v, host, src, playing, pos, at, q:[]}
  let player = null, playerKey = '', loadingKey = '', vol = lsGet('vyCineVol', 1), pendingCut = false, musicWas = null, fsOn = false;
  const isHost = () => !!S && S.host === slot;
  const send = o => sess && sess.send({k: 'cin', mp: window.MAPID, ...o});
  const now = () => performance.now();
  const posNow = () => !S ? 0 : S.pos + (S.playing ? (now() - S.at) / 1000 : 0);

  // ---------- DOM ----------
  const root = document.createElement('div'); root.id = 'cine'; root.setAttribute('aria-label', 'Rạp chung');
  root.innerHTML = `
  <div class="cBack"></div>
  <header class="cTop">
    <div class="cTi"><span class="cLogo">${ic('film')}</span><div><b>Rạp chung</b><span class="cNow" id="cnNow">Chưa chọn phim</span></div></div>
    <div class="cWho" id="cnWho"></div>
    <div class="cAct">
      <button class="cb" id="cnHostB" title="Quyền điều khiển">${ic('crown')}<span id="cnHostT">Host</span></button>
      <button class="cb" id="cnFs" title="Toàn màn hình">${ic('expand')}</button>
      <button class="cb" id="cnMin" title="Tạm rời (thu nhỏ, phim vẫn chạy)">${ic('shrink')}<span>Tạm rời</span></button>
      <button class="cb off" id="cnOff" title="Tắt TV">${ic('power')}<span>Tắt TV</span></button>
    </div>
  </header>
  <main class="cStage">
    <div class="cScreen" id="cnScr">
      <div class="cPl" id="cnPl"></div>
      <div class="cEmpty" id="cnEmpty"></div>
      <div class="cTap" id="cnTap" hidden><button class="pb">${ic('play')}<span>Bấm để bật tiếng / phát</span></button></div>
      <div class="cMiniBar"><b id="cnMiniT">Rạp chung</b><span class="sp"></span><button class="cb" id="cnBack" title="Vào xem lại">${ic('expand')}<span>Vào lại</span></button><button class="cb off" id="cnOff2" title="Tắt TV">${ic('power')}</button></div>
    </div>
  </main>
  <footer class="cBar">
    <button class="cb big" id="cnPlay" title="Phát / dừng">${ic('play')}</button>
    <span class="cT" id="cnT">0:00</span><input type="range" id="cnSeek" min="0" max="1000" value="0" step="1" aria-label="Tua"><span class="cT" id="cnD">0:00</span>
    <span class="cVol">${ic('vol')}<input type="range" id="cnVol" min="0" max="1" step="0.05" aria-label="Âm lượng phim"></span>
    <span class="cSync" id="cnSync"></span>
    <button class="pb" id="cnLibB">${ic('list')}<span id="cnLibT">Chọn phim</span></button>
  </footer>
  <aside class="cLib" id="cnLib" aria-label="Chọn phim">
    <div class="ph"><h3 id="cnLibH">Chọn phim</h3><span class="sp"></span><button class="rb" id="cnLibX" title="Đóng">${ic('x')}</button></div>
    <div class="cTabs" id="cnTabs">
      <button data-t="yt" class="on">${ic('youtube')}YouTube</button><button data-t="link">${ic('link')}Dán link</button>
      <button data-t="share">${ic('screen')}Chia sẻ tab</button><button data-t="file">${ic('folder')}File máy</button>
      <button data-t="q">${ic('list')}Hàng chờ <em id="cnQn"></em></button><button data-t="h">${ic('repeat')}Đã xem</button>
    </div>
    <div class="cPane on" data-p="yt"><form class="cRow" id="cnYtF"><input id="cnYtQ" placeholder="Tìm video trên YouTube…" autocomplete="off"><button class="pb" type="submit">${ic('search')}</button></form><div class="cGrid" id="cnYtR"><p class="help">Gõ tên phim, MV, vlog… rồi Enter. Chỉ hiện video cho phép phát nhúng.</p></div></div>
    <div class="cPane" data-p="link">
      <form class="cRow" id="cnLinkF"><input id="cnLinkI" placeholder="Dán link video (YouTube, Vimeo, Twitch, Dailymotion, Facebook, TikTok, .mp4, .m3u8…)" autocomplete="off"><button class="pb" type="submit">Phát</button></form>
      <p class="help" id="cnLinkH">Đồng bộ chuẩn (tua/dừng theo host): YouTube, Vimeo, Twitch (video), file .mp4/.webm, luồng .m3u8. Facebook / TikTok / Dailymotion chỉ nhúng được, mỗi máy tự bấm phát.</p>
      <div class="cSub">Tìm clip trên Google</div>
      <form class="cRow" id="cnGF"><input id="cnGQ" placeholder="Tìm video trên Google…" autocomplete="off"><button class="pl" type="submit">${ic('globe')}Google</button></form>
      <p class="help">Google mở ở tab mới. Thấy clip ưng ý: copy link dán vào ô phía trên. Trang không nhúng được thì mở trang đó rồi dùng <b>Chia sẻ tab</b>.</p>
    </div>
    <div class="cPane" data-p="share">
      <p class="help">Phát <b>bất kỳ trang nào</b> (clip Google, Facebook, web phim…): mở trang đó ở tab khác, bấm nút dưới, chọn đúng tab và nhớ tick <b>"Chia sẻ âm thanh của thẻ"</b>. Người kia xem trực tiếp qua kết nối của cuộc gọi.</p>
      <button class="pb wide" id="cnShare">${ic('screen')}<span>Chọn tab để chia sẻ</span></button>
      <p class="help dim">Netflix, Disney+… chặn quay màn hình nên sẽ ra màn đen. Chất lượng phụ thuộc mạng của host.</p>
    </div>
    <div class="cPane" data-p="file">
      <p class="help">Phát phim có sẵn trên máy bạn cho cả hai cùng xem — truyền trực tiếp, không tải lên đâu cả.</p>
      <button class="pb wide" id="cnFile">${ic('folder')}<span>Chọn file video…</span></button><input type="file" id="cnFileI" accept="video/*,audio/*" hidden>
    </div>
    <div class="cPane" data-p="q"><div class="cList" id="cnQ"></div></div>
    <div class="cPane" data-p="h"><div class="cList" id="cnH"></div></div>
  </aside>
  <div class="cAsk" id="cnAsk" hidden></div>`;
  document.body.appendChild(root); paintIcons(root);
  const el = {scr: $('cnScr'), pl: $('cnPl'), empty: $('cnEmpty'), now: $('cnNow'), who: $('cnWho'), play: $('cnPlay'), seek: $('cnSeek'), t: $('cnT'), d: $('cnD'), vol: $('cnVol'), sync: $('cnSync'),
    lib: $('cnLib'), ask: $('cnAsk'), tap: $('cnTap'), hostB: $('cnHostB'), hostT: $('cnHostT'), libT: $('cnLibT'), libH: $('cnLibH'), miniT: $('cnMiniT')};
  el.vol.value = vol;

  // ---------- trạng thái → giao diện ----------
  const setMode = m => {          // 'off' | 'theater' | 'mini'
    root.classList.toggle('on', m === 'theater'); root.classList.toggle('mini', m === 'mini'); root.classList.toggle('show', m !== 'off');
    document.documentElement.classList.toggle('cineOn', m === 'theater');
    api.theater = m === 'theater'; api.cineLock = m === 'theater';
    if (m !== 'theater') { el.lib.classList.remove('on'); if (document.fullscreenElement === root) document.exitFullscreen().catch(() => {}); }
  };
  function renderWho() {
    const chip = (s, st, host) => `<span class="cP ${st}"><img src="${AV(s)}" alt="" width="40" height="40"><span><b>${NAME[s]}${s === slot ? ' (bạn)' : ''}</b><small>${host ? ic('crown') + 'Host · ' : ''}${st === 'watch' ? 'đang xem' : st === 'away' ? 'tạm rời' : 'chưa vào'}</small></span></span>`;
    el.who.innerHTML = chip(slot, me.st, S && S.host === slot) + (sess ? chip(other, sess.peer ? peerSt : 'off', S && S.host === other) : '');
    el.hostT.textContent = !S ? 'Host' : isHost() ? (peerIn() ? 'Chuyển host' : 'Bạn là host') : 'Xin quyền';
    el.hostB.disabled = !S || (isHost() && !peerIn());
    el.libT.textContent = isHost() ? 'Chọn phim' : 'Gợi ý phim'; el.libH.textContent = isHost() ? 'Chọn phim' : 'Gợi ý phim cho ' + (S ? NAME[S.host] : 'host');
    root.classList.toggle('guest', !!S && !isHost());
  }
  const peerIn = () => !!(sess && sess.peer) && (peerSt === 'watch' || peerSt === 'away');
  function renderNow() {
    const t = S && S.src ? (S.src.title || KIND[S.src.type]) : 'Chưa chọn phim';
    el.now.textContent = t; el.miniT.textContent = t;
    const empty = !S || !S.src; el.empty.hidden = !empty;
    if (empty) {
      el.empty.innerHTML = isHost() || !S
        ? `<div class="ce"><span class="cLogo big">${ic('film')}</span><h2>Hôm nay xem gì nhỉ?</h2><p>Bạn đang là host — chọn một nguồn để bắt đầu.</p>
           <div class="ceB"><button class="pb" data-go="yt">${ic('youtube')}Tìm trên YouTube</button><button class="pl" data-go="link">${ic('link')}Dán link</button><button class="pl" data-go="share">${ic('screen')}Chia sẻ tab</button><button class="pl" data-go="file">${ic('folder')}File trên máy</button></div></div>`
        : `<div class="ce"><span class="cLogo big">${ic('film')}</span><h2>Đang chờ ${NAME[S.host]} chọn phim…</h2><p>Bạn có thể gợi ý một video cho host.</p><div class="ceB"><button class="pb" data-go="yt">${ic('youtube')}Gợi ý video</button></div></div>`;
      el.empty.querySelectorAll('[data-go]').forEach(b => b.onclick = () => openLib(b.dataset.go));
    }
    el.sync.innerHTML = !S || !S.src ? '' : !SYNCED.has(S.src.type) ? `<i class="w">${ic('info')}Chỉ nhúng — mỗi máy tự bấm phát</i>` : isHost() ? (peerIn() ? `<i class="ok">${ic('check')}${NAME[other]} đang xem cùng</i>` : '') : `<i class="ok">${ic('check')}Theo ${NAME[S.host]}</i>`;
    renderQueue();
  }
  const render = () => { renderWho(); renderNow(); api.tv && api.tv(me.st !== 'off' || peerIn()); };

  // ---------- trình phát theo trạng thái ----------
  async function ensurePlayer() {
    const want = me.st !== 'off' && S && S.src ? srcKey(S.src) : '';
    if (want === playerKey && (player || !want)) return;
    if (want === loadingKey) return;
    if (player) { player.destroy(); player = null; } playerKey = ''; el.tap.hidden = true;
    if (!want) return;
    loadingKey = want;
    const src = S.src;
    if (src.type === 'stream' && !isHost()) { rtcWant(); loadingKey = ''; return; }        // hình sẽ tới qua WebRTC
    if (src.type === 'stream' && isHost() && !hostMedia) { loadingKey = ''; return; }
    const isLocalHost = src.type === 'stream' && isHost();
    const p = createPlayer(el.pl, isLocalHost && hostMedia.file ? {type: 'local', url: hostMedia.url} : src,
      {start: posNow(), autoplay: !!S.playing, stream: isLocalHost ? hostMedia.stream : null, muted: isLocalHost && !hostMedia.file,
       on: (ev, a) => onPlayerEv(p, ev, a)});
    player = p; playerKey = want;
    p.setVol(vol);
    try { await p.ready; } catch (e) {}
    loadingKey = '';
    if (isLocalHost && hostMedia.file) { hostMedia.capture(p.el); }
  }
  let lastUserEv = 0;
  function onPlayerEv(p, ev, a) {
    if (p !== player) return;
    if (ev === 'error') { toast(a); return; }
    if (ev === 'needTap') { el.tap.hidden = false; return; }
    if (!S || !player.sync) return;
    if (now() - quietUntil < 0) return;                 // sự kiện do chính mình gọi play/pause/seek khi đồng bộ
    if (isHost()) {
      if (ev === 'play' && !S.playing) hostSet({playing: true, pos: p.time()});
      else if (ev === 'pause' && S.playing) hostSet({playing: false, pos: p.time()});
      else if (ev === 'seeked') hostSet({pos: p.time()});
      else if (ev === 'ended') { const nx = S.q[0]; if (nx) playSrc(nx.src, true); else hostSet({playing: false, pos: p.dur()}); }
    } else if (ev === 'play' || ev === 'pause' || ev === 'seeked') {
      if (now() - lastUserEv > 3000) toast(NAME[S.host] + ' đang điều khiển — bấm "Xin quyền" để tự chọn/tua');
      lastUserEv = now(); setTimeout(correct, 200);
    }
  }
  el.tap.onclick = () => { el.tap.hidden = true; if (player) { if (S && S.playing) player.play(); } };
  let quietUntil = 0;
  const quiet = (ms = 900) => { quietUntil = now() + ms; };
  function correct() {                    // khách: kéo trình phát về đúng trạng thái host; host: đảm bảo trình phát khớp trạng thái mình đặt
    if (!player || !S || !S.src || !player.sync || loadingKey) return;
    const want = posNow(), t = player.time(), pa = player.paused();
    if (S.playing && pa) { quiet(); player.play(); }
    if (!S.playing && !pa) { quiet(); player.pause(); }
    const lim = S.src.type === 'yt' || S.src.type === 'vimeo' || S.src.type === 'twitch' ? 1.5 : 0.8;
    const dur = player.dur();
    if (Math.abs(t - want) > lim && !(dur && want > dur - 1)) { quiet(1500); player.seek(want); }
  }
  setInterval(() => { if (me.st === 'off') return; if (!isHost()) correct(); tickUi(); if (isHost() && S && S.playing && ++beat % 8 === 0) broadcast(); }, 500);
  let beat = 0, seeking = false;
  function tickUi() {
    if (!root.classList.contains('show')) return;
    const p = player, has = !!(p && S && S.src), d = has ? p.dur() : 0, t = has ? (p.sync ? p.time() : posNow()) : 0;
    el.t.textContent = fmt(t); el.d.textContent = d ? fmt(d) : (S && S.src && S.src.type === 'twitch' && S.src.channel ? 'LIVE' : '--:--');
    if (!seeking) el.seek.value = d ? Math.round(t / d * 1000) : 0;
    el.play.innerHTML = ic(S && S.playing ? 'pause' : 'play');
    const ctl = isHost() && has && p.sync; el.play.disabled = !ctl; el.seek.disabled = !ctl || !d;
  }

  // ---------- host: đổi trạng thái + phát cho người kia ----------
  function broadcast() { if (!S || !isHost()) return; send({t: 'st', v: S.v, host: S.host, src: S.src, playing: S.playing, pos: posNow(), q: S.q}); }
  function hostSet(o) {
    if (!S) return;
    if ('pos' in o || 'playing' in o) { const pos = 'pos' in o ? o.pos : posNow(); S.pos = pos; S.at = now(); }
    if ('playing' in o) S.playing = o.playing;
    if ('src' in o) S.src = o.src;
    if ('q' in o) S.q = o.q;
    S.v++; broadcast(); render(); ensurePlayer().then(() => { if (player && player.sync) { quiet(); 'pos' in o && player.seek(S.pos); S.playing ? player.play() : player.pause(); } });
  }
  async function playSrc(src, fromQueue) {
    if (!src) return;
    if (src.type === 'page') { toast('Trang này không nhúng trực tiếp được — mở trang đó rồi dùng "Chia sẻ tab"'); openLib('share'); return; }
    if (!src.title) src.title = await titleOf(src);
    if (!isHost()) { send({t: 'sug', src}); toast('Đã gợi ý cho ' + NAME[S.host] + ': ' + src.title); closeLib(); return; }
    if (S.src && S.src.type === 'stream' && src.type !== 'stream') stopHostMedia();
    const q = (S.q || []).filter(x => srcKey(x.src) !== srcKey(src));
    addHist(src);
    hostSet({src, playing: true, pos: 0, q});
    closeLib();
    musicPause();
  }
  // ---------- thông điệp mạng ----------
  if (sess) sess.on('msg', m => {
    if (m.k !== 'cin') return;
    if (m.mp && m.mp !== window.MAPID) { if (peerSt !== 'off') { peerSt = 'off'; render(); } return; }      // đối phương ở map khác
    switch (m.t) {
      case 'me': {
        const was = peerSt; peerSt = m.st;
        if (peerSt === 'watch' && was === 'off' && me.st === 'off') toast(NAME[other] + ' vừa bật TV — bấm vào TV để xem cùng');
        if (peerSt === 'off' && S && S.host === other && me.st !== 'off') takeHost();          // host rời đi mà mình còn xem → mình làm host
        if (isHost() && (peerSt === 'watch' || peerSt === 'away') && was === 'off') broadcast();
        render(); break;
      }
      case 'hi': send({t: 'me', st: me.st}); if (isHost()) broadcast(); break;
      case 'st': {
        if (me.st === 'off' && !S) { S = null; }
        const mine = isHost();
        if (mine && S && (m.v < S.v || (m.v === S.v && slot === 'bin'))) { broadcast(); break; }        // tranh host cùng lúc: phiên bản mới hơn thắng, hoà thì Bin giữ
        const lat = Math.min(0.4, (sess.rtt || 150) / 2000);
        S = {v: m.v, host: m.host, src: m.src, playing: !!m.playing, pos: (m.pos || 0) + (m.playing ? lat : 0), at: now(), q: m.q || []};
        render(); if (me.st !== 'off') { ensurePlayer().then(correct); if (S.src && S.src.type === 'stream' && !isHost()) rtcWant(); }
        break;
      }
      case 'host': if (m.to === slot && S) { S.host = slot; S.v = Math.max(S.v, m.v || 0) + 1; toast('Bạn đã có quyền điều khiển rạp'); broadcast(); render(); } break;
      case 'ask': if (isHost()) showAsk(); break;
      case 'askNo': toast(NAME[other] + ' chưa nhường quyền điều khiển'); break;
      case 'sug': if (isHost() && m.src) { S.q = [...(S.q || []).filter(x => srcKey(x.src) !== srcKey(m.src)), {src: m.src, by: other}]; S.v++; broadcast(); render(); toast(NAME[other] + ' gợi ý: ' + (m.src.title || 'một video') + ' — xem trong Hàng chờ'); } break;
      case 'ss': rtcMsg(m); break;
    }
  });
  if (sess) sess.on('peer', ({present}) => { if (!present) { peerSt = 'off'; if (S && S.host === other && me.st !== 'off') takeHost(); closeRtc(); render(); } else send({t: 'hi'}); });
  function takeHost() { if (!S) return; S.host = slot; S.pos = posNow(); S.at = now(); S.v++; if (S.src && S.src.type === 'stream') { S.src = null; S.playing = false; } broadcast(); render(); ensurePlayer(); }
  if (sess) send({t: 'hi'});

  // ---------- vào / tạm rời / vào lại / tắt ----------
  function enter() {
    if (me.st === 'watch') { if (!root.classList.contains('on')) cut(); return; }
    const L = api.local; if (!L) return;
    if (!S || (S.host !== slot && !peerIn())) S = {v: 1, host: slot, src: (S && S.src) || null, playing: false, pos: 0, at: now(), q: (S && S.q) || []};
    me.st = 'watch'; send({t: 'me', st: 'watch'}); send({t: 'hi'});
    render(); musicPause();
    if (L.P.mode === 'watch') { cut(); return; }
    pendingCut = true;
    if (!L.cmdWatch()) { pendingCut = false; me.st = 'off'; send({t: 'me', st: 'off'}); render(); }
  }
  api.onWatchSeated = () => { if (pendingCut && me.st === 'watch') { pendingCut = false; cut(); } };
  api.onWatchLeft = () => { if (me.st === 'watch') away(); };
  function cut() {
    api.cineLock = true; document.documentElement.classList.add('cineCut');
    api.cineCam('in', () => { document.documentElement.classList.remove('cineCut'); if (me.st !== 'watch') return; setMode('theater'); if (S && isHost() && !S.src) setTimeout(() => openLib('yt'), 250); ensurePlayer().then(correct); });
  }
  function away() {
    if (me.st === 'off') return;
    me.st = 'away'; send({t: 'me', st: 'away'}); pendingCut = false;
    setMode('mini');
    api.cineCam('out'); render();
  }
  function back() { me.st = 'off'; enter(); }
  function off() {
    if (me.st === 'off') return;
    if (isHost() && peerIn()) { S.host = other; S.v++; send({t: 'host', to: other, v: S.v}); broadcast(); }
    if (isHost()) stopHostMedia();
    me.st = 'off'; pendingCut = false; send({t: 'me', st: 'off'});
    if (player) { player.destroy(); player = null; playerKey = ''; } closeRtc();
    if (!peerIn()) S = null;
    setMode('off'); api.cineCam('out');
    const L = api.local; if (L && (L.P.mode === 'watch' || (L.busy && L.busy.kind === 'climbWatch') || L.plan.some(x => x.t === 'climbWatch'))) L.cmdUnwatch();
    render(); musicResume();
  }
  addEventListener('pagehide', () => { if (me.st !== 'off') { if (isHost() && peerIn()) send({t: 'host', to: other, v: (S.v || 0) + 1}); send({t: 'me', st: 'off'}); } });
  $('cnMin').onclick = away; $('cnOff').onclick = off; $('cnOff2').onclick = off; $('cnBack').onclick = back;
  $('cnFs').onclick = () => { if (document.fullscreenElement) document.exitFullscreen().catch(() => {}); else root.requestFullscreen && root.requestFullscreen().catch(() => toast('Trình duyệt không cho toàn màn hình')); };
  document.addEventListener('fullscreenchange', () => { fsOn = document.fullscreenElement === root; $('cnFs').innerHTML = ic(fsOn ? 'shrink' : 'expand'); });
  addEventListener('keydown', e => {
    if (!root.classList.contains('on') || /INPUT|TEXTAREA|SELECT/.test((e.target && e.target.tagName) || '')) return;
    if (e.code === 'Escape') { if (el.lib.classList.contains('on')) closeLib(); else away(); e.preventDefault(); }
    else if (e.code === 'Space' && isHost()) { el.play.click(); e.preventDefault(); }
  });

  // ---------- điều khiển (host) ----------
  el.play.onclick = () => { if (!isHost() || !player) return; hostSet({playing: !S.playing, pos: player.sync ? player.time() : posNow()}); if (S.playing) musicPause(); };
  el.seek.oninput = () => { seeking = true; const d = player ? player.dur() : 0; el.t.textContent = fmt(d * el.seek.value / 1000); };
  el.seek.onchange = () => { seeking = false; const d = player ? player.dur() : 0; if (isHost() && d) hostSet({pos: d * el.seek.value / 1000}); };
  el.vol.oninput = () => { vol = +el.vol.value; lsSet('vyCineVol', vol); player && player.setVol(vol); };
  el.hostB.onclick = () => {
    if (!S) return;
    if (isHost()) { if (!peerIn()) return; if (!confirm('Chuyển quyền điều khiển rạp cho ' + NAME[other] + '?')) return; S.host = other; S.v++; send({t: 'host', to: other, v: S.v}); broadcast(); render(); toast('Đã chuyển host cho ' + NAME[other]); }
    else { send({t: 'ask'}); toast('Đã xin ' + NAME[S.host] + ' quyền điều khiển'); }
  };
  function showAsk() {
    el.ask.hidden = false;
    el.ask.innerHTML = `<img src="${AV(other)}" alt="" width="48" height="48"><div><b>${NAME[other]} xin quyền điều khiển</b><small>Nhường thì ${NAME[other]} sẽ chọn phim, dừng/tua cho cả hai.</small></div><button class="pb" id="cnAskY">Nhường</button><button class="pl" id="cnAskN">Không</button>`;
    $('cnAskY').onclick = () => { el.ask.hidden = true; if (!isHost()) return; S.host = other; S.v++; send({t: 'host', to: other, v: S.v}); broadcast(); render(); };
    $('cnAskN').onclick = () => { el.ask.hidden = true; send({t: 'askNo'}); };
    clearTimeout(showAsk._t); showAsk._t = setTimeout(() => { el.ask.hidden = true; }, 20000);
  }

  // ---------- thư viện: YouTube / link / Google / chia sẻ tab / file / hàng chờ / đã xem ----------
  function openLib(tab) { if (!root.classList.contains('on')) return; el.lib.classList.add('on'); if (tab) selTab(tab); if (tab === 'yt' || !tab) setTimeout(() => $('cnYtQ').focus(), 60); }
  const closeLib = () => el.lib.classList.remove('on');
  $('cnLibB').onclick = () => el.lib.classList.contains('on') ? closeLib() : openLib();
  $('cnLibX').onclick = closeLib;
  function selTab(t) { $('cnTabs').querySelectorAll('button').forEach(b => b.classList.toggle('on', b.dataset.t === t)); el.lib.querySelectorAll('.cPane').forEach(p => p.classList.toggle('on', p.dataset.p === t)); }
  $('cnTabs').onclick = e => { const b = e.target.closest('button'); if (b) selTab(b.dataset.t); };
  const card = (src, extra = '') => `<button class="cCard" data-k="${esc(srcKey(src))}"><span class="th">${thumbOf(src) ? `<img src="${esc(thumbOf(src))}" alt="" loading="lazy">` : ic('film')}${src.d ? `<em>${esc(src.d)}</em>` : ''}</span><span class="tt"><b>${esc(src.title || KIND[src.type])}</b><small>${esc(src.c || KIND[src.type])}${extra}</small></span></button>`;
  const ytCache = new Map();
  $('cnYtF').onsubmit = async e => {
    e.preventDefault(); const q = $('cnYtQ').value.trim(); if (q.length < 2) return;
    const direct = parseSource(q); if (direct && direct.type !== 'page' && /[./]/.test(q)) { playSrc(direct); return; }
    const box = $('cnYtR'); box.innerHTML = '<p class="help">Đang tìm…</p>';
    try {
      let items = ytCache.get(q);
      if (!items) {
        if (!sess) throw new Error('Cần đang ở trong phòng (đã kết nối) để tìm. Vẫn dán link được.');
        const r = await fetch('/api/yt-search?room=' + encodeURIComponent(sess.room) + '&q=' + encodeURIComponent(q), {headers: {Authorization: 'Bearer ' + await sess.token()}});
        if (r.status === 429) throw new Error('Tìm hơi nhanh, đợi vài giây nhé');
        if (!r.ok) throw new Error('YouTube chưa trả kết quả — thử lại, hoặc dán link');
        items = ((await r.json()).items || []).map(x => ({type: 'yt', id: x.id, title: x.t, c: x.c, d: x.d})); ytCache.set(q, items);
      }
      box.innerHTML = items.length ? items.map(s => card(s)).join('') : '<p class="help">Không thấy video nào.</p>';
      box.querySelectorAll('.cCard').forEach((b, i) => b.onclick = () => playSrc({...items[i]}));
    } catch (err) { box.innerHTML = '<p class="help">' + esc(err.message) + '</p>'; }
  };
  $('cnLinkF').onsubmit = e => { e.preventDefault(); const s = parseSource($('cnLinkI').value); if (!s) { toast('Link chưa đúng'); return; } $('cnLinkI').value = ''; playSrc(s); };
  $('cnLinkI').oninput = () => { const s = parseSource($('cnLinkI').value); $('cnLinkH').innerHTML = !s ? 'Dán link video (YouTube, Vimeo, Twitch, Dailymotion, Facebook, TikTok, .mp4, .m3u8…)' : s.type === 'page' ? '⚠️ Trang này không nhúng trực tiếp được — mở trang đó rồi dùng <b>Chia sẻ tab</b>.' : 'Nhận ra: <b>' + esc(KIND[s.type] + (s.label ? ' · ' + s.label : '')) + '</b>' + (SYNCED.has(s.type) ? ' — đồng bộ chuẩn.' : ' — chỉ nhúng, mỗi máy tự bấm phát.'); };
  $('cnGF').onsubmit = e => { e.preventDefault(); const q = $('cnGQ').value.trim(); window.open('https://www.google.com/search?tbm=vid&q=' + encodeURIComponent(q || 'phim hay'), '_blank', 'noopener'); };
  $('cnShare').onclick = () => startShare();
  $('cnFile').onclick = () => { if (!isHost()) { toast('Chỉ host phát được file — bấm "Xin quyền"'); return; } $('cnFileI').click(); };
  $('cnFileI').onchange = () => { const f = $('cnFileI').files[0]; $('cnFileI').value = ''; if (f) startFile(f); };
  function renderQueue() {
    const q = (S && S.q) || []; $('cnQn').textContent = q.length ? q.length : '';
    $('cnQ').innerHTML = q.length ? q.map((x, i) => card(x.src, x.by ? ' · ' + NAME[x.by] + ' gợi ý' : '') ).join('') : '<p class="help">Chưa có gì. Khách gợi ý video sẽ hiện ở đây; video trong hàng chờ tự phát khi phim hiện tại hết.</p>';
    $('cnQ').querySelectorAll('.cCard').forEach((b, i) => b.onclick = () => { if (isHost()) playSrc(q[i].src); });
    const h = lsGet(HKEY, []);
    $('cnH').innerHTML = h.length ? h.map(x => card(x)).join('') : '<p class="help">Những video đã xem sẽ nằm ở đây.</p>';
    $('cnH').querySelectorAll('.cCard').forEach((b, i) => b.onclick = () => playSrc({...h[i]}));
  }
  function addHist(src) { if (src.type === 'stream') return; const h = lsGet(HKEY, []).filter(x => srcKey(x) !== srcKey(src)); h.unshift({...src}); lsSet(HKEY, h.slice(0, 30)); }

  // ---------- nhạc nền: tạm dừng khi vào rạp, mở lại khi tắt TV ----------
  function musicPause() { if (!music || musicWas) return; try { const ytOn = music.ytm && music.ytm.playing, lofiOn = music.Lofi && music.Lofi.on; if (ytOn || lofiOn) { musicWas = {yt: ytOn, lofi: lofiOn}; if (ytOn) music.ytm.pause(); if (lofiOn) music.Lofi.toggle(); } } catch (e) {} }
  function musicResume() { const w = musicWas; musicWas = null; if (!w || !music) return; try { if (w.yt) music.ytm.toggle(); if (w.lofi && !music.Lofi.on) music.Lofi.toggle(); } catch (e) {} }

  // ---------- chia sẻ tab / file trên máy (WebRTC: host → khách) ----------
  let hostMedia = null, pc = null, rpc = null;
  async function startShare() {
    if (!isHost()) { toast('Chỉ host chia sẻ được — bấm "Xin quyền"'); return; }
    if (!(navigator.mediaDevices && navigator.mediaDevices.getDisplayMedia)) { toast('Trình duyệt này không hỗ trợ chia sẻ màn hình (dùng Chrome / Edge trên máy tính)'); return; }
    let st; try { st = await navigator.mediaDevices.getDisplayMedia({video: {frameRate: {ideal: 30, max: 30}}, audio: {echoCancellation: false, noiseSuppression: false, autoGainControl: false}, preferCurrentTab: false, selfBrowserSurface: 'exclude', surfaceSwitching: 'include', systemAudio: 'include'}); }
    catch (e) { if (e && e.name !== 'NotAllowedError') toast('Không chia sẻ được: ' + (e.message || e)); return; }
    if (!st.getAudioTracks().length) toast('Không có tiếng: lần sau nhớ tick "Chia sẻ âm thanh của thẻ"');
    stopHostMedia();
    hostMedia = {stream: st, file: false};
    st.getVideoTracks()[0].addEventListener('ended', () => { if (hostMedia && hostMedia.stream === st) { stopHostMedia(); if (isHost()) hostSet({src: null, playing: false, pos: 0}); } });
    try { st.getVideoTracks()[0].contentHint = 'motion'; } catch (e) {}
    playSrc({type: 'stream', sid: Date.now().toString(36), title: 'Chia sẻ tab của ' + NAME[slot]});
    rtcOffer();
  }
  function startFile(f) {
    stopHostMedia();
    const url = URL.createObjectURL(f);
    hostMedia = {file: true, url, stream: null, capture: v => {
      try { const st = v.captureStream ? v.captureStream() : v.mozCaptureStream ? v.mozCaptureStream() : null; if (!st) { toast('Trình duyệt không truyền được file (dùng Chrome / Edge)'); return; } hostMedia.stream = st; rtcOffer(); } catch (e) { toast('Không truyền được file: ' + e.message); }
    }};
    playSrc({type: 'stream', sid: Date.now().toString(36), title: f.name.replace(/\.[^.]+$/, '') + ' (file của ' + NAME[slot] + ')'});
  }
  function stopHostMedia() {
    if (!hostMedia) return; const h = hostMedia; hostMedia = null;
    try { h.stream && h.stream.getTracks().forEach(t => t.stop()); } catch (e) {} if (h.url) setTimeout(() => URL.revokeObjectURL(h.url), 3000);
    closeRtc();
  }
  const ice = async () => { try { if (voice && voice._loadIce) await voice._loadIce(); } catch (e) {} return (voice && voice.iceServers) || CONFIG.ice; };
  function closeRtc() { try { pc && pc.close(); } catch (e) {} try { rpc && rpc.close(); } catch (e) {} pc = rpc = null; }
  async function rtcOffer() {             // host: dựng kết nối mới mỗi lần khách cần (vào lại, đổi nguồn)
    if (!isHost() || !hostMedia || !hostMedia.stream || !peerIn()) return;
    try { pc && pc.close(); } catch (e) {}
    const c = pc = new RTCPeerConnection({iceServers: await ice()});
    hostMedia.stream.getTracks().forEach(t => c.addTrack(t, hostMedia.stream));
    c.onicecandidate = e => { if (e.candidate && c === pc) send({t: 'ss', op: 'ice', from: 'h', c: e.candidate.toJSON()}); };
    try { const vs = c.getSenders().find(s => s.track && s.track.kind === 'video'); if (vs) { const p = vs.getParameters(); p.encodings = p.encodings && p.encodings.length ? p.encodings : [{}]; p.encodings[0].maxBitrate = 2500000; vs.setParameters(p).catch(() => {}); } } catch (e) {}
    await c.setLocalDescription(await c.createOffer());
    send({t: 'ss', op: 'offer', sdp: c.localDescription.sdp});
  }
  let wantT = 0;
  function rtcWant() { if (isHost() || me.st === 'off' || (rpc && rpc.connectionState === 'connected')) return; if (now() - wantT < 2500) return; wantT = now(); send({t: 'ss', op: 'want'}); }
  async function rtcMsg(m) {
    if (m.op === 'want' && isHost()) rtcOffer();
    else if (m.op === 'offer' && !isHost() && me.st !== 'off') {
      try { rpc && rpc.close(); } catch (e) {}
      const c = rpc = new RTCPeerConnection({iceServers: await ice()}), ms = new MediaStream();
      let made = false;
      c.ontrack = e => { ms.addTrack(e.track); if (c !== rpc || made) return; made = true; if (player) player.destroy(); const p = player = createPlayer(el.pl, {type: 'stream'}, {stream: ms, autoplay: true, on: (ev, a) => onPlayerEv(p, ev, a)}); playerKey = srcKey(S && S.src); p.setVol(vol); };
      c.onicecandidate = e => { if (e.candidate && c === rpc) send({t: 'ss', op: 'ice', from: 'g', c: e.candidate.toJSON()}); };
      await c.setRemoteDescription({type: 'offer', sdp: m.sdp}); await c.setLocalDescription(await c.createAnswer());
      send({t: 'ss', op: 'answer', sdp: c.localDescription.sdp});
    } else if (m.op === 'answer' && isHost() && pc) { await pc.setRemoteDescription({type: 'answer', sdp: m.sdp}).catch(() => {}); }
    else if (m.op === 'ice') { const c = m.from === 'h' ? rpc : pc; if (c) c.addIceCandidate(m.c).catch(() => {}); }
  }

  // ---------- ghim TV trong cảnh ----------
  render();
  return {
    fromPin() { if (me.st === 'off') enter(); else if (me.st === 'away') back(); else if (!root.classList.contains('on')) cut(); },
    pinState: () => me.st === 'watch' ? {on: true, label: 'Đang xem'} : me.st === 'away' ? {on: true, label: 'Vào lại rạp'} : peerIn() ? {on: true, label: 'Xem cùng ' + NAME[other]} : null,
    get state() { return {me: me.st, peer: peerSt, S}; }, off, away,
  };
}
