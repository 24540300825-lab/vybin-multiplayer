// Trình phát cho rạp chung: cùng một giao diện cho mọi nguồn → phần đồng bộ không cần biết đang phát gì.
//   p.ready (Promise) · p.play() · p.pause() · p.seek(s) · p.time() · p.dur() · p.paused() · p.setVol(0..1) · p.sync (điều khiển được?) · p.destroy()
//   on(ev): 'play' | 'pause' | 'seeked' | 'ended' | 'error'(thông điệp) — phát ra khi NGƯỜI XEM bấm trực tiếp trong trình phát
// Chỉ dùng trình nhúng chính thức của từng nền tảng (không tải/ghi video).
const scripts = new Map();
function loadScript(src, ok) {
  if (ok()) return Promise.resolve();
  if (scripts.has(src)) return scripts.get(src);
  const p = new Promise((res, rej) => {
    const s = document.createElement('script'); s.src = src; s.async = true;
    s.onload = () => res(); s.onerror = () => { scripts.delete(src); rej(new Error('Không tải được trình phát (mạng yếu hoặc bị tiện ích chặn quảng cáo chặn)')); };
    document.head.appendChild(s);
  });
  scripts.set(src, p); return p;
}
const ytApi = () => (window.YT && window.YT.Player) ? Promise.resolve() : (scripts.get('yt') || (scripts.set('yt', new Promise((res, rej) => {
  const prev = window.onYouTubeIframeAPIReady; window.onYouTubeIframeAPIReady = () => { try { prev && prev(); } catch (e) {} res(); };
  const s = document.createElement('script'); s.src = 'https://www.youtube.com/iframe_api'; s.onerror = () => { scripts.delete('yt'); rej(new Error('Không tải được YouTube')); }; document.head.appendChild(s);
  setTimeout(() => { if (!(window.YT && window.YT.Player)) { scripts.delete('yt'); rej(new Error('YouTube phản hồi quá lâu')); } }, 15000);
})), scripts.get('yt')));

function base(el, on) {
  const box = document.createElement('div'); box.className = 'cpBox'; el.appendChild(box);
  return {box, emit: (ev, a) => { try { on(ev, a); } catch (e) { console.error('[cinema]', e); } }};
}

