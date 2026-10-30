// ===== Nhạc YouTube + thư viện playlist =====
// Chỉ PHÁT qua trình nhúng chính thức của YouTube (IFrame Player API) — không tải file về (trái điều khoản YouTube).
// Thư viện lưu trong trình duyệt của từng người (localStorage). Không cần tài khoản/khoá API/trả phí.
const KEY = 'vyMusicLib';
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

export function createYTMusic({toast = () => {}, onChange = () => {}} = {}) {
  let lib = {pls: [{id: 'p1', name: 'Của mình', items: []}], pl: 0, i: -1, shuffle: false, rep: true};
  try { const x = JSON.parse(localStorage.getItem(KEY) || 'null'); if (x && Array.isArray(x.pls) && x.pls.length) lib = Object.assign(lib, x); } catch (e) {}
  lib.pl = Math.min(Math.max(0, lib.pl | 0), lib.pls.length - 1);
  const save = () => { try { localStorage.setItem(KEY, JSON.stringify(lib)); } catch (e) {} };
  let player = null, apiP = null, ready = false, host = null, playing = false, vol = 0.5, wantPlay = null, skips = 0, title = '';
  const cur = () => lib.pls[lib.pl], item = () => cur().items[lib.i];

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
              onChange();
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
    const c = cur(); if (!c.items.length) { toast('Playlist đang trống — dán link YouTube để thêm'); return false; }
    lib.i = (i + c.items.length) % c.items.length; save();
    try { await ensure(); } catch (e) { toast(e.message); return false; }
    player.loadVideoById(item().v); title = item().t || ''; onChange(); return true;
  }
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
    add, playAt, next: () => next(false), prev,
    async toggle() {
      if (!cur().items.length) { toast('Playlist đang trống — dán link YouTube để thêm'); return false; }
      if (!player || !ready || lib.i < 0) return playAt(Math.max(0, lib.i));
      if (playing) player.pauseVideo(); else player.playVideo();
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
