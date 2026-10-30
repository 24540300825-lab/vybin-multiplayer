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

// chữ vừa đổi: chữ cũ trượt LÊN rồi mờ đi, chữ mới trượt từ DƯỚI lên (rõ ràng, nhưng chỉ transform + opacity).
// Chỉ chạy khi NỘI DUNG thật sự khác lần trước — nếu game ghi lại đúng chữ cũ (như đồng hồ cập nhật mỗi nhịp) thì bỏ qua, không giật.
function textIn(el) {
  const now = el.textContent;
  if (el.__fxT === undefined) { el.__fxT = now; return; }
  const was = el.__fxT; el.__fxT = now;
  if (!can(el) || was === now || !was) return;
  const host = el.offsetParent;
  if (host && el.offsetWidth) {
    const g = el.cloneNode(false); g.removeAttribute('id'); g.textContent = was; g.setAttribute('aria-hidden', 'true');
    g.style.cssText += ';position:absolute;margin:0;pointer-events:none;left:' + el.offsetLeft + 'px;top:' + el.offsetTop + 'px;width:' + el.offsetWidth + 'px;height:' + el.offsetHeight + 'px';
    host.appendChild(g);
    const a = run(g, [{opacity: 1, transform: 'none'}, {opacity: 0, transform: 'translateY(-.9em)'}], {duration: 260, easing: 'cubic-bezier(.4,0,.8,.4)', fill: 'forwards'});
    a.addEventListener('finish', () => g.remove()); a.addEventListener('cancel', () => g.remove());
  }
  el.getAnimations().forEach(a => a.cancel());
  run(el, [{opacity: 0, transform: 'translateY(.9em)'}, {opacity: 1, transform: 'none'}], {duration: 380, easing: 'cubic-bezier(.2,.9,.3,1.25)'});
}
// biểu tượng vừa đổi (phát ↔ tạm dừng, mic bật ↔ tắt…) → "bật" nảy ra (thu nhỏ → phóng to → về cỡ thật). KHÔNG xoay.
// Chỉ chạy khi biểu tượng thật sự khác lần trước (game vẽ lại cùng một biểu tượng thì bỏ qua).
function iconIn(el) {
  const sig = el.innerHTML;
  if (el.__fxI === undefined) { el.__fxI = sig; return; }
  if (el.__fxI === sig) return;
  el.__fxI = sig;
  const s = el.firstElementChild; if (!can(s)) return;
  run(s, [{opacity: 0, transform: 'scale(.3)'}, {opacity: 1, transform: 'scale(1.3)', offset: .55}, {opacity: 1, transform: 'none'}], {duration: 420, easing: 'cubic-bezier(.3,.7,.3,1)'});
}
// ảnh vừa đổi (avatar đối phương online ↔ offline) → mờ vào + phóng từ nhỏ, có chớp sáng. Chỉ chạy khi nguồn ảnh thật sự đổi.
function imgIn(img) {
  const src = img.getAttribute('src');
  if (img.__fxS === undefined) { img.__fxS = src; return; }
  if (img.__fxS === src) return;
  img.__fxS = src;
  if (!can(img)) return;
  const go = () => run(img, [{opacity: .1, transform: 'scale(.7)', filter: 'brightness(1.6)'}, {opacity: 1, transform: 'scale(1.06)', filter: 'brightness(1.15)', offset: .6}, {opacity: 1, transform: 'none', filter: 'none'}], {duration: 520, easing: ease});
  if (img.complete) go(); else img.addEventListener('load', go, {once: true});
}

const WATCH = [
  // KHÔNG có đồng hồ (#cT, #cDw, #cDd, #cWt, #cW): giờ cập nhật liên tục, animate sẽ giật
  ['#mTt', textIn], ['#mSt', textIn], ['#peSt', textIn], ['#peNm', textIn], ['#pNm', textIn], ['#pLv', textIn],
  ['#mPlay', iconIn], ['#iVoice', iconIn],
  ['#peAv', imgIn], ['#pAv', imgIn],
];
function watch() {
  unwatch();
  for (const [sel, fn] of WATCH) {
    const el = document.querySelector(sel); if (!el) continue;
    const isImg = el.tagName === 'IMG';
    el.__fxT = el.textContent; el.__fxI = el.innerHTML; el.__fxS = el.getAttribute('src');   // mốc so sánh: chỉ animate khi nội dung thật sự khác
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
