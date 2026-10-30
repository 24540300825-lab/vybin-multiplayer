// Nút tương tác "ghim" vào vị trí 3D của vật thể (ghế, giường, TV, cửa) — Figma: pin giọt nước 63×76, vòng trắng, đĩa cam nhạt, icon nâu.
// Mỗi khung hình: chiếu toạ độ 3D của vật thể ra màn hình → đặt nút đúng chỗ (không méo, không phối cảnh — chỉ bám vị trí, kích thước cố định).
// Chỉ dùng transform/opacity. Bấm nút → gọi đúng lệnh của nhân vật (đi tới ghế rồi ngồi, lên giường nằm ngủ…).
import * as THREE from 'three';

// Pin + 4 icon lấy NGUYÊN từ Figma (file SVG trong assets/ui/pins/). Vị trí/kích thước icon trong pin 63×76 đúng theo Figma.
const IMG = {   // [file, left, top, width, height] (px thiết kế)
  chair: ['chair', 9, 8, 46, 46],
  tv: ['tv', 8, 10, 48, 48],
  sleep: ['sleep', 8, 0, 52, 52],
  door: ['door', 12.5, 8.5, 40, 41],
};
const rem = n => (n / 16) + 'rem';
const icon = k => { const [f, l, t, w, h] = IMG[k]; return '<img class="pi" alt="" draggable="false" src="assets/ui/pins/' + f + '.svg" style="left:' + rem(l) + ';top:' + rem(t) + ';width:' + rem(w) + ';height:' + rem(h) + '">'; };

export function initPins({camera, items}) {
  const root = document.createElement('div');
  root.id = 'pins'; root.setAttribute('aria-label', 'Điểm tương tác');
  document.body.appendChild(root);
  const v = new THREE.Vector3();
  const pins = items.map((it, i) => {
    const b = document.createElement('button');
    b.type = 'button'; b.className = 'pin off'; b.dataset.k = it.key;
    b.style.setProperty('--pd', (i * -0.6) + 's');
    b.innerHTML = '<span class="pw"><span class="pq"><img class="pt" alt="" draggable="false" src="assets/ui/pins/pin-tail.svg"><i class="pf"></i><img class="pg" alt="" draggable="false" src="assets/ui/pins/pin-body.svg"><i class="pd"></i>' + icon(it.icon) + '<i class="pr"></i></span><span class="pl"></span></span>';
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
