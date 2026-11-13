// CHẾ ĐỘ CHỤP ẢNH + PHOTOBOOTH (📸): ẩn hết giao diện, chọn khung hình (toàn màn hình / 9:16 story / 1:1), khung viền theo mùa lễ,
// hẹn giờ 3 / 10 giây, đèn flash, lưu PNG (điện thoại: mở bảng chia sẻ). Khung viền = ảnh PNG trong suốt do bạn thiết kế:
//   assets/frame-<mùa>-9x16.png · assets/frame-<mùa>-1x1.png · assets/frame-<mùa>-full.png   (mùa: christmas | newyear | tet; xem docs/SEASONS.md)
// Ghim 'PIN_photobooth' trong đồ trang trí mùa lễ → bấm ghim là mở chế độ này.
import {fileUrl} from '../assets.js';
import {SFX} from '../sfx.js';

const RATIOS = [{k: 'full', label: 'Toàn màn hình', r: 0}, {k: '9x16', label: '9:16 story', r: 9 / 16}, {k: '1x1', label: '1:1', r: 1}];
const css = `
#vyPhoto{position:fixed;inset:0;z-index:9000;pointer-events:none;font-family:Nunito Sans,system-ui,sans-serif}
#vyPhoto .box{position:absolute;outline:9999px solid rgba(0,0,0,.45);border-radius:2px;box-shadow:0 0 0 1px rgba(255,255,255,.55) inset}
#vyPhoto .box img{position:absolute;inset:0;width:100%;height:100%;object-fit:fill}
#vyPhoto .bar{position:absolute;left:50%;bottom:22px;transform:translateX(-50%);display:flex;flex-wrap:wrap;gap:6px;align-items:center;justify-content:center;
  max-width:min(94vw,720px);padding:8px 10px;border-radius:16px;background:rgba(24,22,30,.78);backdrop-filter:blur(8px);pointer-events:auto;color:#fff;font-size:13px}
#vyPhoto .bar b{font-weight:700;opacity:.7;margin:0 2px 0 6px}
#vyPhoto .bar button{border:0;border-radius:10px;padding:6px 10px;background:rgba(255,255,255,.12);color:#fff;font:inherit;cursor:pointer}
#vyPhoto .bar button.on{background:#fff;color:#1d1b24}
#vyPhoto .bar button.go{background:#ff6b6b;color:#fff;font-weight:800;padding:7px 16px}
#vyPhoto .cd{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;font-size:min(30vw,220px);font-weight:900;color:#fff;
  text-shadow:0 6px 30px rgba(0,0,0,.45)}
#vyPhoto .fl{position:absolute;inset:0;background:#fff;opacity:0;transition:opacity .45s ease-out}
#vyPhoto.hideui .bar{display:none}
`;

