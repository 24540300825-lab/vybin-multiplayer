// Khung "Nhạc YouTube": video nhúng + dán link + playlist + danh sách bài.
const esc = s => String(s).replace(/[&<>"]/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;'}[c]));
export function mountYtUi(M, {onPick, onToggleOpen} = {}) {
  const el = document.createElement('div'); el.id = 'hYt'; el.className = 'hud glass';
  el.innerHTML = `<div class="yH"><b>📺 Nhạc YouTube</b><span style="flex:1"></span><button class="pl" id="yMin" title="Thu nhỏ video">–</button><button class="pl" id="yX" title="Đóng (nhạc vẫn phát)">✕</button></div>
  <div class="yV" id="yV"><div class="yNo">Dán link video/playlist YouTube bên dưới rồi bấm ▶</div></div>
  <div class="yNow" id="yNow"></div>
  <div class="yA"><input id="yIn" placeholder="Dán link YouTube (video hoặc playlist)…" autocomplete="off"><button class="pl" id="yAdd">Thêm</button></div>
  <div class="yA"><button class="pl" id="ySr" title="Mở YouTube trong tab mới để tìm nhạc, rồi copy link dán vào đây">🔎 Tìm nhạc trên YouTube</button><button class="pl" id="ySh" title="Phát ngẫu nhiên">🔀</button><button class="pl" id="yRp" title="Lặp lại playlist">🔁</button></div>
  <div class="yA"><select id="yPl"></select><button class="pl" id="yNew" title="Playlist mới">＋</button><button class="pl" id="yRn" title="Đổi tên">✎</button><button class="pl" id="yDl" title="Xoá playlist">🗑</button></div>
  <div class="yL" id="yL"></div>
  <div class="yF"><span>Chỉ phát qua trình nhúng của YouTube — không tải file nhạc về (trái điều khoản YouTube). Thư viện lưu trên máy bạn.</span><button class="pl" id="yEx" title="Sao lưu thư viện ra file">⬇</button><button class="pl" id="yIm" title="Nạp thư viện từ file">⬆</button></div>`;
  document.body.appendChild(el);
  const $ = id => el.querySelector('#' + id);
  M.mount($('yV'));
  let small = false;
  const render = () => {
    const L = M.lib; const pl = L.pls[L.pl];
    $('yPl').innerHTML = L.pls.map((p, i) => `<option value="${i}"${i === L.pl ? ' selected' : ''}>${esc(p.name)} (${p.items.length})</option>`).join('');
    $('yL').innerHTML = pl.items.length ? pl.items.map((x, i) => `<div class="yI${i === L.i ? ' cur' : ''}" data-i="${i}"><span class="n">${i === L.i && M.playing ? '▶' : i + 1}</span><span class="t">${esc(x.t)}</span><button class="x" data-x="${i}" title="Bỏ khỏi playlist">✕</button></div>`).join('') : '<div class="yE">Chưa có bài nào.</div>';
    $('yNow').textContent = M.title ? '♪ ' + M.title : '';
    $('ySh').classList.toggle('on', L.shuffle); $('yRp').classList.toggle('on', L.rep);
  };
  $('yL').onclick = e => {
    const x = e.target.closest('[data-x]'); if (x) { M.remove(+x.dataset.x); return; }
    const r = e.target.closest('[data-i]'); if (r) onPick && onPick(+r.dataset.i);
  };
  const doAdd = async () => { const v = $('yIn').value; if (!v.trim()) return; $('yAdd').disabled = true; const n = await M.add(v); $('yAdd').disabled = false; if (n) { $('yIn').value = ''; if (!M.curItem && !M.playing) onPick && onPick(0); } };
  $('yAdd').onclick = doAdd; $('yIn').onkeydown = e => { e.stopPropagation(); if (e.key === 'Enter') doAdd(); }; $('yIn').onkeyup = e => e.stopPropagation();
  $('ySr').onclick = () => window.open('https://www.youtube.com/results?search_query=' + encodeURIComponent($('yIn').value.trim() && !/^https?:|youtu/i.test($('yIn').value) ? $('yIn').value.trim() : 'lofi hip hop'), '_blank', 'noopener');
  $('ySh').onclick = () => M.setShuffle(!M.lib.shuffle); $('yRp').onclick = () => M.setRep(!M.lib.rep);
  $('yPl').onchange = e => M.selectPl(+e.target.value);
  $('yNew').onclick = () => { const n = prompt('Tên playlist mới:'); if (n !== null) M.newPl(n); };
  $('yRn').onclick = () => { const n = prompt('Đổi tên playlist:', M.lib.pls[M.lib.pl].name); if (n !== null) M.renamePl(n); };
  $('yDl').onclick = () => { if (confirm('Xoá playlist "' + M.lib.pls[M.lib.pl].name + '"?')) M.deletePl(); };
  $('yEx').onclick = () => { const a = document.createElement('a'); a.download = 'vy-playlists.json'; a.href = URL.createObjectURL(new Blob([M.exportJSON()], {type: 'application/json'})); a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 4000); };
  $('yIm').onclick = () => { const f = document.createElement('input'); f.type = 'file'; f.accept = '.json,application/json'; f.onchange = async () => { const t = await f.files[0].text(); alert(M.importJSON(t) ? 'Đã nạp playlist' : 'File không đúng định dạng'); }; f.click(); };
  $('yMin').onclick = () => { small = !small; el.classList.toggle('sm', small); };
  $('yX').onclick = () => api.open(false);
  const api = { el, render, open(v) { el.classList.toggle('on', v === undefined ? !el.classList.contains('on') : v); onToggleOpen && onToggleOpen(el.classList.contains('on')); }, get isOpen() { return el.classList.contains('on'); } };
  render(); return api;
}
