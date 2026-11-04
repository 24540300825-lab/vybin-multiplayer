// Thanh công cụ trên cùng — gom nhóm theo tần suất dùng (UX: ≤ 7 nút luôn hiện, còn lại vào menu "Thêm"):
//   [Xu · tài nguyên]  |  Liên lạc: chat · gọi · video · (rời gọi)  |  Chơi: nhiệm vụ · túi đồ · tập trung  |  hồ sơ · thông báo · ⋯ Thêm
//   Menu "Thêm": việc hôm nay · bản đồ · chụp ảnh · cài đặt · nút do tính năng mở rộng thêm vào
// Các module vẫn chèn nút vào #hTop như cũ (không phải sửa), ở đây chỉ SẮP XẾP lại DOM — nút giữ nguyên trình xử lý bấm.
import {ic} from './icons.js';
const $ = id => document.getElementById(id);
const GROUPS = [['iChat', 'iVoice', 'iVid', 'iVoiceX'], ['iQuest', 'iBag', 'iLamp', 'iFocus'], ['iProg', 'iNote']];
const MORE = ['iTask', 'iMap', 'iCam', 'iSet'];

export function organizeToolbar() {
  const top = $('hTop'); if (!top || top._org) return; top._org = true;
  // ô tài nguyên (Xu + chỗ trống cho tài nguyên sau này: ngọc, vé…) — số liệu do progress-ui cập nhật vào #rXu
  const res = document.createElement('div'); res.id = 'hRes'; res.className = 'hud cap'; res.setAttribute('aria-label', 'Tài nguyên');
  res.innerHTML = `<button class="rs" id="rXuB" title="Xu — bấm để mở cửa hàng / túi đồ"><i class="coin" aria-hidden="true"></i><b id="rXu"></b></button><span id="rMore"></span>`;
  const more = document.createElement('div'); more.id = 'tbMore'; more.className = 'tbm';
  more.innerHTML = `<button class="ib" id="iMore" title="Thêm" aria-label="Thêm" aria-haspopup="menu" aria-expanded="false"><i class="ic">${ic('dots')}</i><em class="dot" id="moDot" hidden></em></button><div class="hud panel tbMenu" id="tbMenu" role="menu"></div>`;
  const menu = more.querySelector('#tbMenu'), mb = more.querySelector('#iMore');
  const setOpen = v => { more.classList.toggle('open', v); mb.setAttribute('aria-expanded', v); mb.classList.toggle('on', v); };
  mb.onclick = e => { e.stopPropagation(); setOpen(!more.classList.contains('open')); };
  addEventListener('pointerdown', e => { if (!more.contains(e.target)) setOpen(false); }, true);
  addEventListener('keydown', e => { if (e.code === 'Escape') setOpen(false); });
  menu.addEventListener('click', e => { if (e.target.closest('.ib')) setTimeout(() => setOpen(false), 0); });
  res.querySelector('#rXuB').onclick = () => { const b = $('iBag'); b ? b.click() : (window.__openProgress && window.__openProgress('sum')); };

  let busy = false;
  const run = () => {
    if (busy) return; busy = true;
    const gs = GROUPS.map((ids, i) => { let g = top.querySelector('.tbg[data-g="' + i + '"]'); if (!g) { g = document.createElement('div'); g.className = 'tbg'; g.dataset.g = i; }
      const want = ids.map($).filter(Boolean); if (want.some((b, k) => g.children[k] !== b)) want.forEach(b => g.appendChild(b)); return g; });
    // nút lạ (tính năng mở rộng, module mới) + nhóm "Thêm" → vào menu, giữ thứ tự MORE trước
    MORE.forEach(id => { const b = $(id); if (b && b.parentNode !== menu) menu.appendChild(b); });
    [...top.children].forEach(c => { if (c.classList.contains('ib') && !GROUPS.flat().includes(c.id)) menu.appendChild(c); });
    const order = [res, ...gs.filter(g => g.children.length), more];
    gs.forEach(g => { if (!g.children.length) g.remove(); });
    if (order.some((c, k) => top.children[k] !== c) || top.children.length !== order.length) order.forEach(c => top.appendChild(c));
    menu.querySelectorAll('.ib').forEach(b => { if (!b.querySelector('.mlb')) { const s = document.createElement('span'); s.className = 'mlb'; s.textContent = (b.title || b.getAttribute('aria-label') || '').replace(/\s*\(.*\)$/, ''); b.appendChild(s); } b.setAttribute('role', 'menuitem'); });
    const dot = [...menu.querySelectorAll('.dot,.bdg')].some(d => !d.hidden && d.style.display !== 'none'); $('moDot').hidden = !dot;
    busy = false;
  };
  run();
  new MutationObserver(() => { if (!busy) queueMicrotask(run); }).observe(top, {childList: true});
  new MutationObserver(() => { if (!busy) queueMicrotask(run); }).observe(menu, {childList: true});   // module chèn nút cạnh #iSet (đang nằm trong menu) → xếp lại về đúng nhóm
  new MutationObserver(() => { const dot = [...menu.querySelectorAll('.dot,.bdg')].some(d => !d.hidden && d.style.display !== 'none'); const m = $('moDot'); if (m) m.hidden = !dot; }).observe(menu, {subtree: true, attributes: true, attributeFilter: ['hidden', 'style']});
}
