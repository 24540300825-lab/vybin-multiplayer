// Điểm khởi động: cấu hình → (multiplayer) giữ slot BIN/VY → nạp asset của map + nhân vật của mình → dựng game → gắn mạng/chat/voice.
import {APP_VERSION} from './version.js';
import {CONFIG} from './config.js';
import * as Assets from './assets.js';
import {MAP_LIST, DEFAULT_MAP, isMap, mapOpen, mapAssets, extAsset, goToMap, prefetchMap} from './maps.js';
import {FILES} from './manifest.js';
import {SFX} from './sfx.js';
import {MAP_CONFIGS} from './map-configs.js';
import {APP_NAME} from './version.js';
window.SFX = SFX; SFX.init();

const $ = id => document.getElementById(id);
let LB = (p, t) => { const b = $('lb'); if (b) b.style.width = Math.round(p) + '%'; const n = $('lpct'); if (n) n.textContent = Math.round(p) + '%'; if (t) $('lmsg').textContent = t; };
const fail = e => { console.error(e); $('lmsg').textContent = 'LỖI: ' + (e && e.message || e); $('lmsg').style.color = '#ff8080'; };
addEventListener('unhandledrejection', e => console.error('[unhandled]', e.reason));

// Trang vỏ (shell.js) giữ phiên/cuộc gọi/chat/nhạc; trang này (game) chạy trong iframe của vỏ. ?noshell = chạy gộp 1 trang như cũ (test).
const SH = (() => { try { return window.parent !== window && window.parent.VYSHELL || null; } catch (e) { return null; } })();
if (SH) {
  window.__vyShell = SH;
  window.__vyToast = m => { const t = $('toast'); if (!t) return; t.textContent = m; t.style.opacity = 1; clearTimeout(window.__vyToast._t); window.__vyToast._t = setTimeout(() => t.style.opacity = 0, 2200); };
  ['pointerdown', 'keydown', 'touchstart'].forEach(ev => addEventListener(ev, () => { try { SH.gesture(ev); } catch (e) {} }, true));
  addEventListener('pagehide', () => { try { SH.purge(window); } catch (e) {} });
}

