// Hạng mục 04 + 05: bảng Nhiệm vụ (Hôm nay / Tuần này / Cùng nhau / Hướng dẫn), Túi đồ + Kho nhà, khung hướng dẫn người mới.
// Mọi số liệu từ máy chủ (game_quests / game_bag / game_transfer…). Trình duyệt chỉ vẽ và báo sự kiện (moved, open_bag, open_quests).
// Phím tắt: B = túi đồ, J = nhiệm vụ. Bỏ lỡ nhiệm vụ không bị phạt — hết ngày/tuần thì bộ mới tự thay.
import {ic} from './icons.js';
import {ITEMS, curName, fmtItems} from '../net/progress.js';
import {Notify} from './notify.js';
import {createShop} from './shop-ui.js';

const $ = id => document.getElementById(id);
const esc = s => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;'}[c]));
const nf = n => Number(n || 0).toLocaleString('vi-VN');
const ERR = {
  bag_full: 'Túi đầy — cất bớt đồ vào kho nhà nhé.', house_full: 'Kho nhà đã đầy.', insufficient: 'Không đủ số lượng.',
  quest_expired: 'Nhiệm vụ này đã hết hạn.', not_for_sale: 'Món này hiện không bán.', level_locked: 'Chưa đủ cấp để mở món này.',
  week_limit: 'Đã đạt giới hạn mua trong tuần.', not_sellable: 'Món này không bán được.', bad_recipe: 'Công thức không hợp lệ.', missing: 'Thiếu nguyên liệu.', not_done: 'Chưa hoàn thành.', bad_item: 'Vật phẩm không hợp lệ.', bad_amount: 'Số lượng không hợp lệ.',
};
const errText = e => { const m = String(e && e.message || e); const k = Object.keys(ERR).find(k => m.includes(k)); return k ? ERR[k] : 'Có lỗi, thử lại sau. (' + m + ')'; };
const RAR = {common: 'Thường', uncommon: 'Khá', rare: 'Hiếm', epic: 'Quý', legend: 'Huyền thoại'};
const left = (iso, skew) => {
  const ms = Math.max(0, new Date(iso).getTime() - skew - Date.now()), h = Math.floor(ms / 3600000), m = Math.floor(ms % 3600000 / 60000);
  return h >= 24 ? Math.floor(h / 24) + ' ngày ' + (h % 24) + ' giờ' : h ? h + ' giờ ' + m + ' phút' : m + ' phút';
};
const day = () => { const d = new Date(); return d.getFullYear() + '-' + (d.getMonth() + 1) + '-' + d.getDate(); };
const userKeys = () => { try { return Object.values(JSON.parse(localStorage.getItem('vyKeys') || '{}')); } catch (e) { return []; } };
const rewardChips = list => (list || []).filter(i => !String(i.c).startsWith('soon:')).map(i => {
  const it = String(i.c).startsWith('item:') && ITEMS[i.c.slice(5)];
  return `<span class="pg-item">${it ? esc(it.icon || '') + ' ' : ''}+${nf(i.n)} ${esc(curName(i.c))}</span>`;
}).join('');

function modal(id, title, w) {
  const m = document.createElement('div'); m.className = 'modal'; m.id = id; m.setAttribute('role', 'dialog'); m.setAttribute('aria-modal', 'true'); m.setAttribute('aria-label', title);
  m.innerHTML = `<div class="mbox"${w ? ` style="width:min(${w},100%)"` : ''}><div class="ph"><h2>${title}</h2><span class="sp"></span><span class="qx-sub"></span><button class="rb" title="Đóng" aria-label="Đóng">${ic('x')}</button></div><div class="chips pg-tabs" role="tablist"></div><div class="qx-body"></div></div>`;
  document.body.appendChild(m);
  const close = () => m.classList.remove('on');
  m.querySelector('.ph .rb').onclick = close; m.onclick = e => { if (e.target === m) close(); };
  return {m, close, tabs: m.querySelector('.pg-tabs'), body: m.querySelector('.qx-body'), sub: m.querySelector('.qx-sub'), isOn: () => m.classList.contains('on')};
}

