// NÂNG CẤP NHÀ (L1 → L2). Bản test: nút 🏡 nâng / hạ MIỄN PHÍ để xem thử; nâng xong báo cho người kia cùng lên cấp.
// Bản chính (HOUSE_RULES.mode = 'live'): sẽ khoá tới ngày mở + trả Điểm Kiến Tạo — làm khi chốt (xem src/house.js).
import {HOUSE_RULES, houseLevel, setHouseLevel} from '../house.js';

// tải lại map đang đứng (có trang vỏ: chỉ nạp lại khung game → cuộc gọi / nhạc / chat không đứt). Map tầng trên bị khoá khi hạ cấp → về phòng khách.
const reloadMap = (id) => {
  const L2ONLY = ['game', 'workshop', 'memory', 'greenhouse'];
  if (houseLevel() < 2 && L2ONLY.includes(id)) id = 'living';
  try { sessionStorage.setItem('vyFrom', ''); localStorage.setItem('vyMap', id); } catch (e) {}
  let sh = null; try { sh = window.parent && window.parent !== window ? window.parent.VYSHELL : null; } catch (e) {}
  if (sh && sh.go) { sh.go(id); return; }
  location.hash = 'map=' + id; location.reload();
};

export default {
  id: 'house',
  init(ctx) {
    const name = s => (s === 'bin' ? 'Bin' : 'Vy');
    const apply = (lv, who) => {
      const before = houseLevel();
      setHouseLevel(lv);
      if (houseLevel() === before) return;
      ctx.toast(who ? '🏡 ' + name(who) + (lv > before ? ' vừa nâng nhà lên L' : ' vừa đưa nhà về L') + lv + ' — đang tải lại…' : '🏡 Nhà L' + lv + ' — đang tải lại…');
      setTimeout(() => reloadMap(ctx.mapId), 1200);
    };
    ctx.on('lv', d => { if (d && d.lv) apply(d.lv, ctx.other); });
    // người kia vừa vào mà đang ở cấp khác → đồng bộ theo cấp cao hơn
    ctx.on('hello', d => { if (d && d.lv > houseLevel()) apply(d.lv, ctx.other); else if (d && d.lv < houseLevel()) ctx.send('lv', {lv: houseLevel()}); });
    ctx.onPeer && ctx.onPeer(p => { if (p && p.present) ctx.send('hello', {lv: houseLevel()}); });
    if (HOUSE_RULES.mode !== 'test') return;
    const lv = houseLevel();
    ctx.ui.addButton({icon: '🏡', label: lv < HOUSE_RULES.maxLevel ? 'Nâng nhà L' + (lv + 1) : 'Về nhà L1', onClick: () => {
      const cur = houseLevel(), next = cur < HOUSE_RULES.maxLevel ? cur + 1 : 1;
      const msg = next > cur
        ? 'BẢN THỬ: nâng nhà lên L' + next + ' miễn phí?\n\nMở tầng trên: Phòng Game 2 tầng (khúc côn cầu, caro, bóng rổ, Ai hiểu ai hơn), Xưởng thủ công, Phòng kỷ niệm, Vườn kính.\n(Bản chính: phải tới ngày mở và đủ Điểm Kiến Tạo.)'
        : 'BẢN THỬ: đưa nhà về L1 để xem lại?';
      if (!confirm(msg)) return;
      ctx.send('lv', {lv: next});
      apply(next, null);
    }});
  },
};
