// Điểm khởi động: cấu hình → (multiplayer) giữ slot BIN/VY → nạp asset của map + nhân vật của mình → dựng game → gắn mạng/chat/voice.
import {CONFIG} from './config.js';
import * as Assets from './assets.js';
import {MAP_LIST, DEFAULT_MAP, isMap, goToMap, prefetchMap} from './maps.js';
import {FILES} from './manifest.js';

const $ = id => document.getElementById(id);
const LB = (p, t) => { const b = $('lb'); if (b) b.style.width = Math.round(p) + '%'; if (t) $('lmsg').textContent = t; };
const fail = e => { console.error(e); $('lmsg').textContent = 'LỖI: ' + (e && e.message || e); $('lmsg').style.color = '#ff8080'; };
addEventListener('unhandledrejection', e => console.error('[unhandled]', e.reason));

async function boot() {
  let sess = null, slot, mapId, gate = null;
  const {mountGate} = await import('./ui/mp-ui.js');
  gate = mountGate();
  const hide = () => { $('load').classList.add('out'); setTimeout(() => $('load').style.display = 'none', 750); };

  // ---------- 1) phiên ----------
  if (CONFIG.multiplayer) {
    const {Session} = await import('./net/session.js');
    sess = new Session();
    sess.on('status', ({state, text}) => {
      if (state === 'dup') { hide(); gate.show('🪟', 'Đang mở ở tab khác', 'Tài khoản/slot này đang được dùng ở một tab khác. Dùng tab đó hoặc bấm nút bên dưới để chuyển sang tab này.', [['Dùng tab này', () => location.reload()]]); }
    });
    LB(5, 'Đang kết nối phòng "' + CONFIG.room + '"...');
    try { const r = await sess.connect(); slot = r.slot; mapId = r.map; }
    catch (e) {
      hide();
      if (e.code === 'full') gate.show('🚪', 'Phòng đã đủ 2 người', 'BIN và VY đều đã có người. Thử lại sau, hoặc vào phòng khác bằng ?room=ten-phong.', [['Thử lại', () => location.reload()]]);
      else gate.show('⚠️', 'Không kết nối được', String(e.message || e), [['Thử lại', () => location.reload()], ['Chơi một mình', () => { const u = new URL(location.href); u.searchParams.set('solo', '1'); location.href = u; }]]);
      return;
    }
  } else {
    slot = (CONFIG.as === 'bin' || CONFIG.as === 'vy') ? CONFIG.as : (localStorage.getItem('vySlot') || 'vy');
    try { localStorage.setItem('vySlot', slot); } catch (e) {}
    mapId = (location.hash.match(/map=(\w+)/) || [])[1] || localStorage.getItem('vyMap');
  }
  if (!isMap(mapId)) mapId = DEFAULT_MAP;
  window.MAPID = mapId; window.LOCAL_SLOT = slot;
  document.title = 'VY · BIN — ' + MAP_LIST[mapId].name;

  // ---------- 2) nạp song song: engine (JS) + asset map + nhân vật của mình ----------
  LB(10, 'Đang tải bản đồ & nhân vật ' + slot.toUpperCase() + '...');
  const enginePromise = import('./game.js');
  const ids = [...MAP_LIST[mapId].assets, 'char-' + slot];
  const files = await Assets.loadGroup(ids, p => LB(10 + p * 60));
  const eng = await enginePromise;
  LB(75, 'Dựng cảnh...');
  await new Promise(r => requestAnimationFrame(() => setTimeout(r, 0)));
  const mapKey = 'map-' + mapId;
  eng.init({env: files[mapKey], tree: files['tree'] || null, localGlb: files['char-' + slot], localSlot: slot, mapId});
  const api = eng.api;
  LB(88, 'Biên dịch shader...');
  try { await api.warm(); } catch (e) { console.warn('warm', e); }
  if (CONFIG.perf) window.VY.Perf.toggle(true);

  // ---------- 3) chuyển map (có fade + loading, đồng bộ cả phòng) ----------
  window.__prefetchMap = prefetchMap;
  window.__switchMap = async m => {
    if (!isMap(m) || m === mapId) return;
    prefetchMap(m);
    if (sess) { try { await sess.setMap(m); } catch (e) { console.warn('setMap', e); } }
    goToMap(m);
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
    api.envOut = o => sess.send({k: 'env', ...o});
    sess.on('msg', m => { if (m.k === 'map' && isMap(m.map) && m.map !== mapId) { toast('Đối phương chuyển sang: ' + MAP_LIST[m.map].name); prefetchMap(m.map); goToMap(m.map); } });
    sess.on('peer', ({present}) => { if (!present) return; });
    const chat = new Chat(sess), voice = new Voice(sess);
    mountMpUi({sess, chat, voice});
    chat.start().catch(e => console.warn('chat', e));
    window.VYNET = {sess, chat, voice, api};
    // tải nền byte của nhân vật kia (HTTP cache) để lúc họ vào không bị khựng
    setTimeout(() => { const f = FILES['char-' + other]; if (f) fetch(`assets/${f.file}?v=${f.v}`, {priority: 'low'}).then(r => r.arrayBuffer()).catch(() => {}); }, 4000);
    addEventListener('pagehide', () => { try { voice.leave(); } catch (e) {} });
    $('mpLeave') && ($('mpLeave').onclick = async () => { await sess.leave(); location.reload(); });
  }
  LB(100, 'Xong!'); setTimeout(hide, 300);
}
boot().catch(fail);
