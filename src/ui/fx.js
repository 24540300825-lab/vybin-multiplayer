// Hiệu ứng giao diện: 2 chế độ
//   'lite' — NHẸ: mọi thứ đổi tức thì, tắt blur nền kính (tốn GPU nhất), tắt animation. Dành cho máy yếu.
//   'high' — ĐỒ HỌA CAO (Smart Animate): chuyển trạng thái có animation (chữ/biểu tượng đổi bằng trượt+mờ, avatar đổi mờ dần,
//            thẻ thu/mở, panel bung ra từ góc, danh sách xuất hiện lần lượt…). Chỉ dùng transform + opacity nên vẫn nhẹ.
// Lưu trong localStorage 'vyFx'. Chưa chọn: tự đặt 'high', trừ máy rất yếu / bật "giảm chuyển động" của hệ điều hành → 'lite'.
const KEY = 'vyFx';
const root = document.documentElement;
const reduced = () => { try { return matchMedia('(prefers-reduced-motion: reduce)').matches; } catch (e) { return false; } };
const weak = () => (navigator.hardwareConcurrency || 8) <= 2 || (navigator.deviceMemory || 8) <= 2;
const stored = () => { try { const v = localStorage.getItem(KEY); return v === 'lite' || v === 'high' ? v : null; } catch (e) { return null; } };
let mode = stored() || (reduced() || weak() ? 'lite' : 'high');
root.dataset.fx = mode;

const mos = [];
const ease = 'cubic-bezier(.2,.8,.2,1)';
const can = el => mode === 'high' && el && el.animate;
const live = new Set();      // các animation do fx tạo ra — chuyển sang chế độ Nhẹ thì huỷ ngay, không để chạy nốt
const run = (el, kf, opt) => { const a = el.animate(kf, opt); live.add(a); const done = () => live.delete(a); a.addEventListener('finish', done); a.addEventListener('cancel', done); return a; };

// chữ vừa đổi → trượt nhẹ + hiện dần (chỉ phần "vào"; phần "ra" bị thay ngay nên không cần)
function textIn(el) {
  if (!can(el)) return;
  el.getAnimations().forEach(a => a.cancel());
  run(el, [{opacity: 0, transform: 'translateY(.375em)'}, {opacity: 1, transform: 'none'}], {duration: 220, easing: ease});
}
// biểu tượng vừa đổi (phát ↔ tạm dừng, mic bật ↔ tắt…) → "bật" ra từ nhỏ + xoay nhẹ
function iconIn(el) {
  const s = el && el.firstElementChild; if (!can(s)) return;
  run(s, [{opacity: 0, transform: 'scale(.55) rotate(-40deg)'}, {opacity: 1, transform: 'none'}], {duration: 240, easing: 'cubic-bezier(.34,1.56,.64,1)'});
}
// ảnh vừa đổi (avatar đối phương online ↔ offline) → mờ vào + phóng nhẹ
function imgIn(img) {
  if (!can(img)) return;
  const go = () => run(img, [{opacity: .15, transform: 'scale(.88)'}, {opacity: 1, transform: 'none'}], {duration: 300, easing: ease});
  if (img.complete) go(); else img.addEventListener('load', go, {once: true});
}

const WATCH = [
  ['#mTt', textIn], ['#mSt', textIn], ['#peSt', textIn], ['#peNm', textIn], ['#cWt', textIn], ['#cDw', textIn], ['#cDd', textIn], ['#cT', textIn], ['#pNm', textIn], ['#pLv', textIn],
  ['#mPlay', iconIn], ['#cW', iconIn], ['#iVoice', iconIn],
  ['#peAv', imgIn], ['#pAv', imgIn],
];
function watch() {
  unwatch();
  for (const [sel, fn] of WATCH) {
    const el = document.querySelector(sel); if (!el) continue;
    const isImg = el.tagName === 'IMG';
    let busy = false;
    const mo = new MutationObserver(() => { if (busy) return; busy = true; requestAnimationFrame(() => { busy = false; fn(el); }); });
    mo.observe(el, isImg ? {attributes: true, attributeFilter: ['src']} : {childList: true, characterData: true, subtree: true});
    mos.push(mo);
  }
}
function unwatch() { mos.splice(0).forEach(m => m.disconnect()); }

export const Fx = {
  get mode() { return mode; },
  get high() { return mode === 'high'; },
  set(m) {
    if (m !== 'lite' && m !== 'high') return;
    mode = m; root.dataset.fx = m; try { localStorage.setItem(KEY, m); } catch (e) {}
    if (m === 'high') watch(); else { unwatch(); live.forEach(a => a.cancel()); live.clear(); }
    window.dispatchEvent(new CustomEvent('vy:fx', {detail: m}));
  },
  // gọi lại khi có phần tử mới được tạo sau (peer card, nút thoại…)
  refresh() { if (mode === 'high') watch(); },
};
window.VYFX = Fx;
if (mode === 'high') {
  // HUD dựng xong sau khi module này nạp → đợi 1 nhịp rồi gắn
  const start = () => setTimeout(watch, 400);
  if (document.readyState === 'complete') start(); else addEventListener('load', start, {once: true});
}