export function mountQuestsUi({prog, toast, api, mapId}) {
  // báo sự kiện; nếu bước hướng dẫn đang chờ đúng sự kiện này thì dùng khoá riêng (để lần mở trước đó trong ngày không làm kẹt hướng dẫn)
  const rep = (kind, base) => prog.report(kind, {}, base + (tutCur && tutCur.event === kind ? ':t' + tutCur.step : ''));
  // ---------- nút trên thanh trên cùng ----------
  const anchor = $('iFocus') || $('iSet');
  if (anchor && !$('iBag')) anchor.insertAdjacentHTML('beforebegin',
    `<button class="ib" id="iQuest" title="Nhiệm vụ (J)" aria-label="Nhiệm vụ"><i class="ic">${ic('flag')}</i><em class="dot" id="qDot" hidden></em></button>` +
    `<button class="ib" id="iBag" title="Túi đồ (B)" aria-label="Túi đồ"><i class="ic">${ic('bag')}</i></button>`);

  let Q = null, skew = 0, qTab = 'daily';
  const QM = modal('hQuest', 'Nhiệm vụ', '40rem'), BM = modal('hBag', 'Túi đồ', '44rem');

  // ======================= NHIỆM VỤ =======================
  async function loadQuests() {
    try { Q = await prog.quests(); skew = new Date(Q.now).getTime() - Date.now(); } catch (e) { console.warn('[quests]', e); }
    autoClaimTutorial(); paintTut(); if (QM.isOn()) renderQuests();
    return Q;
  }
  const openQuests = async t => { if (t) qTab = t; QM.m.classList.add('on'); renderQuests(); rep('open_quests', 'oq:' + day()); await loadQuests(); };
  function questCard(q) {
    const cnt = q.count || 1, pct = Math.min(100, q.progress / cnt * 100);
    let barHtml = `<div class="pgbar"><i style="width:${pct.toFixed(1)}%"></i></div>`;
    if (q.kind === 'coop') {
      const b = Math.min(cnt, q.by_bin), v = Math.min(cnt - b, q.by_vy);
      barHtml = `<div class="pgbar qx-co"><i class="b" style="width:${(b / cnt * 100).toFixed(1)}%"></i><i class="v" style="width:${(v / cnt * 100).toFixed(1)}%"></i></div>
        <small class="qx-who"><span class="b">Bin góp ${q.by_bin}</span><span class="v">Vy góp ${q.by_vy}</span></small>`;
    }
    const st = q.claimed ? '<em class="qx-ok">Đã nhận</em>' : q.done ? `<button class="pb" data-q="${esc(q.id)}" data-p="${esc(q.period)}">Nhận</button>` : `<em>${Math.min(q.progress, cnt)}/${cnt}</em>`;
    return `<div class="qx-q${q.done ? ' done' : ''}${q.claimed ? ' claimed' : ''}"><div><b>${esc(q.name)}</b><small>${esc(q.desc)}${q.where ? ' · <i>' + esc(q.where) + '</i>' : ''}</small>${barHtml}
      <div class="pg-items">${rewardChips(q.reward)}${q.kt ? `<span class="pg-item kt">+${nf(q.kt)} Kiến Tạo cho nhà</span>` : ''}</div></div>${st}</div>`;
  }
  function renderQuests() {
    const TABS = [['daily', 'Hôm nay'], ['weekly', 'Tuần này'], ['coop', 'Cùng nhau'], ['tutorial', 'Hướng dẫn']];
    const ready = k => Q ? Q.quests.filter(q => q.kind === k && q.done && !q.claimed).length : 0;
    QM.tabs.innerHTML = TABS.map(([k, l]) => `<div class="chip${k === qTab ? ' on' : ''}" role="tab" data-t="${k}">${l}${ready(k) ? ' · ' + ready(k) : ''}</div>`).join('');
    QM.tabs.onclick = e => { const c = e.target.closest('.chip'); if (c) { qTab = c.dataset.t; renderQuests(); } };
    const B = QM.body;
    if (!Q) { B.innerHTML = '<p class="pg-empty">Đang tải…</p>'; return; }
    const list = Q.quests.filter(q => q.kind === qTab);
    QM.sub.textContent = qTab === 'daily' ? 'Làm mới sau ' + left(Q.day_ends, skew) : (qTab === 'weekly' || qTab === 'coop') ? 'Làm mới sau ' + left(Q.week_ends, skew) : '';
    const help = {daily: 'Ba mục tiêu nhẹ nhàng mỗi ngày. Bỏ lỡ cũng không sao — ngày mai có bộ mới.',
      weekly: 'Mục tiêu dài hơi trong tuần (tuần mới bắt đầu thứ Hai).',
      coop: 'Bin và Vy cùng góp tiến độ. Xong thì cả nhà được Điểm Kiến Tạo, và mỗi người tự nhận phần thưởng của mình.',
      tutorial: Q.tutorial_skip ? 'Bạn đã tắt hướng dẫn.' : 'Các bước làm quen. Làm xong mỗi bước sẽ tự nhận thưởng.'}[qTab];
    B.innerHTML = `<p class="pg-help">${help}</p>` + (list.length ? list.map(questCard).join('') : '<p class="pg-empty">Chưa có nhiệm vụ.</p>') +
      (qTab === 'tutorial' ? `<div class="pg-acts"><button class="pl" id="qxTut">${Q.tutorial_skip ? 'Bật lại hướng dẫn' : 'Tắt hướng dẫn'}</button></div>` : '');
    B.querySelectorAll('[data-q]').forEach(b => b.onclick = async () => {
      b.disabled = true;
      try { await prog.claimQuest(b.dataset.q, b.dataset.p); window.SFX && window.SFX.play && window.SFX.play('success'); } catch (e) { toast(errText(e)); }
      loadQuests();
    });
    $('qxTut') && ($('qxTut').onclick = async () => { try { await prog.tutorial(!Q.tutorial_skip); toast(Q.tutorial_skip ? 'Đã bật lại hướng dẫn' : 'Đã tắt hướng dẫn'); } catch (e) { toast(errText(e)); } loadQuests(); });
  }
  const paintDot = () => { const n = prog.me && prog.me.quests_ready || 0; $('qDot').hidden = !n; $('iQuest').title = 'Nhiệm vụ (J)' + (n ? ' · ' + n + ' phần thưởng chờ nhận' : ''); };

  // ======================= HƯỚNG DẪN NGƯỜI MỚI =======================
  const tut = document.createElement('div'); tut.id = 'tutBox'; tut.className = 'hud panel'; tut.hidden = true; tut.setAttribute('role', 'status');
  document.body.appendChild(tut);
  let tutCur = null, moveTimer = null, claiming = false;
  async function autoClaimTutorial() {
    if (!Q || claiming) return;
    const ready = Q.quests.filter(q => q.kind === 'tutorial' && q.done && !q.claimed);
    if (!ready.length) return;
    claiming = true;
    for (const q of ready) { try { await prog.claimQuest(q.id, q.period); q.claimed = true; } catch (e) { console.warn('[tut]', e); } }
    claiming = false;
  }
  function paintTut() {
    const steps = Q ? Q.quests.filter(q => q.kind === 'tutorial') : [];
    const cur = Q && !Q.tutorial_skip && Q.tutorial_next ? steps.find(q => q.step === Q.tutorial_next) : null;
    tutCur = cur;
    clearInterval(moveTimer); moveTimer = null;
    if (!cur) { tut.hidden = true; return; }
    if (cur.event === 'visit_garden' && mapId === 'exterior') rep('visit_garden', 'vg:' + day());   // đang đứng ở vườn sẵn rồi
    tut.hidden = false;
    tut.innerHTML = `<div class="tt-h"><span class="ic">${ic('flag')}</span><small>Hướng dẫn ${cur.step}/${steps.length}</small><span class="sp"></span><button class="tt-x" id="ttSkip" title="Tắt hướng dẫn (bật lại trong Nhiệm vụ → Hướng dẫn)">Bỏ qua</button></div>
      <b>${esc(cur.name)}</b><p>${esc(cur.hint || cur.desc)}</p><div class="pg-items">${rewardChips(cur.reward)}</div>
      <div class="tt-dots">${steps.map(s => `<i class="${s.done ? 'ok' : s.step === cur.step ? 'on' : ''}"></i>`).join('')}</div>`;
    $('ttSkip').onclick = async () => { tut.hidden = true; try { await prog.tutorial(true); toast('Đã tắt hướng dẫn. Bật lại trong Nhiệm vụ → Hướng dẫn.'); } catch (e) { toast(errText(e)); } loadQuests(); };
    // bước "đi lại": tự nhận ra khi nhân vật đã di chuyển ~1.5m
    if (cur.event === 'moved') {
      let p0 = null;
      moveTimer = setInterval(() => {
        const L = api && api.local; if (!L || !L.P) return;
        const p = L.P.pos; if (!p0) { p0 = {x: p.x, z: p.z}; return; }
        if (Math.hypot(p.x - p0.x, p.z - p0.z) > 1.5) { clearInterval(moveTimer); moveTimer = null; prog.report('moved', {}, 'moved:' + day()); }
      }, 700);
    }
  }

  // ======================= TÚI ĐỒ & KHO NHÀ =======================
  let bag = null, bTab = 'mine', bGroup = 'all', bQuery = '', bSel = null, sellAsk = 0;
  const shopUi = createShop({prog, toast, rerender: () => BM.isOn() && renderBag(), errText, onClose: () => BM.close()});
  async function loadBag() { try { bag = await prog.bag(); } catch (e) { toast(errText(e)); } if (BM.isOn()) renderBag(); }
  const openBag = async (t, grp) => { if (t) bTab = t; if (grp) { bGroup = grp; bSel = null; } BM.m.classList.add('on'); renderBag(); rep('open_bag', 'ob:' + day()); if (bTab === 'shop' || bTab === 'craft') shopUi.load(); await loadBag(); };
  function renderBag() {
    BM.tabs.innerHTML = [['mine', 'Túi của tôi'], ['house', 'Kho nhà (chung)'], ['shop', 'Cửa hàng'], ['craft', 'Chế tạo']].map(([k, l]) => `<div class="chip${k === bTab ? ' on' : ''}" role="tab" data-t="${k}">${l}</div>`).join('');
    BM.tabs.onclick = e => { const c = e.target.closest('.chip'); if (c) { const was = bTab; bTab = c.dataset.t; bSel = null; bGroup = 'all'; shopUi.reset(); renderBag(); if ((bTab === 'shop' || bTab === 'craft') && was !== bTab) shopUi.load(); else if (bTab === 'mine' || bTab === 'house') loadBag(); } };
    const B = BM.body;
    if (bTab === 'shop') return shopUi.renderShop(B, BM.sub);
    if (bTab === 'craft') return shopUi.renderCraft(B, BM.sub);
    if (!bag) { B.innerHTML = '<p class="pg-empty">Đang tải…</p>'; BM.sub.textContent = ''; return; }
    const own = bTab === 'mine' ? bag.mine : bag.house, cap = bTab === 'mine' ? bag.slots : bag.house_slots;
    BM.sub.textContent = own.length + ' / ' + cap + ' ô';
    const groupsHere = new Set(own.map(o => (ITEMS[o.id] || {}).group));
    const q = bQuery.trim().toLowerCase();
    const shown = own.filter(o => { const it = ITEMS[o.id] || {}; return (bGroup === 'all' || it.group === bGroup) && (!q || String(it.name || o.id).toLowerCase().includes(q)); });
    if (bSel && !own.find(o => o.id === bSel)) bSel = null;
    const sel = bSel && own.find(o => o.id === bSel), it = sel && (ITEMS[sel.id] || {name: sel.id});
    const grp = id => ((bag.groups || []).find(g => g.id === id) || {}).name || '';
    B.innerHTML = `<div class="bg-tools"><div class="chips" id="bgGrp"><div class="chip${bGroup === 'all' ? ' on' : ''}" data-g="all">Tất cả</div>${(bag.groups || []).filter(g => groupsHere.has(g.id)).map(g => `<div class="chip${bGroup === g.id ? ' on' : ''}" data-g="${g.id}">${esc(g.name)}</div>`).join('')}</div>
        <label class="bg-search"><span class="ic">${ic('search')}</span><input id="bgQ" placeholder="Tìm đồ…" value="${esc(bQuery)}" autocomplete="off"></label></div>
      <div class="bg-wrap"><div class="bg-grid" id="bgGrid">${shown.map(o => { const d = ITEMS[o.id] || {}; return `<button class="bg-cell r-${esc(d.rarity || 'common')}${o.id === bSel ? ' on' : ''}" data-i="${esc(o.id)}" title="${esc(d.name || o.id)}"><span>${esc(d.icon || '📦')}</span><em>${nf(o.n)}</em></button>`; }).join('')}${(bGroup === 'all' && !q) ? '<i class="bg-cell empty"></i>'.repeat(Math.max(0, Math.min(cap, 40) - shown.length)) : ''}</div>
      <div class="bg-det">${sel ? `<div class="bg-big r-${esc(it.rarity || 'common')}">${esc(it.icon || '📦')}</div><b>${esc(it.name)}</b><small>${esc(grp(it.group))} · ${esc(RAR[it.rarity] || 'Thường')} · có ${nf(sel.n)}${it.stack ? ' / tối đa ' + it.stack : ''}</small><p>${esc(it.desc || '')}</p>
          ${(() => { const F = window.__vyFurn; if (!F || !F.placeable(sel.id)) return ''; if (F.isGarden && F.isGarden(sel.id)) return F.isOutdoor() ? `<button class="pb bg-place" id="bgPlace">${(ITEMS[sel.id] && ITEMS[sel.id].scatter && ITEMS[sel.id].scatter.n > 1) ? 'Rải ra vườn' : 'Trồng ra vườn'}</button>` : `<small class="sh-why">Cây cối trồng ngoài Vườn — ra vườn (cửa chính) rồi mở túi để rải.</small>`;
            return F.canHere() ? `<button class="pb bg-place" id="bgPlace">Đặt vào ${esc(F.mapName)}</button>` : `<small class="sh-why">${esc(F.mapName)} là phòng riêng của người kia — sang phòng khách, vườn hoặc phòng mình để đặt.</small>`; })()}
          <div class="bg-mv"><input type="number" id="bgN" min="1" max="${sel.n}" value="${sel.n}" aria-label="Số lượng"><button class="pl" id="bgMv">${bTab === 'mine' ? 'Cất vào kho nhà' : 'Lấy về túi'}</button></div>
          ${bTab === 'mine' && it.sell && !it.nosell && it.group !== 'quest' ? (sellAsk ? `<div class="sh-cf"><b>Bán ${nf(sellAsk)} ${esc(it.name)}?</b><span>Nhận <b>${nf(it.sell * sellAsk)} Xu</b> (${nf(it.sell)} Xu / món)</span><div class="bg-mv"><button class="pl" id="bgSN">Huỷ</button><button class="pb" id="bgSY">Bán</button></div></div>`
            : `<button class="pl bg-sellb" id="bgSell">Bán · ${nf(it.sell)} Xu / món</button>`) : bTab === 'mine' ? '<small>Món này không bán được.</small>' : ''}`
        : `<p class="pg-empty">${own.length ? 'Chọn một món để xem chi tiết.' : bTab === 'mine' ? 'Túi đang trống. Làm nhiệm vụ để nhận nguyên liệu nhé.' : 'Kho nhà trống. Cất đồ từ túi vào để cả hai cùng dùng.'}</p>`}
        ${window.__vyFurn ? `<button class="pl bg-arr" id="bgArr"><i class="ic">${ic('home')}</i>Sắp xếp ${esc(window.__vyFurn.mapName)}</button>` : ''}
        <p class="pg-help bg-note">${bTab === 'mine' ? 'Túi riêng của bạn, mang theo mọi nơi.' : 'Kho chung của Bin và Vy — ai cũng cất / lấy được. Lịch sử xem ở Hồ sơ → Lịch sử → Quỹ nhà.'}</p></div></div>`;
    $('bgGrp').onclick = e => { const c = e.target.closest('.chip'); if (c) { bGroup = c.dataset.g; renderBag(); } };
    const qi = $('bgQ'); qi.oninput = () => { bQuery = qi.value; const pos = qi.selectionStart; renderBag(); const n = $('bgQ'); n.focus(); n.setSelectionRange(pos, pos); };
    $('bgGrid').onclick = e => { const c = e.target.closest('[data-i]'); if (c) { bSel = c.dataset.i === bSel ? null : c.dataset.i; sellAsk = 0; renderBag(); } };
    $('bgSell') && ($('bgSell').onclick = () => { sellAsk = Math.max(1, Math.min(sel.n, parseInt($('bgN').value, 10) || 1)); renderBag(); });
    $('bgSN') && ($('bgSN').onclick = () => { sellAsk = 0; renderBag(); });
    $('bgSY') && ($('bgSY').onclick = async e => {
      e.currentTarget.disabled = true; const n = sellAsk;
      try { const r = await prog.sell(sel.id, n); if (r && r.ok) toast(`Đã bán ${n} ${it.name} (+${nf(r.gain)} Xu)`); } catch (er) { toast(errText(er)); }
      sellAsk = 0; loadBag();
    });
    $('bgPlace') && ($('bgPlace').onclick = () => { BM.close(); window.__vyFurn.place(sel.id); });
    $('bgArr') && ($('bgArr').onclick = () => { BM.close(); window.__vyFurn.arrange(); });
    $('bgMv') && ($('bgMv').onclick = async e => {
      const n = Math.max(1, Math.min(sel.n, parseInt($('bgN').value, 10) || 0)); e.currentTarget.disabled = true;
      try { await prog.transfer(sel.id, n, bTab === 'mine'); toast((bTab === 'mine' ? 'Đã cất ' : 'Đã lấy ') + n + ' ' + it.name + (bTab === 'mine' ? ' vào kho nhà' : ' về túi')); } catch (er) { toast(errText(er)); }
      loadBag();
    });
  }

  // ---------- nút, phím tắt ----------
  $('iQuest').onclick = () => openQuests();
  $('iBag').onclick = () => openBag();
  addEventListener('keydown', e => {
    if (e.code === 'Escape') { QM.close(); BM.close(); return; }
    const t = e.target; if (t && (/INPUT|TEXTAREA|SELECT/.test(t.tagName) || t.isContentEditable) || e.repeat || e.ctrlKey || e.metaKey || e.altKey) return;
    if ((e.code === 'KeyB' || e.code === 'KeyJ') && userKeys().includes(e.code)) return;   // người chơi đã tự gán phím này cho việc khác
    if (e.code === 'KeyB') { e.preventDefault(); BM.isOn() ? BM.close() : openBag(); }
    if (e.code === 'KeyJ') { e.preventDefault(); QM.isOn() ? QM.close() : openQuests(); }
  });

  // ---------- phản ứng với máy chủ ----------
  prog.on('quests', done => {
    const other = done.filter(q => q.kind !== 'tutorial');
    if (other.length) {
      toast('Hoàn thành nhiệm vụ: ' + other.map(q => q.name).join(', ') + ' — bấm J để nhận');
      other.forEach(q => Notify.add({type: 'peer', title: (q.kind === 'coop' ? 'Nhiệm vụ chung xong: ' : 'Hoàn thành: ') + q.name, body: 'Mở Nhiệm vụ để nhận thưởng', go: () => openQuests(q.kind)}));
    }
    loadQuests();
  });
  let lastReady = null;
  prog.on('change', d => {
    paintDot();
    if (lastReady != null && d.quests_ready !== lastReady) loadQuests();   // người kia vừa góp xong nhiệm vụ chung…
    lastReady = d.quests_ready;
    if (BM.isOn() && (bTab === 'mine' || bTab === 'house')) loadBag();
  });
  // giờ đổi ngày/tuần → tải lại bộ nhiệm vụ mới
  setInterval(() => { if (Q && new Date(Q.day_ends).getTime() - skew <= Date.now()) loadQuests(); else if (QM.isOn()) renderQuests(); }, 60000);
  paintDot(); loadQuests();
  return {openQuests, openBag, openShop: () => openBag('shop')};
}
