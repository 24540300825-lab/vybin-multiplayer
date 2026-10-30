// ===== Nhạc YouTube + thư viện playlist =====
// Chỉ PHÁT qua trình nhúng chính thức của YouTube (IFrame Player API) — không tải file về (trái điều khoản YouTube).
// Thư viện lưu trong trình duyệt của từng người (localStorage). Không cần tài khoản/khoá API/trả phí.
const KEY = 'vyMusicLib', STKEY = 'vyMusicState';   // STKEY: bài + giây đang nghe → đổi map / F5 vẫn nghe tiếp đúng chỗ
const uid = () => Math.random().toString(36).slice(2, 8);

export function parseYouTube(text) {
  const s = String(text || '').trim();
  if (!s) return null;
  if (/^[\w-]{11}$/.test(s)) return {v: s};
  let u; try { u = new URL(/^https?:\/\//i.test(s) ? s : 'https://' + s); } catch (e) { return null; }
  const h = u.hostname.replace(/^www\.|^m\.|^music\./, '');
  let v = null; const list = u.searchParams.get('list');
  if (h === 'youtu.be') v = u.pathname.slice(1).split('/')[0];
  else if (h === 'youtube.com' || h === 'youtube-nocookie.com') {
    if (u.pathname === '/watch') v = u.searchParams.get('v');
    else { const m = u.pathname.match(/^\/(shorts|embed|live|v)\/([\w-]{11})/); if (m) v = m[2]; }
  } else return null;
  if (v && !/^[\w-]{11}$/.test(v)) v = null;
  if (!v && !list) return null;
  return {v, list: list && /^[\w-]{10,}$/.test(list) && !/^RD/.test(list) ? list : null};   // mix tự động (RD…) không nhúng được
}

export function createYTMusic({toast = () => {}, onChange = () => {}, auth = null} = {}) {
  let lib = {pls: [{id: 'p1', name: 'Của mình', items: []}], pl: 0, i: -1, shuffle: false, rep: true};
  try { const x = JSON.parse(localStorage.getItem(KEY) || 'null'); if (x && Array.isArray(x.pls) && x.pls.length) lib = Object.assign(lib, x); } catch (e) {}
  lib.pl = Math.min(Math.max(0, lib.pl | 0), lib.pls.length - 1);
  const save = () => { try { localStorage.setItem(KEY, JSON.stringify(lib)); } catch (e) {} };
  let player = null, apiP = null, ready = false, host = null, playing = false, vol = 0.5, wantPlay = null, skips = 0, title = '';
  const cur = () => lib.pls[lib.pl], item = () => cur().items[lib.i], sc = new Map();

  const loadApi = () => apiP || (apiP = new Promise((res, rej) => {
    if (window.YT && window.YT.Player) return res();
    const prev = window.onYouTubeIframeAPIReady;
    window.onYouTubeIframeAPIReady = () => { try { prev && prev(); } catch (e) {} res(); };
    const s = document.createElement('script'); s.src = 'https://www.youtube.com/iframe_api';
    s.onerror = () => { apiP = null; rej(new Error('Không tải được YouTube (mạng yếu hoặc bị chặn bởi tiện ích chặn quảng cáo)')); };
    document.head.appendChild(s);
    setTimeout(() => { if (!(window.YT && window.YT.Player)) { apiP = null; rej(new Error('YouTube phản hồi quá lâu')); } }, 15000);
  }));

  async function ensure() {
    if (player && ready) return player;
    await loadApi();
    if (!player) {
      const d = document.createElement('div'); host.innerHTML = ''; host.appendChild(d);
      await new Promise(res => {
        player = new window.YT.Player(d, {width: '100%', height: '100%',
          playerVars: {playsinline: 1, rel: 0, modestbranding: 1, origin: location.origin},
          events: {
            onReady: () => { ready = true; player.setVolume(Math.round(vol * 100)); res(); },
            onStateChange: e => {
              const S = window.YT.PlayerState;
              playing = e.data === S.PLAYING || e.data === S.BUFFERING;
              if (e.data === S.PLAYING) { skips = 0; const d = player.getVideoData && player.getVideoData(); if (d && d.title) { title = d.title; const it = item(); if (it && (!it.t || it.t.startsWith('YouTube ')) && d.video_id === it.v) { it.t = d.title; save(); } } }
              if (e.data === S.ENDED) next(true);
              snap(); onChange();
            },
            onError: code => {
              const it = item(); const why = code === 101 || code === 150 ? 'chủ video không cho phát nhúng' : code === 100 ? 'video đã bị xoá/riêng tư' : 'lỗi phát';
              toast('Bỏ qua "' + ((it && it.t) || 'video') + '": ' + why);
              if (++skips < cur().items.length) setTimeout(() => next(true), 600); else { playing = false; onChange(); }
            }
          }});
      });
    }
    return player;
  }

  async function playAt(i) {
    const c = cur(); if (!c.items.length) { toast('Playlist đang trống — tìm nhạc rồi bấm + để thêm'); return false; }
    lib.i = (i + c.items.length) % c.items.length; save();
    try { await ensure(); } catch (e) { toast(e.message); return false; }
    disarm(); try { player.unMute(); } catch (e) {}
    player.loadVideoById(item().v); title = item().t || ''; snap(); onChange(); return true;
  }

  // ---- nhớ vị trí đang nghe (đổi map / F5 là tải lại trang → phải nghe tiếp đúng chỗ, không phát lại từ đầu) ----
  let muted = false, armed = null;
  function snap() {
    try {
      const it = item(); if (!it || !player || !ready || !player.getCurrentTime) return;
      const t = player.getCurrentTime(); if (!(t >= 0)) return;
      localStorage.setItem(STKEY, JSON.stringify({pl: lib.pl, i: lib.i, v: it.v, t: Math.round(t * 10) / 10, p: playing ? 1 : 0, ts: Date.now()}));
    } catch (e) {}
  }
  function disarm() { if (armed) { for (const ev of ['pointerdown', 'keydown', 'touchstart']) removeEventListener(ev, armed, true); armed = null; } }
  // trình duyệt chặn tự phát tiếng khi chưa bấm gì: chạy tiếp ở chế độ tắt tiếng (để vị trí vẫn trôi đúng), bấm/nhấn phím lần đầu là bật tiếng ngay
  function armResume(wasPlaying) {
    disarm(); if (!wasPlaying) return;
    const un = () => { disarm(); try { if (muted) { player.unMute(); player.setVolume(Math.round(vol * 100)); muted = false; } if (!playing) player.playVideo(); } catch (e) {} };
    armed = un; for (const ev of ['pointerdown', 'keydown', 'touchstart']) addEventListener(ev, un, true);
    setTimeout(() => {
      if (playing || !armed) return;
      try { player.mute(); muted = true; player.playVideo(); toast('Nhạc đang chạy tiếp — bấm vào đâu đó để bật tiếng'); } catch (e) {}
    }, 1600);
  }
  async function restore() {
    let s = null; try { s = JSON.parse(localStorage.getItem(STKEY) || 'null'); } catch (e) {}
    if (!s || !s.v) return false;
    const c = lib.pls[s.pl]; if (!c || !c.items[s.i] || c.items[s.i].v !== s.v) return false;
    lib.pl = s.pl; lib.i = s.i;
    try { await ensure(); } catch (e) { return false; }
    const gap = s.p ? Math.max(0, Math.min(180, (Date.now() - s.ts) / 1000)) : 0;      // bù thời gian trang tải lại để nghe liền mạch
    const start = Math.max(0, (s.t || 0) + gap); title = item().t || '';
    if (s.p) { player.loadVideoById({videoId: s.v, startSeconds: start}); armResume(true); } else player.cueVideoById({videoId: s.v, startSeconds: start});
    onChange(); return true;
  }
  setInterval(() => { if (playing) snap(); }, 2000);
  addEventListener('pagehide', snap); addEventListener('beforeunload', snap);
  document.addEventListener('visibilitychange', () => { if (document.hidden) snap(); });
  function next(auto) {
    const n = cur().items.length; if (!n) return;
    if (auto && !lib.rep && lib.i >= n - 1 && !lib.shuffle) { playing = false; onChange(); return; }
    const i = lib.shuffle && n > 1 ? (() => { let r; do r = (Math.random() * n) | 0; while (r === lib.i); return r; })() : lib.i + 1;
    playAt(i);
  }
  const prev = () => playAt(lib.i <= 0 ? cur().items.length - 1 : lib.i - 1);

  // lấy tiêu đề video (oEmbed của YouTube); lỗi thì để tên tạm, khi phát sẽ tự cập nhật
  async function fetchTitle(v) {
    try {
      const r = await fetch('https://www.youtube.com/oembed?format=json&url=' + encodeURIComponent('https://www.youtube.com/watch?v=' + v));
      if (!r.ok) return null; const j = await r.json(); return j.title || null;
    } catch (e) { return null; }
  }
  async function fillTitles(pl) {
    const todo = pl.items.filter(x => !x.t || x.t.startsWith('YouTube '));
    let k = 0; const run = async () => { while (k < todo.length) { const it = todo[k++]; const t = await fetchTitle(it.v); if (t) { it.t = t; } } };
    await Promise.all([run(), run(), run()]); save(); onChange();
  }

  async function importList(listId) {
    await loadApi();
    return new Promise(res => {
      const box = document.createElement('div'); box.style.cssText = 'position:fixed;left:-9999px;top:0;width:200px;height:200px'; document.body.appendChild(box);
      const d = document.createElement('div'); box.appendChild(d); let done = false, t0 = Date.now(), p;
      const fin = ids => { if (done) return; done = true; try { p.destroy(); } catch (e) {} box.remove(); res(ids || []); };
      p = new window.YT.Player(d, {width: 200, height: 200, playerVars: {listType: 'playlist', list: listId, playsinline: 1},
        events: {
          onReady: () => { const poll = setInterval(() => { let ids = []; try { ids = p.getPlaylist() || []; } catch (e) {} if (ids.length || Date.now() - t0 > 9000) { clearInterval(poll); fin(ids); } }, 400); },
          onError: () => fin([])
        }});
      setTimeout(() => fin([]), 12000);
    });
  }

  async function add(text) {
    const q = parseYouTube(text);
    if (!q) { toast('Link không đúng — dán link video hoặc playlist YouTube'); return 0; }
    const pl = cur(); const have = new Set(pl.items.map(x => x.v)); let added = 0;
    if (q.list) {
      toast('Đang đọc playlist…');
      let ids = []; try { ids = await importList(q.list); } catch (e) { toast(e.message); return 0; }
      if (!ids.length) { toast('Không đọc được playlist (đang để riêng tư hoặc mạng chậm). Thử dán từng video.'); if (!q.v) return 0; ids = [q.v]; }
      ids.forEach(v => { if (!have.has(v)) { have.add(v); pl.items.push({v, t: 'YouTube ' + v}); added++; } });
    } else if (!have.has(q.v)) { pl.items.push({v: q.v, t: 'YouTube ' + q.v}); added = 1; }
    else toast('Video này đã có trong playlist');
    save(); onChange(); if (added) fillTitles(pl);
    return added;
  }

  return {
    mount(el) { host = el; },
    get lib() { return lib; }, get playing() { return playing; }, get title() { return title || (item() && item().t) || ''; },
    get curItem() { return item(); }, get ready() { return ready; },
    add, playAt, next: () => next(false), prev, restore,
    has: v => cur().items.some(x => x.v === v),
    // thêm 1 bài từ kết quả tìm kiếm; trả về vị trí trong playlist (có sẵn thì trả vị trí cũ)
    addItem(it) {
      const pl = cur(); let i = pl.items.findIndex(x => x.v === it.id);
      if (i < 0) { pl.items.push({v: it.id, t: String(it.t || 'YouTube ' + it.id).slice(0, 140), c: it.c ? String(it.c).slice(0, 60) : undefined, d: it.d || undefined}); i = pl.items.length - 1; save(); onChange(); }
      return i;
    },
    // tìm nhạc: hỏi máy chủ của game (/api/yt-search), chỉ thành viên phòng mới dùng được
    async search(q) {
      q = String(q || '').trim(); if (q.length < 2) return [];
      if (sc.has(q.toLowerCase())) return sc.get(q.toLowerCase());
      const a = auth ? await auth() : null;
      if (!a || !a.token) throw new Error('Cần đang ở trong phòng (đã kết nối) để tìm nhạc');
      let r; try { r = await fetch('/api/yt-search?room=' + encodeURIComponent(a.room) + '&q=' + encodeURIComponent(q), {headers: {Authorization: 'Bearer ' + a.token}}); }
      catch (e) { throw new Error('Mất mạng — không tìm được'); }
      if (r.status === 429) throw new Error('Tìm hơi nhanh, đợi vài giây rồi thử lại');
      if (r.status === 401 || r.status === 403) throw new Error('Phiên đăng nhập hết hạn — tải lại trang rồi thử lại');
      if (!r.ok) throw new Error('YouTube chưa trả kết quả — thử lại sau ít phút, hoặc dán link trực tiếp');
      const j = await r.json().catch(() => null); const items = (j && j.items) || [];
      sc.set(q.toLowerCase(), items); if (sc.size > 40) sc.delete(sc.keys().next().value);
      return items;
    },
    async toggle() {
      if (!cur().items.length) { toast('Playlist đang trống — dán link YouTube để thêm'); return false; }
      if (!player || !ready || lib.i < 0) return playAt(Math.max(0, lib.i));
      if (playing) player.pauseVideo(); else { disarm(); if (muted) { try { player.unMute(); player.setVolume(Math.round(vol * 100)); } catch (e) {} muted = false; } player.playVideo(); }
      return !playing;
    },
    pause() { try { player && ready && player.pauseVideo(); } catch (e) {} },
    vol(v) { vol = v; try { player && ready && player.setVolume(Math.round(v * 100)); } catch (e) {} },
    remove(i) { const c = cur(); const wasCur = i === lib.i; c.items.splice(i, 1); if (i < lib.i) lib.i--; else if (wasCur) { lib.i = Math.min(lib.i, c.items.length - 1); if (!c.items.length) { try { player && player.stopVideo(); } catch (e) {} lib.i = -1; playing = false; } else playAt(lib.i); } save(); onChange(); },
    selectPl(n) { lib.pl = Math.max(0, Math.min(n, lib.pls.length - 1)); lib.i = -1; save(); onChange(); },
    newPl(name) { lib.pls.push({id: uid(), name: (name || '').trim().slice(0, 40) || 'Playlist ' + (lib.pls.length + 1), items: []}); lib.pl = lib.pls.length - 1; lib.i = -1; save(); onChange(); },
    renamePl(name) { const n = (name || '').trim().slice(0, 40); if (n) { cur().name = n; save(); onChange(); } },
    deletePl() { if (lib.pls.length <= 1) { cur().items = []; } else { lib.pls.splice(lib.pl, 1); lib.pl = Math.max(0, lib.pl - 1); } lib.i = -1; try { player && ready && player.stopVideo(); } catch (e) {} playing = false; save(); onChange(); },
    setShuffle(v) { lib.shuffle = !!v; save(); onChange(); }, setRep(v) { lib.rep = !!v; save(); onChange(); },
    exportJSON: () => JSON.stringify({vy: 1, pls: lib.pls}, null, 1),
    importJSON(txt) { try { const x = JSON.parse(txt); if (!x || !Array.isArray(x.pls)) throw 0; x.pls.forEach(p => { if (p && Array.isArray(p.items)) lib.pls.push({id: uid(), name: String(p.name || 'Nhập').slice(0, 40), items: p.items.filter(i => i && /^[\w-]{11}$/.test(i.v)).map(i => ({v: i.v, t: String(i.t || 'YouTube ' + i.v).slice(0, 120)}))}); }); save(); onChange(); return true; } catch (e) { return false; } }
  };
}
