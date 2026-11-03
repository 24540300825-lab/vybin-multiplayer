// Giao diện tiến trình (Đợt 1): cấp + XP + Xu trên thẻ hồ sơ, nút Hồ sơ (Tổng quan / Hộp quà / Kỹ năng / Thành tựu / Lịch sử),
// nút Tập trung (phiên 25/50 phút, đếm giờ nổi), thông báo nhận thưởng. Chỉ đọc dữ liệu từ Progress (máy chủ), không tự tính số dư.
import {ic} from './icons.js';
import {fmtItems, curName} from '../net/progress.js';
import {Notify} from './notify.js';

const $ = id => document.getElementById(id);
const esc = s => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;'}[c]));
const nf = n => Number(n || 0).toLocaleString('vi-VN');
const ERR = {
  insufficient: 'Không đủ số dư.', too_early: 'Phiên chưa đủ thời gian.', not_running: 'Phiên này đã kết thúc.',
  title_locked: 'Chưa mở khoá danh hiệu này.', no_player: 'Chưa có nhân vật.', bad_length: 'Thời lượng không hợp lệ.',
};
const errText = e => { const m = String(e && e.message || e); const k = Object.keys(ERR).find(k => m.includes(k)); return k ? ERR[k] : 'Có lỗi, thử lại sau. (' + m + ')'; };

