// Nút tương tác "ghim" vào vị trí 3D của vật thể (ghế, giường, TV, cửa) — Figma: pin giọt nước 63×76, vòng trắng, đĩa cam nhạt, icon nâu.
// Mỗi khung hình: chiếu toạ độ 3D của vật thể ra màn hình → đặt nút đúng chỗ (không méo, không phối cảnh — chỉ bám vị trí, kích thước cố định).
// Chỉ dùng transform/opacity. Bấm nút → gọi đúng lệnh của nhân vật (đi tới ghế rồi ngồi, lên giường nằm ngủ…).
import * as THREE from 'three';

const ICON = {
  // 48×48, nét nâu #914a14, nền #e9b96b (theo icon Figma: andrsrxn:chair-office, cuida:tv-outline, icon-park:sleep-one, andrsrxn:door-in)
  chair: '<rect x="14" y="5" width="20" height="17" rx="5"/><rect x="11" y="24" width="26" height="7" rx="3"/><path d="M24 31v7M14 43l10-5 10 5" fill="none"/>',
  tv: '<rect x="5" y="9" width="38" height="25" rx="4"/><path d="M17 40h14M24 34v6" fill="none"/>',
  sleep: '<path d="M9 8h12L9 22h12M27 20h9l-9 10h9M33 5h6l-6 7h6" fill="none"/>',
  door: '<path d="M26 8H13a2 2 0 0 0-2 2v28a2 2 0 0 0 2 2h13" fill="none"/><path d="M26 8l9 4v26l-9 2z"/><path d="M5 24h15M15 18l-6 6 6 6" fill="none"/>',
};
const svg = k => '<svg viewBox="0 0 48 48" width="100%" height="100%" aria-hidden="true">' + ICON[k] + '</svg>';

export function initPins({camera, items}) {
  const root = document.createElement('div');
  root.id = 'pins'; root.setAttribute('aria-label', 'Điểm tương tác');
  document.body.appendChild(root);
  const v = new THREE.Vector3();
  const pins = items.map((it, i) => {
    const b = document.createElement('button');
    b.type = 'button'; b.className = 'pin off'; b.dataset.k = it.key;
    b.style.setProperty('--pd', (i * -0.6) + 's');
    b.innerHTML = '<span class="pw"><span class="pb"><span class="pc">' + svg(it.icon) + '</span><span class="pt"></span><span class="pr"></span></span><span class="pl"></span></span>';
    const lab = b.querySelector('.pl');
    b.onclick = e => {
      e.stopPropagation();
      b.classList.remove('pop'); void b.offsetWidth; b.classList.add('pop');     // gợn sóng phản hồi khi bấm
      it.act();
    };
    root.appendChild(b);
    return {it, b, lab, x: -1e4, y: -1e4, vis: false, on: null, txt: null};
  });
  function update() {
    const W = innerWidth, H = innerHeight;
    for (const p of pins) {
      const t = p.it.at();
      if (!t) { if (p.vis) { p.vis = false; p.b.classList.add('off') } continue; }
      v.copy(t).project(camera);
      const x = (v.x * 0.5 + 0.5) * W, y = (-v.y * 0.5 + 0.5) * H;
      const ok = v.z < 1 && x > -40 && x < W + 40 && y > -20 && y < H + 120;
      if (ok !== p.vis) { p.vis = ok; p.b.classList.toggle('off', !ok) }
      if (!ok) continue;
      if (Math.abs(x - p.x) > 0.05 || Math.abs(y - p.y) > 0.05) { p.x = x; p.y = y; p.b.style.transform = 'translate3d(' + x.toFixed(1) + 'px,' + y.toFixed(1) + 'px,0)' }
      const st = p.it.state ? p.it.state() : null;
      const on = !!(st && st.on);
      if (on !== p.on) { p.on = on; p.b.classList.toggle('on', on) }
      const txt = (st && st.label) || p.it.label;
      if (txt !== p.txt) { p.txt = txt; p.lab.textContent = txt; p.b.setAttribute('aria-label', txt) }
    }
  }
  return {update, root};
}
