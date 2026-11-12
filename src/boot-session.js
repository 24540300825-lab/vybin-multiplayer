// Bước 1 của khởi động: nhân vật + phiên multiplayer (đăng nhập, chọn nhân vật, giữ slot BIN/VY).
// Dùng chung cho trang vỏ (shell.js — chạy 1 lần, giữ phiên suốt khi đổi map) và chế độ không vỏ (?noshell).
// Trả về {sess, slot, mapId} hoặc null nếu đang dừng ở một màn chờ (đăng nhập / phòng đầy / lỗi).
import {CONFIG} from './config.js';
import {DEFAULT_MAP, isMap, mapOpen} from './maps.js';

const $ = id => document.getElementById(id);
const mapFromUrl = () => (location.hash.match(/map=(\w+)/) || [])[1] || localStorage.getItem('vyMap');

export async function connectStep({gate, hide, LB}) {
  const {pickChar, savedChar, saveChar} = await import('./ui/pick.js');
  const forced = (CONFIG.as === 'bin' || CONFIG.as === 'vy') ? CONFIG.as : null;
  let pref = forced || savedChar(), note = '', sess = null, slot, mapId;
  const reload = () => (window.top || window).location.reload();
  if (CONFIG.multiplayer) {
    const {Session} = await import('./net/session.js');
    sess = new Session();
    sess.on('status', ({state}) => {
      if (state === 'full') { hide(); gate.show('🚪', 'Chỗ của bạn đã có người khác vào', 'Bạn rời đi khá lâu nên chỗ đã được nhường. Bấm Thử lại để vào lại nếu còn chỗ.', [['Thử lại', reload]]); }
      if (state === 'dup') { hide(); gate.show('🪟', 'Đang chơi ở thiết bị khác', 'Tài khoản này vừa được mở ở một tab hoặc thiết bị khác (laptop, điện thoại…). Bấm nút bên dưới để chơi tiếp ở đây.', [['Chơi ở đây', reload]]); }
    });
    LB(5, 'Đang kết nối phòng "' + CONFIG.room + '"...');
    const fatal = e => {
      hide();
      if (e.code === 'full') gate.show('🚪', 'Phòng đã đủ 2 người', 'BIN và VY đều đã có người. Thử lại sau, hoặc vào phòng khác bằng ?room=ten-phong.', [['Thử lại', reload]]);
      else gate.show('⚠️', 'Không kết nối được', String(e.message || e), [['Thử lại', reload], ['Chơi một mình', () => { const u = new URL(location.href); u.searchParams.set('solo', '1'); location.href = u; }]]);
    };
    try { await sess.init(); } catch (e) { fatal(e); return null; }
    // ---- tài khoản Google: chưa đăng nhập => màn đăng nhập (trang sẽ chuyển sang Google rồi quay lại) ----
    if (sess.needLogin) {
      const {loginScreen} = await import('./ui/login.js');
      const q = new URLSearchParams(location.hash.slice(1) + '&' + location.search.slice(1));
      const oerr = q.get('error_description') || q.get('error') || '';
      if (oerr) history.replaceState(null, '', location.pathname + location.search.replace(/([?&])(error|error_code|error_description)=[^&]*/g, '$1').replace(/[?&]+$/, ''));
      loginScreen({onGoogle: () => sess.signInGoogle(), note: oerr ? 'Đăng nhập chưa thành công: ' + oerr.replace(/\+/g, ' ') : ''});
      return null;
    }
    // ---- mỗi tài khoản gắn cố định 1 nhân vật: đã có => vào thẳng; chưa có => chọn 1 lần ----
    if (sess.account) {
      const email = (sess.user && sess.user.email) || 'tài khoản này';
      for (;;) {
        const {data: roster, error} = await sess.sb.rpc('game_roster');
        if (error) { fatal(new Error('Không đọc được nhân vật: ' + (error.message || error))); return null; }
        if (roster && roster.me) { pref = roster.me; break; }
        const owned = (roster && roster.owned) || [];
        if (owned.length >= 2) {
          hide(); gate.show('🚪', 'Bin và Vy đều đã có chủ', email + ' chưa gắn với nhân vật nào. Đăng xuất rồi đăng nhập bằng Gmail bạn đã dùng để chơi.', [['Đăng xuất', async () => { await sess.signOut(); reload(); }]]);
          return null;
        }
        const pick = await pickChar({taken: owned, note, takenText: 'Đã có chủ', hint: 'Đã đăng nhập ' + email + '. Chọn nhân vật của bạn — chỉ chọn một lần, sau này mọi thiết bị đăng nhập bằng tài khoản này đều vào đúng nhân vật.'});
        note = '';
        const r = await sess.sb.rpc('game_create_player', {p_slot: pick});
        if (r.error) { note = /slot_owned/.test(r.error.message || '') ? 'Nhân vật đó vừa được chọn bởi tài khoản khác — hãy chọn nhân vật còn lại.' : 'Chưa tạo được nhân vật: ' + r.error.message; continue; }
        pref = pick; break;
      }
      saveChar(pref);
    }
    for (;;) {
      if (!pref) {
        const taken = await sess.peek();
        if (taken.length >= 2) { fatal(Object.assign(new Error('full'), {code: 'full'})); return null; }
        pref = await pickChar({taken, note}); note = '';
        if (!forced) saveChar(pref);
      }
      try { const r = await sess.connect(pref); slot = r.slot; mapId = mapFromUrl(); if (!mapOpen(mapId)) mapId = r.map; break; }   // map là của RIÊNG từng người
      catch (e) {
        if (e.code === 'taken' && sess.account) { fatal(new Error((pref === 'bin' ? 'Bin' : 'Vy') + ' đang được một phiên khác giữ chỗ. Thử lại sau ít phút.')); return null; }
        if (e.code === 'taken') { note = (pref === 'bin' ? 'Bin' : 'Vy') + ' đang có người khác dùng — hãy chọn nhân vật còn lại.'; pref = null; continue; }
        fatal(e); return null;
      }
    }
  } else {
    if (!pref) { pref = await pickChar({}); }
    slot = pref;
    if (!forced) saveChar(slot);
    mapId = mapFromUrl();
  }
  if (!mapOpen(mapId)) mapId = DEFAULT_MAP;
  return {sess, slot, mapId};
}