export function mountProgressUi({prog, toast, sess}) {
  // ---------- thẻ hồ sơ: cấp thật + thanh XP + Xu + danh hiệu ----------
  const hd = document.querySelector('#hProf .hd');
  if (hd && !$('pXu')) hd.insertAdjacentHTML('beforeend', '<span class="xu" id="pXu" title="Xu của bạn"></span>');
  const pbody = document.querySelector('#hProf .pbody');
  if (pbody && !$('pXpb')) {
    hd.insertAdjacentHTML('afterend', '<div class="pti" id="pTi" hidden></div><div class="xpb" id="pXpb"><i id="pXpF"></i><span id="pXpT"></span></div>');
  }
  // ---------- nút trên thanh trên cùng ----------
  const top = $('hTop');
  if (top && !$('iProg')) {
    const set = $('iSet');
    set.insertAdjacentHTML('beforebegin',
      `<button class="ib" id="iFocus" title="Phiên tập trung" aria-label="Phiên tập trung"><i class="ic">${ic('type')}</i></button>` +
      `<button class="ib" id="iProg" title="Hồ sơ & phần thưởng" aria-label="Hồ sơ và phần thưởng"><i class="ic">${ic('stars')}</i><em class="dot" id="pgDot" hidden></em></button>`);
  }
  // ---------- hộp thoại Hồ sơ ----------
  const m = document.createElement('div'); m.className = 'modal'; m.id = 'hProg'; m.setAttribute('role', 'dialog'); m.setAttribute('aria-modal', 'true'); m.setAttribute('aria-label', 'Hồ sơ');
  m.innerHTML = `<div class="mbox" id="pgBox"><div class="ph"><h2>Hồ sơ</h2><span class="sp"></span><button class="rb" id="pgX" title="Đóng" aria-label="Đóng">${ic('x')}</button></div>
    <div class="chips pg-tabs" id="pgTabs" role="tablist"></div><div id="pgBody"></div></div>`;
  document.body.appendChild(m);
  const TABS = [['sum', 'Tổng quan'], ['inbox', 'Hộp quà'], ['skills', 'Kỹ năng'], ['ach', 'Thành tựu'], ['hist', 'Lịch sử']];
  let tab = 'sum';
  const open = t => { if (t) tab = t; m.classList.add('on'); render(); };
  const close = () => m.classList.remove('on');
  $('iProg').onclick = () => open();
  $('pgX').onclick = close; m.onclick = e => { if (e.target === m) close(); };
  addEventListener('keydown', e => { if (e.code === 'Escape') { close(); fm.classList.remove('on'); } });
  $('pXpb') && ($('pXpb').onclick = () => open('sum'));

  // ---------- hộp thoại Tập trung ----------
  const fm = document.createElement('div'); fm.className = 'modal'; fm.id = 'hFocus'; fm.setAttribute('role', 'dialog'); fm.setAttribute('aria-modal', 'true'); fm.setAttribute('aria-label', 'Phiên tập trung');
  fm.innerHTML = `<div class="mbox" id="fcBox"><div class="ph"><h2>Phiên tập trung</h2><span class="sp"></span><button class="rb" id="fcX" title="Đóng" aria-label="Đóng">${ic('x')}</button></div><div id="fcBody"></div></div>`;
  document.body.appendChild(fm);
  $('fcX').onclick = () => fm.classList.remove('on'); fm.onclick = e => { if (e.target === fm) fm.classList.remove('on'); };
  $('iFocus').onclick = () => { fm.classList.add('on'); renderFocus(); };
  const pill = document.createElement('div'); pill.id = 'fcPill'; pill.className = 'hud'; pill.hidden = true;
  pill.innerHTML = `<span class="ic">${ic('type')}</span><b id="fcT">25:00</b><span id="fcL">Đang tập trung</span><button class="pl" id="fcStop" title="Huỷ phiên">Huỷ</button>`;
  document.body.appendChild(pill);
  $('fcStop').onclick = async () => { if (!confirm('Huỷ phiên tập trung? Phiên huỷ sẽ không được thưởng.')) return; try { await prog.focusCancel(); toast('Đã huỷ phiên'); } catch (e) { toast(errText(e)); } };

  // ---------- vẽ ----------
  function paintCard(d) {
    if (!d) return;
    const L = d.level, span = Math.max(1, L.next - L.floor), into = Math.max(0, L.xp - L.floor);
    $('pLv') && ($('pLv').textContent = 'Lv.' + L.level);
    $('pXu') && ($('pXu').textContent = nf(d.xu) + ' Xu');
    if ($('pXpF')) { $('pXpF').style.width = Math.min(100, into / span * 100).toFixed(1) + '%'; $('pXpT').textContent = nf(into) + ' / ' + nf(span) + ' XP'; $('pXpb').title = 'Còn ' + nf(L.next - L.xp) + ' XP để lên cấp ' + (L.level + 1); }
    const t = d.player.title && (d.achievements || []).find(a => a.id === d.player.title);
    if ($('pTi')) { $('pTi').hidden = !t; $('pTi').textContent = t ? (t.title || t.name) : ''; }
    $('pgDot') && ($('pgDot').hidden = !(d.inbox && d.inbox.length));
  }
  const bar = (v, max, cls = '') => `<div class="pgbar ${cls}"><i style="width:${Math.min(100, max ? v / max * 100 : 0).toFixed(1)}%"></i></div>`;
  function render() {
    const d = prog.me; if (!d) { $('pgBody').innerHTML = '<p class="pg-empty">Đang tải…</p>'; return; }
    $('pgTabs').innerHTML = TABS.map(([k, l]) => `<div class="chip${k === tab ? ' on' : ''}" role="tab" data-t="${k}">${l}${k === 'inbox' && d.inbox.length ? ' · ' + d.inbox.length : ''}</div>`).join('');
    $('pgTabs').onclick = e => { const c = e.target.closest('.chip'); if (c) { tab = c.dataset.t; render(); } };
    const B = $('pgBody');
    if (tab === 'sum') {
      const L = d.level, span = Math.max(1, L.next - L.floor), into = L.xp - L.floor;
      const titles = (d.achievements || []).filter(a => a.done && a.title);
      B.innerHTML = `<div class="pg-hero"><img src="assets/ui/avatars/${d.player.slot}.v1.png" alt="" width="96" height="96"><div><b class="pg-nm">${esc(d.player.name)}</b><small>${esc(d.player.email || '')}</small>
          <div class="pg-lv">Cấp ${L.level} <span>${nf(into)} / ${nf(span)} XP</span></div>${bar(into, span)}</div></div>
        <div class="pg-stats">
          <div class="pg-st"><small>Xu của bạn</small><b>${nf(d.xu)}</b><em>Mua nội thất rời, trang phục, hạt giống (cửa hàng sắp có)</em></div>
          <div class="pg-st"><small>Điểm Kiến Tạo · quỹ chung của nhà</small><b>${nf(d.kt)}</b><em>Cả hai cùng góp để mở rộng nhà</em></div>
          <div class="pg-st"><small>Tổng XP</small><b>${nf(L.xp)}</b><em>Chỉ để lên cấp, không tiêu được</em></div>
        </div>
        ${d.other ? `<p class="pg-other"><img src="assets/ui/avatars/${d.other.slot}.v1.png" alt="" width="32" height="32"> ${esc(d.other.name)} · Cấp ${d.other.level}</p>` : '<p class="pg-other">Người còn lại chưa tạo nhân vật.</p>'}
        <label class="pg-title">Danh hiệu hiển thị <select id="pgTitle"><option value="">(không)</option>${titles.map(a => `<option value="${a.id}"${a.id === d.player.title ? ' selected' : ''}>${esc(a.title)}</option>`).join('')}</select></label>
        ${titles.length ? '' : '<p class="pg-help">Hoàn thành thành tựu có danh hiệu để mở khoá.</p>'}`;
      const sel = $('pgTitle'); if (sel) sel.onchange = async () => { try { await prog.save({title: sel.value}); await prog.refresh(); toast('Đã đổi danh hiệu'); } catch (e) { toast(errText(e)); } };
    } else if (tab === 'inbox') {
      B.innerHTML = d.inbox.length
        ? `<div class="pg-acts"><button class="pb" id="pgAll">Nhận tất cả (${d.inbox.length})</button></div>` + d.inbox.slice().reverse().map(g => `<div class="pg-gift"><span class="ic">${ic('stars')}</span><div><b>${esc(g.title)}</b><small>${esc(g.body || '')}</small><div class="pg-items">${(g.items || []).map(i => `<span class="pg-item${String(i.c).startsWith('soon:') ? ' soon' : ''}">${String(i.c).startsWith('soon:') ? esc(i.label || 'Sắp có') : '+' + nf(i.n) + ' ' + esc(curName(i.c))}</span>`).join('')}</div></div><button class="pl" data-g="${g.id}">Nhận</button></div>`).join('')
        : '<p class="pg-empty">Hộp quà trống. Quà lên cấp, thành tựu và phần thưởng chờ nhận sẽ nằm ở đây.</p>';
      const take = async (id, btn) => { btn.disabled = true; try { const r = await prog.claim(id); if (r && r.kept) setTimeout(() => toast('Túi đầy — còn ' + r.kept + ' quà chờ. Cất bớt đồ vào kho nhà (phím B) rồi nhận lại.'), 1800); else if (!(r && r.items && r.items.length)) toast('Đã nhận'); } catch (e) { toast(errText(e)); btn.disabled = false; } render(); };
      $('pgAll') && ($('pgAll').onclick = e => take(null, e.currentTarget));
      B.querySelectorAll('[data-g]').forEach(b => b.onclick = () => take(b.dataset.g, b));
    } else if (tab === 'skills') {
      B.innerHTML = '<p class="pg-help">Kỹ năng tăng khi bạn làm đúng hoạt động. Cấp kỹ năng mở thêm lựa chọn, không bắt buộc phải cày.</p>' + (d.skills || []).map(s => `<div class="pg-skill${s.live ? '' : ' off'}"><b>${esc(s.name)}</b>${s.live ? `<span>Cấp ${s.level} · ${nf(s.into)}/${nf(s.step)}</span>${bar(s.into, s.step, 'sk')}<small>${s.id === 'creative' ? 'Tăng qua phiên tập trung' : ''}</small>` : '<span class="soon">Sắp có</span>'}</div>`).join('');
    } else if (tab === 'ach') {
      const groups = {}; (d.achievements || []).forEach(a => (groups[a.group || 'Khác'] ||= []).push(a));
      B.innerHTML = Object.entries(groups).map(([g, list]) => `<h4 class="pg-h">${esc(g)}</h4>` + list.map(a => `<div class="pg-ach${a.done ? ' done' : ''}"><span class="ic">${ic(a.done ? 'check' : 'stars')}</span><div><b>${esc(a.name)}</b><small>${esc(a.desc)}${a.title ? ' · Danh hiệu: ' + esc(a.title) : ''}${a.together ? ' · Cùng nhau' : ''}</small>${a.done ? '' : bar(a.progress, a.count || 1)}</div><em>${a.done ? 'Đã đạt' : a.progress + '/' + (a.count || 1)}</em></div>`).join('')).join('');
    } else if (tab === 'hist') {
      B.innerHTML = `<div class="chips" id="pgHw"><div class="chip on" data-h="0">Ví của tôi</div><div class="chip" data-h="1">Quỹ nhà</div></div><div id="pgHl"><p class="pg-empty">Đang tải…</p></div>`;
      const load = async house => {
        $('pgHw').querySelectorAll('.chip').forEach(c => c.classList.toggle('on', c.dataset.h === (house ? '1' : '0')));
        try {
          const rows = await prog.history(house);
          $('pgHl').innerHTML = rows.length ? rows.map(r => `<div class="pg-row"><span class="${r.amount > 0 ? 'pos' : 'neg'}">${r.amount > 0 ? '+' : ''}${nf(r.amount)} ${esc(curName(r.currency))}</span><span>${esc(r.reason)}${house && r.by_slot ? ' · ' + (r.by_slot === 'bin' ? 'Bin' : 'Vy') : ''}</span><small>${new Date(r.created_at).toLocaleString('vi-VN', {hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit'})}</small></div>`).join('') : '<p class="pg-empty">Chưa có giao dịch nào.</p>';
        } catch (e) { $('pgHl').innerHTML = '<p class="pg-empty">' + esc(errText(e)) + '</p>'; }
      };
      $('pgHw').onclick = e => { const c = e.target.closest('.chip'); if (c) load(c.dataset.h === '1'); };
      load(false);
    }
  }

  // ---------- phiên tập trung ----------
  let tick = null, finishing = false;
  function renderFocus() {
    const d = prog.me; const B = $('fcBody'); if (!d) { B.innerHTML = '<p class="pg-empty">Đang tải…</p>'; return; }
    const c = d.focus_cfg || {lengths: [25, 50], per25: {}};
    const per = Object.entries(c.per25 || {}).map(([k, v]) => '+' + v + ' ' + curName(k)).join(' · ');
    if (d.focus) {
      B.innerHTML = `<p class="pg-help">Đang trong phiên ${d.focus.minutes} phút. Cứ làm việc thật, hết giờ game sẽ tự trao thưởng.</p><div class="pg-acts"><button class="pl" id="fcCancel">Huỷ phiên</button></div>`;
      $('fcCancel').onclick = () => $('fcStop').click();
    } else {
      B.innerHTML = `<p class="pg-help">Chọn thời lượng rồi tập trung làm việc thật (vẽ, học, code…). Hết giờ bạn nhận thưởng cho mỗi 25 phút: <b>${esc(per)}</b>. Mỗi ngày được thưởng tối đa ${c.daily_cap_min || 200} phút.</p>
        <div class="pg-acts">${(c.lengths || [25, 50]).map(n => `<button class="pb" data-m="${n}">${n} phút</button>`).join('')}</div>
        <p class="pg-help">Mẹo: ngồi vào bàn làm việc trong studio (phím F) cho đúng không khí.</p>`;
      B.querySelectorAll('[data-m]').forEach(b => b.onclick = async () => { b.disabled = true; try { await prog.focusStart(+b.dataset.m); fm.classList.remove('on'); toast('Bắt đầu phiên ' + b.dataset.m + ' phút'); } catch (e) { toast(errText(e)); b.disabled = false; } });
    }
  }
  function paintFocus(d) {
    clearInterval(tick); tick = null;
    const f = d && d.focus; pill.hidden = !f; $('iFocus').classList.toggle('on', !!f);
    if (!f) return;
    const skew = new Date(d.now).getTime() - Date.now();         // lệch đồng hồ máy so với máy chủ
    const end = new Date(f.ends_at).getTime() - skew;
    const step = async () => {
      const left = Math.max(0, end - Date.now()), s = Math.ceil(left / 1000);
      $('fcT').textContent = String(Math.floor(s / 60)).padStart(2, '0') + ':' + String(s % 60).padStart(2, '0');
      if (left <= 0 && !finishing) {
        finishing = true; clearInterval(tick);
        try {
          const r = await prog.focusFinish(f.id);
          if (!(r && r.granted && r.granted.length)) toast(r && r.paid_minutes === 0 ? 'Xong phiên! Hôm nay đã đủ giới hạn thưởng.' : 'Xong phiên tập trung!');
          window.SFX && window.SFX.play && window.SFX.play('success');
        } catch (e) { toast(errText(e)); setTimeout(() => prog.refresh(), 5000); }
        finishing = false;
      }
    };
    step(); tick = setInterval(step, 1000);
  }

  // ---------- thưởng & thông báo ----------
  let lastLevel = null;
  prog.on('change', d => {
    paintCard(d); paintFocus(d);
    if (m.classList.contains('on') && tab !== 'hist') render();
    if (fm.classList.contains('on')) renderFocus();
    if (lastLevel != null && d.level.level > lastLevel) {
      toast('Lên cấp ' + d.level.level + '! Quà đang chờ trong Hộp quà');
      Notify.add({type: 'peer', title: 'Lên cấp ' + d.level.level, body: 'Mở Hồ sơ → Hộp quà để nhận quà', go: () => open('inbox')});
    }
    lastLevel = d.level.level;
  });
  // gộp thành MỘT thông báo nhanh (ô toast chỉ hiện 1 dòng một lúc); thành tựu còn được lưu trong chuông thông báo
  prog.on('reward', r => {
    const achs = r.achievements || [];
    const parts = [r.label || '', fmtItems(r.granted || r.items), achs.length ? 'Thành tựu mới: ' + achs.map(a => a.name).join(', ') : ''].filter(Boolean);
    if (parts.length) toast(parts.join(' · '));
    achs.forEach(a => Notify.add({type: 'peer', title: 'Thành tựu: ' + a.name, body: 'Phần thưởng đã vào Hộp quà', go: () => open('inbox')}));
  });
  if (prog.me) { paintCard(prog.me); paintFocus(prog.me); lastLevel = prog.me.level.level; }
  return {open};
}
