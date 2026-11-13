// MÙA LỄ: lời chào khi vào game trong mùa lễ, Giáng sinh thì cho tuyết rơi (1 lần mỗi ngày, vẫn đổi thời tiết tay được).
// Bản test: nút 🎄 đổi mùa để xem trước (Tự động → Giáng sinh → Năm mới → Tết → Tắt) — chỉ đổi trên máy mình, tải lại trang.
import {SEASONS, activeSeason, forcedSeason, forceSeason, vnDate} from '../season/calendar.js';
import {HOUSE_RULES} from '../house.js';

const HELLO = {christmas: '🎄 Giáng sinh an lành! Nhà đã trang trí Noel', newyear: '🥂 Chúc mừng năm mới!', tet: '🧧 Chúc mừng năm mới — Tết đến rồi!'};
const NAME = {christmas: 'Giáng sinh', newyear: 'Năm mới', tet: 'Tết', off: 'Tắt'};

export default {
  id: 'seasons',
  init(ctx) {
    const s = activeSeason(), api = ctx.api;
    const today = vnDate().ymd;
    if (s && ctx.store.get('hello', '') !== s + today) { ctx.store.set('hello', s + today); setTimeout(() => ctx.toast(HELLO[s] || ''), 3000); }
    const S = SEASONS[s];
    if (S && S.weather && api && api.applyEnv && ctx.store.get('wx', '') !== today) {
      ctx.store.set('wx', today);
      setTimeout(() => { try { api.applyEnv({weather: S.weather}); window.__envChanged && window.__envChanged(); } catch (e) {} }, 4000);
    }
    if (HOUSE_RULES.mode === 'test') {
      const order = [null, 'christmas', 'newyear', 'tet', 'off'];
      const cur = forcedSeason();
      ctx.ui.addButton({icon: '🎄', label: 'Mùa: ' + (cur ? NAME[cur] : 'Tự động'), title: 'Bản thử: xem trước trang trí / trang phục / khung ảnh của từng mùa lễ (chỉ máy này)', onClick: () => {
        const nx = order[(order.indexOf(cur) + 1) % order.length];
        forceSeason(nx); ctx.toast('Mùa lễ: ' + (nx ? NAME[nx] : 'Tự động') + ' — đang tải lại…'); setTimeout(() => location.reload(), 700);
      }});
    }
  },
};
