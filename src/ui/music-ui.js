// Khung "Nhạc YouTube": video nhúng + TÌM NHẠC NGAY TRONG GAME + playlist. Giao diện: ui.css (#hYt). Nằm trong cột nhạc #hMusic (trên pill nhạc).
// Một ô nhập duy nhất: gõ tên bài/ca sĩ → ra danh sách (ảnh, tên, kênh, thời lượng) → bấm ▶ phát ngay hoặc + thêm vào playlist.
// Dán link YouTube (video/playlist) vào cùng ô đó vẫn được.
import {ic} from './icons.js';
import {parseYouTube} from '../music-yt.js';
const esc = s => String(s).replace(/[&<>"]/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;'}[c]));
const SUGGEST = ['lofi hip hop', 'nhạc chill', 'acoustic cover', 'piano thư giãn', 'jazz cafe', 'nhạc Trịnh', 'city pop', 'rain sounds'];
export function mountYtUi(M, {onPick, onToggleOpen} = {}) {
  const el = document.createElement('div'); el.id = 'hYt'; el.className = 'hud panel';
  el.innerHTML = `<div class="yH"><b>${ic('youtube')} Nhạc YouTube</b><span class="sp"></span><button class="rb" id="yMin" title="Thu nhỏ video" aria-label="Thu nhỏ video">${ic('minus')}</button><button class="rb" id="yX" title="Đóng (nhạc vẫn phát)" aria-label="Đóng">${ic('x')}</button></div>
  <div class="yV" id="yV"><div class="yNo">Tìm một bài ở bên dưới rồi bấm ▶</div></div>
  <div class="yNow" id="yNow"></div>
  <div class="yTabs" role="tablist"><button class="on" data-t="s" role="tab">${ic('search')} Tìm nhạc</button><button data-t="p" role="tab" id="yTabP">Playlist</button></div>
  <div class="yTab" id="tS">
    <div class="yA"><input id="yIn" type="search" placeholder="Tìm bài hát, ca sĩ… hoặc dán link YouTube" autocomplete="off" enterkeyhint="search"><button class="pb" id="yGo">Tìm</button></div>
    <div class="yCh" id="yCh">${SUGGEST.map(s => `<button class="chip" data-q="${esc(s)}">${esc(s)}</button>`).join('')}</div>
    <div class="yR" id="yR"></div>
  </div>
  <div class="yTab" id="tP" hidden>
    <div class="yA"><select id="yPl"></select><button class="pl" id="yNew" title="Playlist mới">${ic('plus')}</button><button class="pl" id="yRn" title="Đổi tên">${ic('pencil')}</button><button class="pl" id="yDl" title="Xoá playlist">${ic('trash')}</button></div>
    <div class="yA"><button class="pl" id="ySh" title="Phát ngẫu nhiên">${ic('shuffle')} Ngẫu nhiên</button><button class="pl" id="yRp" title="Lặp lại playlist">${ic('repeat')} Lặp lại</button></div>
    <div class="yL" id="yL"></div>
  </div>
  <div class="yF"><span>Chỉ phát qua trình nhúng của YouTube, không tải file nhạc về. Playlist lưu trên máy bạn — nhạc của mỗi người phát riêng trên máy người đó.</span><button class="pl" id="yEx" title="Sao lưu thư viện ra file">${ic('download')}</button><button class="pl" id="yIm" title="Nạp thư viện từ file">${ic('upload')}</button></div>`;
  (document.getElementById('hMusic') || document.body).prepend(el);
  const $ = id => el.querySelector('#' + id);
  M.mount($('yV'));
  let small = false, seq = 0, last = [], lastQ = '', tab = 's';

  const setTab = t => {
    tab = t; el.querySelectorAll('.yTabs button').forEach(b => b.classList.toggle('on', b.dataset.t === t));
    $('tS').hidden = t !== 's'; $('tP').hidden = t !== 'p';
  };
  el.querySelector('.yTabs').onclick = e => { const b = e.target.closest('button[data-t]'); if (b) setTab(b.dataset.t); };

  const renderResults = () => {
    const box = $('yR');
    if (!last.length) return;
    box.innerHTML = last.map(x => {
      const have = M.has(x.id);
      return `<div class="yS" data-id="${x.id}"><img loading="lazy" decoding="async" alt="" src="https://i.ytimg.com/vi/${x.id}/mqdefault.jpg" width="96" height="54"><div class="m"><b title="${esc(x.t)}">${esc(x.t)}</b><small>${esc(x.c || '')}${x.d ? ' · ' + esc(x.d) : ''}</small></div><button class="rb pn" data-p="${x.id}" title="Phát ngay" aria-label="Phát ngay">${ic('play')}</button><button class="rb ad${have ? ' ok' : ''}" data-a="${x.id}" title="${have ? 'Đã có trong playlist' : 'Thêm vào playlist'}" aria-label="Thêm vào playlist">${ic(have ? 'check' : 'plus')}</button></div>`;
    }).join('');
  };
  const note = (html) => { $('yR').innerHTML = `<div class="yE">${html}</div>`; };

  async function doSearch(q) {
    q = q.trim(); if (!q) return;
    const link = parseYouTube(q);
    if (link) {                                   // dán link → thêm thẳng như trước
      $('yGo').disabled = true; const n = await M.add(q); $('yGo').disabled = false;
      if (n) { $('yIn').value = ''; note('Đã thêm ' + n + ' bài vào playlist “' + esc(M.lib.pls[M.lib.pl].name) + '”.'); if (!M.curItem && !M.playing) onPick && onPick(0); }
      return;
    }
    const my = ++seq; lastQ = q; $('yGo').disabled = true;
    $('yR').innerHTML = '<div class="yE"><i class="lspin" aria-hidden="true"></i> Đang tìm “' + esc(q) + '”…</div>';
    try {
      const items = await M.search(q);
      if (my !== seq) return;
      last = items;
      if (!items.length) note('Không thấy kết quả cho “' + esc(q) + '”. Thử từ khoá khác nhé.'); else { $('yR').scrollTop = 0; renderResults(); }
    } catch (e) { if (my === seq) note(esc(e.message || 'Không tìm được')); }
    finally { if (my === seq) $('yGo').disabled = false; }
  }
  $('yGo').onclick = () => doSearch($('yIn').value);
  $('yIn').onkeydown = e => { e.stopPropagation(); if (e.key === 'Enter') doSearch($('yIn').value); };
  $('yIn').onkeyup = e => e.stopPropagation();
  $('yCh').onclick = e => { const b = e.target.closest('[data-q]'); if (b) { $('yIn').value = b.dataset.q; doSearch(b.dataset.q); } };
  $('yR').onclick = e => {
    const p = e.target.closest('[data-p]'), a = e.target.closest('[data-a]');
    const id = (p || a) && (p || a).dataset[p ? 'p' : 'a']; if (!id) return;
    const it = last.find(x => x.id === id); if (!it) return;
    const i = M.addItem(it);
    if (p) { onPick && onPick(i); setTab('s'); } else { renderResults(); }
  };

  const render = () => {
    const L = M.lib; const pl = L.pls[L.pl];
    $('yPl').innerHTML = L.pls.map((p, i) => `<option value="${i}"${i === L.pl ? ' selected' : ''}>${esc(p.name)} (${p.items.length})</option>`).join('');
    $('yTabP').textContent = 'Playlist (' + pl.items.length + ')';
    $('yL').innerHTML = pl.items.length ? pl.items.map((x, i) => `<div class="yI${i === L.i ? ' cur' : ''}" data-i="${i}"><span class="n">${i === L.i && M.playing ? ic('play') : i + 1}</span><span class="t">${esc(x.t)}${x.d ? ' <small>' + esc(x.d) + '</small>' : ''}</span><button class="x" data-x="${i}" title="Bỏ khỏi playlist">${ic('x')}</button></div>`).join('') : '<div class="yE">Chưa có bài nào — qua tab “Tìm nhạc” để thêm.</div>';
    $('yNow').textContent = M.title ? '♪ ' + M.title : '';
    $('ySh').classList.toggle('on', L.shuffle); $('yRp').classList.toggle('on', L.rep);
    if (last.length && tab === 's') { const st = $('yR').scrollTop; renderResults(); $('yR').scrollTop = st; }
  };
  $('yL').onclick = e => {
    const x = e.target.closest('[data-x]'); if (x) { M.remove(+x.dataset.x); return; }
    const r = e.target.closest('[data-i]'); if (r) onPick && onPick(+r.dataset.i);
  };
  $('ySh').onclick = () => M.setShuffle(!M.lib.shuffle); $('yRp').onclick = () => M.setRep(!M.lib.rep);
  $('yPl').onchange = e => M.selectPl(+e.target.value);
  $('yNew').onclick = () => { const n = prompt('Tên playlist mới:'); if (n !== null) M.newPl(n); };
  $('yRn').onclick = () => { const n = prompt('Đổi tên playlist:', M.lib.pls[M.lib.pl].name); if (n !== null) M.renamePl(n); };
  $('yDl').onclick = () => { if (confirm('Xoá playlist "' + M.lib.pls[M.lib.pl].name + '"?')) M.deletePl(); };
  $('yEx').onclick = () => { const a = document.createElement('a'); a.download = 'vy-playlists.json'; a.href = URL.createObjectURL(new Blob([M.exportJSON()], {type: 'application/json'})); a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 4000); };
  $('yIm').onclick = () => { const f = document.createElement('input'); f.type = 'file'; f.accept = '.json,application/json'; f.onchange = async () => { const t = await f.files[0].text(); alert(M.importJSON(t) ? 'Đã nạp playlist' : 'File không đúng định dạng'); }; f.click(); };
  $('yMin').onclick = () => { small = !small; el.classList.toggle('sm', small); };
  $('yX').onclick = () => api.open(false);
  const api = { el, render, open(v) { el.classList.toggle('on', v === undefined ? !el.classList.contains('on') : v); onToggleOpen && onToggleOpen(el.classList.contains('on')); if (el.classList.contains('on') && tab === 's') setTimeout(() => { try { $('yIn').focus({preventScroll: true}); } catch (e) {} }, 60); }, get isOpen() { return el.classList.contains('on'); }, setTab };
  render();
  if (!M.lib.pls[M.lib.pl].items.length) note('Chưa có bài nào. Gõ tên bài hát / ca sĩ ở trên rồi bấm Tìm, hoặc chọn một gợi ý.'); else setTab('p');
  return api;
}