export function createPlayer(el, src, {start = 0, autoplay = true, on = () => {}, stream = null, muted = false} = {}) {
  const {box, emit} = base(el, on);
  const T = src.type;
  // ---------- YouTube ----------
  if (T === 'yt') {
    let pl = null, ready = false, dead = false;
    const p = {sync: true, kind: T,
      ready: ytApi().then(() => new Promise((res, rej) => {
        if (dead) return res();
        const d = document.createElement('div'); box.appendChild(d);
        pl = new window.YT.Player(d, {width: '100%', height: '100%', videoId: src.id,
          playerVars: {autoplay: autoplay ? 1 : 0, start: Math.floor(start), playsinline: 1, rel: 0, modestbranding: 1, origin: location.origin, iv_load_policy: 3},
          events: {
            onReady: () => { ready = true; if (start > 0) pl.seekTo(start, true); if (autoplay) pl.playVideo(); res(); },
            onStateChange: e => { const S = window.YT.PlayerState; if (e.data === S.PLAYING) emit('play'); else if (e.data === S.PAUSED) emit('pause'); else if (e.data === S.ENDED) emit('ended'); },
            onError: e => { const c = e.data; emit('error', c === 101 || c === 150 ? 'Chủ video không cho phát nhúng ở trang khác — thử video khác, hoặc mở trên YouTube rồi dùng "Chia sẻ tab"' : c === 100 ? 'Video đã bị xoá hoặc để riêng tư' : 'YouTube báo lỗi phát (' + c + ')'); rej(new Error('yt ' + c)); },
          }});
      })),
      play: () => { try { ready && pl.playVideo(); } catch (e) {} }, pause: () => { try { ready && pl.pauseVideo(); } catch (e) {} },
      seek: t => { try { ready && pl.seekTo(Math.max(0, t), true); } catch (e) {} },
      time: () => { try { return ready ? pl.getCurrentTime() || 0 : 0; } catch (e) { return 0; } },
      dur: () => { try { return ready ? pl.getDuration() || 0 : 0; } catch (e) { return 0; } },
      paused: () => { try { const s = ready ? pl.getPlayerState() : -1; return !(s === 1 || s === 3); } catch (e) { return true; } },
      setVol: v => { try { ready && pl.setVolume(Math.round(v * 100)); } catch (e) {} },
      destroy: () => { dead = true; try { pl && pl.destroy(); } catch (e) {} box.remove(); }};
    return p;
  }
  // ---------- Vimeo ----------
  if (T === 'vimeo') {
    let pl = null, t = start, d = 0, pa = !autoplay, dead = false;
    const p = {sync: true, kind: T,
      ready: loadScript('https://player.vimeo.com/api/player.js', () => !!window.Vimeo).then(async () => {
        if (dead) return;
        pl = new window.Vimeo.Player(box, {id: +src.id, autoplay, responsive: false, width: 640, playsinline: true, dnt: true});
        pl.on('timeupdate', e => { t = e.seconds; d = e.duration; }); pl.on('play', () => { pa = false; emit('play'); }); pl.on('pause', () => { pa = true; emit('pause'); }); pl.on('ended', () => emit('ended'));
        pl.on('error', e => emit('error', 'Vimeo: ' + (e && e.message || 'lỗi phát')));
        await pl.ready(); if (start > 0) await pl.setCurrentTime(start).catch(() => {}); d = await pl.getDuration().catch(() => 0);
      }),
      play: () => pl && pl.play().catch(() => {}), pause: () => pl && pl.pause().catch(() => {}),
      seek: s => { t = s; pl && pl.setCurrentTime(Math.max(0, s)).catch(() => {}); }, time: () => t, dur: () => d, paused: () => pa,
      setVol: v => pl && pl.setVolume(v).catch(() => {}), destroy: () => { dead = true; try { pl && pl.destroy(); } catch (e) {} box.remove(); }};
    return p;
  }
  // ---------- Twitch (video cũ tua được; kênh trực tiếp thì không) ----------
  if (T === 'twitch') {
    let pl = null, ok = false, dead = false;
    const p = {sync: !!src.video, kind: T,
      ready: loadScript('https://player.twitch.tv/js/embed/v1.js', () => !!(window.Twitch && window.Twitch.Player)).then(() => new Promise(res => {
        if (dead) return res();
        const opt = {width: '100%', height: '100%', parent: [location.hostname], autoplay, muted: false};
        if (src.video) { opt.video = 'v' + src.video; opt.time = Math.floor(start) + 's'; } else opt.channel = src.channel;
        const id = 'tw' + Math.random().toString(36).slice(2); box.id = id;
        pl = new window.Twitch.Player(id, opt);
        pl.addEventListener(window.Twitch.Player.READY, () => { ok = true; res(); });
        pl.addEventListener(window.Twitch.Player.PLAY, () => emit('play')); pl.addEventListener(window.Twitch.Player.PAUSE, () => emit('pause')); pl.addEventListener(window.Twitch.Player.ENDED, () => emit('ended'));
        setTimeout(res, 8000);
      })),
      play: () => { try { ok && pl.play(); } catch (e) {} }, pause: () => { try { ok && pl.pause(); } catch (e) {} },
      seek: s => { try { ok && src.video && pl.seek(Math.max(0, s)); } catch (e) {} },
      time: () => { try { return ok ? pl.getCurrentTime() || 0 : 0; } catch (e) { return 0; } }, dur: () => { try { return ok ? pl.getDuration() || 0 : 0; } catch (e) { return 0; } },
      paused: () => { try { return ok ? pl.isPaused() : true; } catch (e) { return true; } }, setVol: v => { try { ok && pl.setVolume(v); } catch (e) {} },
      destroy: () => { dead = true; box.remove(); }};
    return p;
  }
  // ---------- file .mp4/.webm…, HLS .m3u8, luồng WebRTC ----------
  if (T === 'file' || T === 'hls' || T === 'stream' || T === 'local') {
    const v = document.createElement('video'); v.playsInline = true; v.controls = T !== 'stream'; v.preload = 'auto'; v.muted = !!muted; box.appendChild(v);
    let hls = null;
    v.addEventListener('play', () => emit('play')); v.addEventListener('pause', () => emit('pause')); v.addEventListener('ended', () => emit('ended'));
    v.addEventListener('seeked', () => emit('seeked'));
    v.addEventListener('error', () => { if (T !== 'stream') emit('error', 'Không phát được file này (link hết hạn, chặn nhúng hoặc định dạng lạ). Thử "Chia sẻ tab".'); });
    const p = {sync: T !== 'stream', kind: T, el: v,
      ready: (async () => {
        if (T === 'stream') { v.srcObject = stream; }
        else if (T === 'local') { v.src = src.url; }
        else if (T === 'hls' && !v.canPlayType('application/vnd.apple.mpegurl')) {
          await loadScript('https://cdnjs.cloudflare.com/ajax/libs/hls.js/1.5.13/hls.min.js', () => !!window.Hls);
          hls = new window.Hls(); hls.loadSource(src.url); hls.attachMedia(v);
          hls.on(window.Hls.Events.ERROR, (e, d) => { if (d && d.fatal) emit('error', 'Luồng HLS lỗi: ' + d.details); });
        } else v.src = src.url;
        if (start > 0 && T !== 'stream') { await new Promise(r => { if (v.readyState >= 1) r(); else v.addEventListener('loadedmetadata', r, {once: true}); setTimeout(r, 6000); }); try { v.currentTime = start; } catch (e) {} }
        if (autoplay) await v.play().catch(() => emit('needTap'));
      })(),
      play: () => v.play().catch(() => emit('needTap')), pause: () => v.pause(),
      seek: s => { try { if (T !== 'stream') v.currentTime = Math.max(0, s); } catch (e) {} },
      time: () => v.currentTime || 0, dur: () => (isFinite(v.duration) ? v.duration : 0), paused: () => v.paused, setVol: x => { v.volume = Math.max(0, Math.min(1, x)); },
      destroy: () => { try { hls && hls.destroy(); } catch (e) {} try { v.pause(); v.removeAttribute('src'); v.srcObject = null; v.load(); } catch (e) {} box.remove(); }};
    return p;
  }
  // ---------- chỉ nhúng (Dailymotion, Facebook, TikTok, Twitch clip…) ----------
  {
    const f = document.createElement('iframe');
    const url = T === 'dm' ? 'https://www.dailymotion.com/embed/video/' + encodeURIComponent(src.id) + '?autoplay=' + (autoplay ? 1 : 0) + '&start=' + Math.floor(start) : src.url;
    f.src = url; f.allow = 'autoplay; fullscreen; encrypted-media; picture-in-picture; clipboard-write'; f.allowFullscreen = true; f.referrerPolicy = 'strict-origin-when-cross-origin';
    box.appendChild(f);
    let t0 = performance.now() - start * 1000;
    return {sync: false, kind: T, ready: Promise.resolve(), play() {}, pause() {}, seek() {}, time: () => (performance.now() - t0) / 1000, dur: () => 0, paused: () => false, setVol() {},
      destroy: () => box.remove()};
  }
}
