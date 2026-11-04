// Cửa sổ nổi: kéo đi chỗ khác + đổi cỡ (to/nhỏ) cho các overlay (chat, việc hôm nay, thông báo, thanh tập trung, khung phim nhỏ…)
// float(el, {key, handle, grip, scale}):
//   handle: phần tử/selector để nắm kéo (mặc định cả el; bỏ qua khi bấm vào nút/ô nhập)
//   scale : true → góc dưới-phải phóng to/thu nhỏ đều (thuộc tính CSS `scale`, không đụng `transform` mà hiệu ứng mở panel đang dùng)
// Vị trí + cỡ nhớ trong localStorage (vyFl:<key>). Nhấp đúp vào chỗ nắm kéo = về chỗ cũ, cỡ cũ.
// CSS đặt vị trí qua biến --fx/--fy/--fs + lớp .fmoved/.fscaled (ui.css) → từng overlay tự quyết khi nào áp dụng (vd. khung phim chỉ khi đang thu nhỏ).
const LS = 'vyFl:';
const load = k => { try { return JSON.parse(localStorage.getItem(LS + k) || 'null'); } catch (e) { return null; } };
const save = (k, v) => { try { v ? localStorage.setItem(LS + k, JSON.stringify(v)) : localStorage.removeItem(LS + k); } catch (e) {} };
const SKIP = 'button,input,textarea,select,a,label,[contenteditable],.fgrip,.cMiniRz,.cRz';
const all = new Set();

export function float(el, {key, handle = null, scale = true, min = 0.6, max = 1.8} = {}) {
  if (!el || el._fl) return null;
  const st = load(key) || {};
  const F = el._fl = {st};
  const apply = () => {
    const s = st.s || 1;
    el.classList.toggle('fscaled', s !== 1); el.style.setProperty('--fs', s);
    if (st.x != null) {
      // giữ trong màn hình (ít nhất 48px của cửa sổ còn thấy/nắm được)
      const r = el.getBoundingClientRect(), w = r.width || 200, h = r.height || 60;
      st.x = Math.min(innerWidth - 48, Math.max(48 - w, st.x)); st.y = Math.min(innerHeight - 32, Math.max(0, st.y));
      el.style.setProperty('--fx', Math.round(st.x) + 'px'); el.style.setProperty('--fy', Math.round(st.y) + 'px'); el.classList.add('fmoved');
    } else el.classList.remove('fmoved');
  };
  F.apply = apply; all.add(F);
  const commit = () => save(key, st.x == null && (st.s || 1) === 1 ? null : st);
  const drag = (h, move) => h.addEventListener('pointerdown', e => {
    if (e.button !== 0 || (e.target.closest(SKIP) && e.target.closest(SKIP) !== h)) return;
    const r = el.getBoundingClientRect(), x0 = e.clientX, y0 = e.clientY, s0 = st.s || 1, b = {l: r.left, t: r.top, w: r.width};
    let on = false;
    const mv = ev => { const dx = ev.clientX - x0, dy = ev.clientY - y0; if (!on && Math.hypot(dx, dy) < 4) return; if (!on) { on = true; try { h.setPointerCapture(e.pointerId); } catch (er) {} document.documentElement.classList.add('fdrag'); } move(b, dx, dy, s0); apply(); };
    const up = () => { removeEventListener('pointermove', mv); removeEventListener('pointerup', up); removeEventListener('pointercancel', up); document.documentElement.classList.remove('fdrag'); if (on) commit(); };
    addEventListener('pointermove', mv); addEventListener('pointerup', up); addEventListener('pointercancel', up);
  });
  const hs = typeof handle === 'string' ? [...el.querySelectorAll(handle)] : [handle || el];
  // khi đã thu/phóng, vị trí trên màn hình = left/top (gốc toạ độ 0 0) → chỉ cần cộng độ dời
  hs.forEach(h => { h.classList.add('fhandle'); drag(h, (b, dx, dy) => { st.x = b.l + dx; st.y = b.t + dy; });
    h.addEventListener('dblclick', e => { if (e.target.closest(SKIP)) return; st.x = st.y = null; st.s = 1; apply(); commit(); }); });
  if (scale) {
    const g = document.createElement('i'); g.className = 'fgrip'; g.title = 'Kéo để phóng to / thu nhỏ'; el.appendChild(g);
    drag(g, (b, dx, dy, s0) => {
      if (st.x == null) { st.x = b.l; st.y = b.t; }
      st.s = Math.round(Math.min(max, Math.max(min, s0 * (b.w + Math.max(dx, dy * 1.4)) / b.w)) * 100) / 100;
    });
  }
  requestAnimationFrame(apply);
  return F;
}
addEventListener('resize', () => all.forEach(F => F.st.x != null && F.apply()));