async function boot() {
  let sess = null, slot, mapId, gate = null;
  if (SH && SH.first) { const l0 = LB; LB = (p, t) => { l0(p, t); try { SH.LB(p, t); } catch (e) {} }; }
  // KHỞI ĐỘNG SỚM, SONG SONG với bước chọn nhân vật / kết nối phòng: đoán map + nhân vật (hash/localStorage) rồi tải & parse ngay GLB (engine JS đã được modulepreload trong index.html).
  // Đoán đúng (gần như luôn đúng ở lần vào sau) → tới bước 2 mọi thứ đã sẵn; đoán sai chỉ tốn một ít băng thông (asset có cache bền).
  {
    let gm = (location.hash.match(/map=(\w+)/) || [])[1] || localStorage.getItem('vyMap'); if (!mapOpen(gm)) gm = DEFAULT_MAP;
    const gc = (CONFIG.as === 'bin' || CONFIG.as === 'vy') ? CONFIG.as : (localStorage.getItem('vyChar') || '');
    const pre = [gm]; for (const id of pre) mapAssets(id).forEach(a => Assets.load(a).catch(() => {}));
    if (gc === 'bin' || gc === 'vy') Assets.load('char-' + gc).catch(() => {});
  }
  const {mountGate} = await import('./ui/mp-ui.js');
  gate = mountGate();
  const hide = () => { $('load').classList.add('out'); setTimeout(() => $('load').style.display = 'none', 750); };   // dùng cho màn lỗi/cổng: mờ đi ngay
  // vào game: ảnh loading tối dần về đen (.5s) → đen mờ dần để lộ game (.6s)
  const reveal = () => { const l = $('load'); l.classList.add('black'); setTimeout(() => { l.classList.add('out'); setTimeout(() => l.style.display = 'none', 450); }, 280); };

  // ---------- 1) nhân vật + phiên ----------
  // Lần đầu: màn CHỌN NHÂN VẬT (BIN / VY). Máy nhớ lựa chọn (localStorage 'vyChar') → các lần sau tự vào đúng nhân vật, không hỏi lại.
  // ?as=bin|vy ép nhân vật (dùng khi test), không lưu.
  if (SH) {
    sess = SH.sess; slot = SH.slot;
    mapId = (location.hash.match(/map=(\w+)/) || [])[1] || SH.mapId; if (!mapOpen(mapId)) mapId = DEFAULT_MAP;
  } else {
    const {connectStep} = await import('./boot-session.js');
    const r = await connectStep({gate, hide, LB}); if (!r) return;
    ({sess, slot, mapId} = r);
  }
  window.MAPID = mapId; window.LOCAL_SLOT = slot;
  document.title = APP_NAME + ' — ' + MAP_LIST[mapId].name; if (SH) SH.setTitle(document.title);

  // ---------- 2) nạp song song: engine (JS) + asset map + nhân vật của mình ----------
  LB(10, 'Đang tải bản đồ & nhân vật ' + slot.toUpperCase() + '...');
  const enginePromise = import('./game.js');   // KHÔNG import sớm: hud.js/game.js đọc LOCAL_SLOT/MAPID lúc nạp module (file đã được modulepreload nên vẫn nhanh)
  const {activeSeason} = await import('./season/calendar.js');
  const SEASON = activeSeason(), seasonAsset = SEASON && Assets.hasAsset('season-' + SEASON) ? 'season-' + SEASON : null;   // mùa lễ: đồ trang trí (nếu đã có file)
  window.__season = SEASON;
  const ids = [...mapAssets(mapId), 'char-' + slot, ...(seasonAsset ? [seasonAsset] : []), ...(Assets.hasAsset('flora-hana') && !/[?&]nohana\b/.test(location.search) ? ['flora-hana', ...(Assets.hasAsset('ground-hana') ? ['ground-hana'] : [])] : [])];
  const files = await Assets.loadGroup(ids, p => LB(10 + p * 60));
  const eng = await enginePromise;
  // cây cỏ HANA: dựng hình học lá + vật liệu một lần (src/hana.js) — lỗi thì giữ cây cỏ cũ
  let hanaKit = null;
  if (files['flora-hana']) { try { const {buildHanaKits} = await import('./hana.js'); hanaKit = await buildHanaKits(files['flora-hana'], files['ground-hana'] || null); } catch (e) { console.warn('[hana]', e); } }
  LB(75, 'Dựng cảnh...');
  await new Promise(r => requestAnimationFrame(() => setTimeout(r, 0)));
  const EXT = extAsset(), mapKey = mapId === 'exterior' ? EXT : 'map-' + mapId;
  eng.init({env: files[mapKey], ext: mapId !== 'exterior' ? files[EXT] || null : null, houseL2: EXT !== 'map-exterior', houseLv: EXT === 'map-exterior-l4' ? 4 : EXT === 'map-exterior-l3' ? 3 : EXT === 'map-exterior-l2' ? 2 : 1, localGlb: files['char-' + slot], localSlot: slot, mapId, hana: hanaKit, season: SEASON ? {id: SEASON, glb: seasonAsset ? files[seasonAsset] : null} : null});
  const api = eng.api;
  LB(88, 'Biên dịch shader...');
  let warmed = false; try { warmed = localStorage.getItem('vyWarm') === mapId; } catch (e) {}   // lần sau: trình duyệt đã cache shader → chờ ngắn hơn
  try { await Promise.race([api.warm(), new Promise(r => setTimeout(r, warmed ? 900 : 2200))]); } catch (e) { console.warn('warm', e); }
  try { localStorage.setItem('vyWarm', mapId); } catch (e) {}
  if (CONFIG.perf) window.VY.Perf.toggle(true);

  // ---------- 3) chuyển map (có fade + loading; ĐỘC LẬP từng người, không kéo người kia theo) ----------
  window.__prefetchMap = prefetchMap;
  window.__switchMap = async m => {
    if (!isMap(m) || m === mapId) return;
    if (!mapOpen(m)) { try { window.__vyToast && window.__vyToast('🏡 Cần nâng nhà lên L' + (MAP_LIST[m].minHouse || 2) + ' để mở ' + MAP_LIST[m].name); } catch (e) {} return; }
    prefetchMap(m);
    goToMap(m);        // chỉ mình đổi map; người kia ở lại map của họ
  };

  // ---------- 4) mạng ----------
  if (sess) {
    const {bindSync} = await import('./net/sync.js');
    const {Chat} = await import('./net/chat.js');
    const {Voice} = await import('./net/voice.js');
    const {mountMpUi, toast} = await import('./ui/mp-ui.js');
    const other = slot === 'bin' ? 'vy' : 'bin';
    const loadChar = async s => { const g = await Assets.load('char-' + s); Assets.retain('char-' + s); return g; };
    bindSync(sess, api, loadChar);
    let peerMap = null;
    sess.on('msg', m => { if (m.k === 's' && m.mp) peerMap = m.mp; });
    api.envOut = o => sess.send({k: 'env', ...o});
    sess.on('peer', ({present}) => { if (!present) return; });
    // Mỗi người có thể ở map KHÁC nhau. Mỗi snapshot kèm map của người gửi: khác map thì ẩn nhân vật kia (toạ độ map khác sẽ làm họ "đứng giữa không trung"),
    // cùng map thì hiện. (sync.js bỏ qua mọi lệnh/vị trí của đối phương khi khác map.)
    sess.on('msg', m => {
      if (m.k !== 's' || !m.mp || !isMap(m.mp) || !api.setRemoteVisible) return;
      api.setRemoteVisible(m.mp === mapId);
    });
    sess.on('version', v => toast(v.mismatch ? '⚠️ Hai máy đang chạy bản game khác nhau — bấm Ctrl+F5 (tải lại) để chơi đồng bộ' : 'Đối phương đang chạy bản game khác — nếu thấy lạ, bấm Ctrl+F5'));
    const chat = SH ? SH.chat : new Chat(sess), voice = SH ? SH.voice : new Voice(sess);
    const ui = mountMpUi({sess, chat, voice});
    try { const {mountCallRing} = await import('./ui/call-ring.js'); mountCallRing({voice, sess, toast, other}); } catch (e) { console.warn('call-ring', e); }
    try { const {mountChatNotify} = await import('./ui/chat-notify.js'); mountChatNotify({chat, openChat: ui.setOpen}); } catch (e) { console.warn('chat-notify', e); }
    if (!SH) chat.start().catch(e => console.warn('chat', e));
    window.VYNET = {sess, chat, voice, api};
    // miệng nhân vật nhép theo tiếng nói trong cuộc gọi (máy mình: mic của mình; nhân vật kia: tiếng của họ)
    api.meTalk = () => !!(voice.active && voice.micOn && !voice.muted && voice.speaking);
    api.peerTalk = () => !!(voice.active && voice.peerVoice && voice.peerSpeaking);
    // tải nền byte của nhân vật kia (HTTP cache) để lúc họ vào không bị khựng
    setTimeout(() => { const f = FILES['char-' + other]; if (f) fetch(`assets/${f.file}?v=${f.v}`, {priority: 'low'}).then(r => r.arrayBuffer()).catch(() => {}); }, 4000);
    if (!SH) {     // có vỏ thì cuộc gọi sống ở vỏ — đổi map không đụng tới
      addEventListener('pagehide', () => { try { voice.leave('reload'); } catch (e) {} });
      voice.resume().catch(e => console.warn('call resume', e));
      addEventListener('pageshow', e => { if (e.persisted) voice.resume().catch(() => {}); });     // sau F5: tự vào lại cuộc gọi nếu trước đó đang gọi
    }
    $('mpLeave') && ($('mpLeave').onclick = async () => { await sess.leave(); (window.top || window).location.reload(); });

    // ---------- 4b) tiến trình người chơi (ví, XP, cấp, Hộp quà, thành tựu, phiên tập trung) — chỉ bản tài khoản ----------
    if (sess.account) {
      try {
        const {Progress} = await import('./net/progress.js');
        const prog = new Progress(sess.sb, sess); window.VYPROG = prog;
        await prog.refresh();
        const {mountProgressUi} = await import('./ui/progress-ui.js');
        const pui = mountProgressUi({prog, toast, sess}); window.__openProgress = pui.open;
        sess.on('msg', m => { if (m.k === 'eco') prog.refresh(); });
        sess.on('peer', ({present}) => { if (present) prog.refresh(); });
        $('sAcc') && ($('sAcc').textContent = (sess.user && sess.user.email) || '');
        const day = () => { const d = new Date(); return d.getFullYear() + '-' + (d.getMonth() + 1) + '-' + d.getDate(); };
        // vào map => sự kiện (máy chủ tự áp giới hạn: về nhà lần đầu, dạo vườn 1 lần/ngày…)
        const mapEv = {living: 'enter_house', house: 'enter_house', exterior: 'visit_garden', vy: 'enter_studio', bin: 'enter_studio', studio: 'enter_studio'}[mapId];
        if (mapEv) prog.report(mapEv, {map: mapId}, mapEv + ':' + day());
        // ngủ: game phát lệnh 'sleep' qua api.emit (cùng lệnh đồng bộ cho người kia)
        const emit0 = api.emit;
        api.emit = (t, a) => {
          if (t === 'sleep') prog.report('sleep', {}, 'sleep:' + Math.floor(Date.now() / 60000));
          if (t === 'sit') prog.report('sit', {}, 'sit:' + Math.floor(Date.now() / 120000));
          return emit0 ? emit0(t, a) : undefined;
        };
        // nhiệm vụ, túi đồ & kho nhà, hướng dẫn người mới (hạng mục 04 + 05)
        try { const {mountQuestsUi} = await import('./ui/quests-ui.js'); window.__vyQuests = mountQuestsUi({prog, toast, api, mapId}); }
        catch (e) { console.warn('[quests]', e); }
        // nội thất đặt thêm trong nhà (model Kenney CC0, assets/furniture/) — lỗi ở đây không ảnh hưởng game
        import('./build/furniture.js').then(m => m.mountFurniture({prog, sess, api, mapId, slot, toast})).then(f => { if (f) window.__vyFurn = f; }).catch(e => console.warn('[furn]', e));
        // chat
        if (SH) chat.on('sent', () => prog.report('chat_sent', {}, 'chat:' + Date.now()));
        else { const send0 = chat.send.bind(chat); chat.send = async (...args) => { const r = await send0(...args); if (r && r.ok !== false) prog.report('chat_sent', {}, 'chat:' + Date.now()); return r; }; }
        // gọi cho nhau (mỗi cuộc gọi tính 1 lần; máy chủ giới hạn theo ngày)
        let inCall = false;
        voice.on && voice.on('state', st => { const on = !!(st && st.active && st.peerVoice && (st.phase === 'connected' || st.phase === 'weak')); if (on && !inCall) prog.report('call_together', {}, 'call:' + Math.floor(Date.now() / 1800000)); inCall = on; });
        // ở cạnh nhau: cùng online + cùng map, cộng dồn mỗi 10 phút
        // (có trang vỏ: bộ đếm sống ở vỏ nên đổi phòng không làm mất số phút đã cộng; vẫn chỉ tính khi ở CÙNG một map)
        const TG = SH ? (SH.together ||= {n: 0}) : {n: 0};
        setInterval(() => { if (document.hidden || !sess.peer || peerMap !== mapId) return; if (++TG.n % 10 === 0) prog.report('together_10min', {map: mapId}, 'tg:' + Math.floor(Date.now() / 600000)); }, 60000);
        // "Việc hôm nay" đồng bộ giữa các máy
        const T = window.__vyTasks;
        if (T && prog.me) {
          const srv = prog.me.player.tasks || [], loc = T.get();
          if (srv.length) T.set(srv); else if (loc.length) prog.save({tasks: loc}).catch(e => console.warn('tasks', e));
          let tm = null; T.onChange = list => { clearTimeout(tm); tm = setTimeout(() => prog.save({tasks: list}).catch(e => console.warn('tasks', e)), 800); };
        }
      } catch (e) { console.warn('[progress]', e); }
    }
    // ---------- 4c) thông báo hệ thống (góc màn hình) khi đang ở tab khác ----------
    try { const {mountSysNotify} = await import('./ui/sysnotify.js'); mountSysNotify({chat, voice, sess, prog: window.VYPROG || null, other, openChat: ui.setOpen, toast}); }
    catch (e) { console.warn('[sysnotify]', e); }
  }
  // ---------- 4d) rạp chung (TV phòng khách): xem phim cùng nhau ----------
  try {
    if (api.hasTV && api.hasTV()) {
      const {mountCinema} = await import('./cinema/cinema.js');
      const {toast} = await import('./ui/mp-ui.js');
      const N = window.VYNET || {};
      api.cinema = mountCinema({api, sess, voice: N.voice || null, slot, other: slot === 'bin' ? 'vy' : 'bin', toast, music: SH ? {ytm: SH.ytm, Lofi: SH.Lofi} : null});
    }
  } catch (e) { console.warn('[cinema]', e); }
  // ---------- 5) tính năng cắm thêm (minigame…): lỗi 1 tính năng không ảnh hưởng game ----------
  try {
    const {createFeatureHost} = await import('./features/host.js'), {FEATURES} = await import('./features/registry.js');
    const {toast} = await import('./ui/mp-ui.js');
    const host = createFeatureHost({sess, api, slot, other: slot === 'bin' ? 'vy' : 'bin', mapId, toast});
    window.VYFEATURES = host;
    FEATURES.forEach(load => load().then(m => host.register(m.default)).catch(e => console.warn('[features] không nạp được', e)));
  } catch (e) { console.warn('[features]', e); }
  // ---------- 5b) "hộp đen": ghi lại tình trạng mỗi giây để biết vì sao lâu lâu web bị đứng ----------
  try {
    const BK = 'vyf:blackbox', prev = JSON.parse(localStorage.getItem(BK) || 'null');
    if (prev && prev.run && Date.now() - prev.ts < 3600e3) {   // lần trước kết thúc mà không qua 'pagehide' → bị đứng/chết tab
      window.__lastCrash = prev; console.warn('[blackbox] lần trước có thể bị đứng', prev);
      import('./ui/mp-ui.js').then(m => setTimeout(() => m.toast('⚠️ Lần trước web bị đứng — đã ghi lại thông tin để chẩn đoán (' + (prev.map || '') + ', khung hình dài nhất ' + prev.maxFrameMs + ' ms)'), 2500)).catch(() => {});
    }
    let maxFrame = 0, lastT = performance.now(), frames = 0;
    const raf = now => { const d = now - lastT; lastT = now; frames++; if (d > maxFrame) maxFrame = d; requestAnimationFrame(raf); }; requestAnimationFrame(raf);
    const V = () => window.VY, snap = () => { const v = V(), r = v && v.renderer, inf = r && r.info, m = performance.memory;
      return {run: 1, ts: Date.now(), ver: APP_VERSION, map: mapId, slot, maxFrameMs: Math.round(maxFrame), fps: frames,
        geo: inf && inf.memory.geometries, tex: inf && inf.memory.textures, calls: inf && inf.render.calls, tris: inf && inf.render.triangles,
        heapMB: m ? Math.round(m.usedJSHeapSize / 1048576) : null, scene: v && v.scene ? v.scene.children.length : null,
        hs: window.__hide && window.__hide.state && window.__hide.state(), hp: window.__potato && window.__potato.state && window.__potato.state(),
        mode: v && v.local && v.local.P && v.local.P.mode, wx: v && v.WC && v.WC.type, vis: document.visibilityState}; };
    // Worker canh luồng chính: không nhận được nhịp > 5 s (khi tab đang hiện) → ghi vào IndexedDB "bị treo lúc nào + trạng thái cuối"; nhịp trở lại thì ghi thêm treo bao lâu. (Worker vẫn sống khi luồng chính kẹt vòng lặp.)
    let wd = null;
    try {
      const src = `let last=Date.now(),snap=null,hid=false,hung=0,db=null;
const open=()=>new Promise(r=>{try{const q=indexedDB.open('vyf-bb',1);q.onupgradeneeded=()=>q.result.createObjectStore('k');q.onsuccess=()=>r(q.result);q.onerror=()=>r(null)}catch(e){r(null)}});
const put=async(k,v)=>{db=db||await open();if(!db)return;try{db.transaction('k','readwrite').objectStore('k').put(v,k)}catch(e){}};
onmessage=e=>{const m=e.data;if(m.beat){last=Date.now();snap=m.snap;hid=!!m.hid;if(hung){put('hang',{at:hung,lenMs:Date.now()-hung,recovered:1,snap:snap});hung=0}}};
setInterval(()=>{if(hid)return;const age=Date.now()-last;if(age>5000&&!hung){hung=last;put('hang',{at:hung,lenMs:age,recovered:0,snap:snap})}else if(hung&&age>5000){put('hang',{at:hung,lenMs:Date.now()-hung,recovered:0,snap:snap})}},1000);`;
      wd = new Worker(URL.createObjectURL(new Blob([src], {type: 'text/javascript'})));
      const q = indexedDB.open('vyf-bb', 1); q.onupgradeneeded = () => q.result.createObjectStore('k');
      q.onsuccess = () => { try { const g = q.result.transaction('k').objectStore('k').get('hang'); g.onsuccess = () => { const h = g.result; if (h && Date.now() - h.at < 7 * 86400e3) { window.__lastHang = h; console.warn('[watchdog] lần trước luồng chính bị treo', h);
        if (h.lenMs > 8000) import('./ui/mp-ui.js').then(m => setTimeout(() => m.toast('⚠️ Lần trước web bị treo ' + Math.round(h.lenMs / 1000) + ' s' + (h.recovered ? '' : ' (không tự hết)') + ' — đã ghi lại để chẩn đoán'), 3500)).catch(() => {});
        try { const w = q.result.transaction('k', 'readwrite').objectStore('k'); w.delete('hang'); } catch (e) {} } }; } catch (e) {} };
    } catch (e) { console.warn('[watchdog]', e); }
    // đối phương im lặng > 8 s trong khi vẫn "có mặt": máy họ có thể đang đứng
    let peerLast = Date.now(), peerWarn = 0;
    if (sess) sess.on('msg', m => { if (m.k === 's') { peerLast = Date.now(); peerWarn = 0; } });
    setInterval(() => { try { if (!sess || !sess.peer || document.hidden) return; const age = Date.now() - peerLast; window.__peerQuiet = age;
      if (age > 8000 && !peerWarn) { peerWarn = 1; import('./ui/mp-ui.js').then(m => m.toast('⚠️ ' + (slot === 'bin' ? 'Vy' : 'Bin') + ' không gửi tín hiệu hơn 8 s — máy họ có thể đang đứng/mất mạng. Nhờ họ tải lại trang (F5).')).catch(() => {}); } } catch (e) {} }, 2000);
    setInterval(() => { try { const o = snap(); maxFrame = 0; frames = 0; localStorage.setItem(BK, JSON.stringify(o)); if (wd) wd.postMessage({beat: 1, snap: o, hid: document.hidden}); } catch (e) {} }, 1000);
    addEventListener('pagehide', () => { try { const o = snap(); o.run = 0; localStorage.setItem(BK, JSON.stringify(o)); } catch (e) {} });
  } catch (e) { console.warn('[blackbox]', e); }
  LB(100, 'Xong!');
  if (SH && SH.first) { $('load').style.display = 'none'; setTimeout(() => SH.reveal(), 60); } else setTimeout(reveal, 60);
  // tải nền sẵn map mà cửa/cổng của map này dẫn tới (HTTP cache) → lúc bấm chuyển map chỉ còn dựng cảnh, vào nhanh
  setTimeout(() => { const t = (MAP_CONFIGS[mapId] || {}).doorTo; if (t) prefetchMap(t); }, 1200);
}
if (!SH && window.parent === window && !CONFIG.noshell) import('./shell.js').then(m => m.bootShell()).catch(fail);
else boot().catch(e => { fail(e); try { SH && SH.fail(String(e && e.message || e)); } catch (x) {} });
