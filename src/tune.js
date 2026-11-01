// Bảng chỉnh màu nhanh cho map ngoài vườn — chỉ hiện khi URL có ?tune (ví dụ …/?tune=1#map=exterior).
// Chỉnh: màu nền (nhân) + biến thiên ngẫu nhiên (hue / độ sáng) của cây-lá-hoa & cỏ, màu đá. Lưu localStorage, nút "Sao chép" để gửi lại giá trị.
import * as THREE from 'three';

const KEY = 'vyTune1';
export function mountTune(EXT, FU) {
  const def = {fol: '#ffffff', folH: 0.05, folV: 0.14, gr: '#ffffff', grH: 0.04, grV: 0.10, rock: '#' + new THREE.Color().setRGB(0.86, 0.84, 0.74).getHexString(), path: '#' + new THREE.Color().setRGB(0.86, 0.84, 0.74).getHexString()};
  let v = {...def};
  try { Object.assign(v, JSON.parse(localStorage.getItem(KEY) || '{}')); } catch (e) {}
  const apply = () => {
    FU.uFolTint.value.set(v.fol); FU.uFolVar.value.set(v.folH, v.folV);
    FU.uGrTint.value.set(v.gr); FU.uGrVar.value.set(v.grH, v.grV);
    EXT.tintMats.rock.forEach(m => m.color.set(v.rock)); EXT.tintMats.path.forEach(m => m.color.set(v.path));
    try { localStorage.setItem(KEY, JSON.stringify(v)); } catch (e) {}
  };
  apply();
  const el = document.createElement('div');
  el.style.cssText = 'position:fixed;left:10px;top:96px;z-index:99999;width:230px;max-height:calc(100% - 120px);overflow:auto;background:rgba(24,30,22,.88);color:#eef3e6;font:12px system-ui,sans-serif;border-radius:10px;padding:8px 10px;backdrop-filter:blur(6px)';
  const rows = [
    ['Cây / lá / hoa', null],
    ['Màu nền (nhân)', 'fol', 'color'], ['Biến thiên hue', 'folH', [0, 0.3, 0.005]], ['Biến thiên sáng', 'folV', [0, 0.6, 0.01]],
    ['Cỏ', null],
    ['Màu nền (nhân)', 'gr', 'color'], ['Biến thiên hue', 'grH', [0, 0.3, 0.005]], ['Biến thiên sáng', 'grV', [0, 0.6, 0.01]],
    ['Đá', null], ['Đá rời', 'rock', 'color'], ['Đá dẫn đường', 'path', 'color'],
  ];
  let h = '<div style="display:flex;justify-content:space-between;align-items:center;font-weight:650;cursor:pointer" id="tnHead"><span>🎨 Chỉnh màu</span><span id="tnTog">▾</span></div><div id="tnBody">';
  for (const r of rows) {
    if (r[1] === null) { h += `<div style="margin:8px 0 2px;color:#9fd36a;font-weight:600">${r[0]}</div>`; continue; }
    const [lab, k, t] = r;
    h += t === 'color'
      ? `<label style="display:flex;justify-content:space-between;align-items:center;margin:3px 0">${lab}<input data-k="${k}" type="color" value="${v[k]}"></label>`
      : `<label style="display:block;margin:3px 0">${lab} <output data-o="${k}" style="float:right;opacity:.8">${v[k]}</output><input data-k="${k}" type="range" min="${t[0]}" max="${t[1]}" step="${t[2]}" value="${v[k]}" style="width:100%"></label>`;
  }
  h += '<div style="display:flex;gap:6px;margin-top:8px"><button id="tnRst">Đặt lại</button><button id="tnCp">Sao chép giá trị</button></div></div>';
  el.innerHTML = h; document.body.appendChild(el);
  el.addEventListener('pointerdown', e => e.stopPropagation()); el.addEventListener('wheel', e => e.stopPropagation());
  el.querySelectorAll('input').forEach(i => i.oninput = () => {
    const k = i.dataset.k; v[k] = i.type === 'range' ? +i.value : i.value;
    const o = el.querySelector(`[data-o="${k}"]`); if (o) o.textContent = v[k];
    apply();
  });
  el.querySelector('#tnHead').onclick = () => { const b = el.querySelector('#tnBody'); const c = b.style.display === 'none'; b.style.display = c ? '' : 'none'; el.querySelector('#tnTog').textContent = c ? '▾' : '▸'; };
  el.querySelector('#tnRst').onclick = () => { v = {...def}; el.querySelectorAll('input').forEach(i => { i.value = v[i.dataset.k]; const o = el.querySelector(`[data-o="${i.dataset.k}"]`); if (o) o.textContent = v[i.dataset.k]; }); apply(); };
  el.querySelector('#tnCp').onclick = () => { const t = JSON.stringify(v); try { navigator.clipboard.writeText(t); } catch (e) {} el.querySelector('#tnCp').textContent = 'Đã chép ✓'; setTimeout(() => el.querySelector('#tnCp').textContent = 'Sao chép giá trị', 1500); };
}