export default {
  id: 'photo',
  init(ctx) {
    const st = document.createElement('style'); st.textContent = css; document.head.appendChild(st);
    const season = () => window.__seasonOn || window.__season || null;
    let open = false, ratio = ctx.store.get('ratio', '9x16'), useFrame = ctx.store.get('frame', true), timer = ctx.store.get('timer', 3), busy = false;
    let root = null, hidden = [];
    const frameUrl = k => { const s = season(); return s ? fileUrl('frame-' + s + '-' + k) : null; };
    const canvas = () => (window.VY && window.VY.renderer && window.VY.renderer.domElement) || document.querySelector('canvas');

    // ẩn mọi thứ trên màn hình trừ khung game + lớp chụp ảnh
    function hideUI(on) {
      if (on) {
        const cv = canvas();
        hidden = [...document.body.children].filter(el => el !== root && !(cv && el.contains(cv)) && el.tagName !== 'SCRIPT' && el.tagName !== 'STYLE')
          .map(el => [el, el.style.visibility]);
        hidden.forEach(([el]) => { el.style.visibility = 'hidden'; });
      } else { hidden.forEach(([el, v]) => { el.style.visibility = v; }); hidden = []; }
    }
    function boxRect() {
      const W = innerWidth, H = innerHeight, R = RATIOS.find(r => r.k === ratio) || RATIOS[0];
      if (!R.r) return {x: 0, y: 0, w: W, h: H};
      let w = W, h = W / R.r; if (h > H * 0.86) { h = H * 0.86; w = h * R.r; }
      return {x: (W - w) / 2, y: (H - h) / 2 - (H > 520 ? 26 : 0), w, h};
    }
    function layout() {
      if (!root) return;
      const b = root.querySelector('.box'), r = boxRect();
      Object.assign(b.style, {left: r.x + 'px', top: r.y + 'px', width: r.w + 'px', height: r.h + 'px'});
      const img = b.querySelector('img'), u = useFrame ? frameUrl(ratio) : null;
      img.style.display = u ? '' : 'none'; if (u && img.getAttribute('src') !== u) img.src = u;
      root.querySelectorAll('[data-r]').forEach(x => x.classList.toggle('on', x.dataset.r === ratio));
      root.querySelectorAll('[data-t]').forEach(x => x.classList.toggle('on', +x.dataset.t === timer));
      const fb = root.querySelector('[data-f]'), any = !!frameUrl(ratio);
      fb.style.display = any ? '' : 'none'; fb.classList.toggle('on', useFrame && any);
    }
    function build() {
      root = document.createElement('div'); root.id = 'vyPhoto';
      root.innerHTML = `<div class="box"><img alt=""></div><div class="cd"></div><div class="fl"></div>
        <div class="bar"><b>Khung</b>${RATIOS.map(r => `<button data-r="${r.k}">${r.label}</button>`).join('')}
        <button data-f="1">🖼️ Viền mùa lễ</button><b>Hẹn giờ</b>${[0, 3, 10].map(t => `<button data-t="${t}">${t ? t + 's' : 'Tắt'}</button>`).join('')}
        <button class="go">📸 Chụp</button><button data-x="1">✕</button></div>`;
      document.body.appendChild(root);
      root.querySelectorAll('[data-r]').forEach(b => b.onclick = () => { ratio = b.dataset.r; ctx.store.set('ratio', ratio); layout(); });
      root.querySelectorAll('[data-t]').forEach(b => b.onclick = () => { timer = +b.dataset.t; ctx.store.set('timer', timer); layout(); });
      root.querySelector('[data-f]').onclick = () => { useFrame = !useFrame; ctx.store.set('frame', useFrame); layout(); };
      root.querySelector('[data-x]').onclick = () => setOpen(false);
      root.querySelector('.go').onclick = shoot;
      addEventListener('resize', layout);
    }
    function setOpen(v) {
      if (v === open) return; open = v;
      if (v) { if (!root) build(); root.style.display = ''; hideUI(true); layout(); }
      else { if (root) root.style.display = 'none'; hideUI(false); }
    }
    const sleep = ms => new Promise(r => setTimeout(r, ms));
    async function shoot() {
      if (busy) return; busy = true;
      const cd = root.querySelector('.cd');
      root.classList.add('hideui');
      for (let t = timer; t > 0; t--) { cd.textContent = t; await sleep(1000); }
      cd.textContent = '';
      const r = boxRect(), u = useFrame ? frameUrl(ratio) : null;
      const frameImg = u ? await new Promise(res => { const im = new Image(); im.onload = () => res(im); im.onerror = () => res(null); im.src = u; }) : null;
      root.querySelector('.box').style.visibility = 'hidden';
      const blob = await new Promise(res => {
        window.__shot = () => {
          const cv = canvas(), sx = cv.width / innerWidth, sy = cv.height / innerHeight;
          const out = document.createElement('canvas'), scale = Math.max(1, 1080 / Math.min(r.w * sx, r.h * sy));
          out.width = Math.round(r.w * sx * scale); out.height = Math.round(r.h * sy * scale);
          const g = out.getContext('2d'); g.imageSmoothingQuality = 'high';
          g.drawImage(cv, r.x * sx, r.y * sy, r.w * sx, r.h * sy, 0, 0, out.width, out.height);
          if (frameImg) g.drawImage(frameImg, 0, 0, out.width, out.height);
          out.toBlob(res, 'image/png');
        };
      });
      root.querySelector('.box').style.visibility = '';
      const fl = root.querySelector('.fl'); fl.style.transition = 'none'; fl.style.opacity = '0.9';
      requestAnimationFrame(() => { fl.style.transition = ''; fl.style.opacity = '0'; });
      try { SFX.play('shutter'); } catch (e) {}
      root.classList.remove('hideui');
      const name = 'vy-bin-' + (season() || 'anh') + '-' + new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-') + '.png';
      const file = blob ? new File([blob], name, {type: 'image/png'}) : null;
      let shared = false;
      if (file && navigator.canShare && navigator.canShare({files: [file]}) && /Mobi|Android|iPhone|iPad/i.test(navigator.userAgent)) {
        try { await navigator.share({files: [file], title: 'Vy & Bin'}); shared = true; } catch (e) {}
      }
      if (!shared && blob) { const a = document.createElement('a'); a.download = name; a.href = URL.createObjectURL(blob); a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 4000); }
      ctx.toast(blob ? '📸 Đã lưu ảnh' : 'Không chụp được ảnh');
      busy = false;
    }
    ctx.ui.addButton({icon: '📸', label: 'Chụp ảnh', title: 'Chế độ chụp ảnh (ẩn giao diện, khung 9:16 / 1:1, viền mùa lễ)', onClick: () => setOpen(!open)});
    const cam = document.getElementById('iCam'); if (cam) cam.onclick = () => setOpen(true);
    addEventListener('keydown', e => { if (e.key === 'Escape' && open) setOpen(false); });
    // ghim photobooth trong đồ trang trí mùa lễ
    const prev = window.__vySpot;
    window.__vySpot = (id, d) => { if (id === 'photobooth') { setOpen(true); return true; } return prev ? prev(id, d) : false; };
  },
};
