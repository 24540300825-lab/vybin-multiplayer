// Hạng mục 06: Cửa hàng + Chế tạo — hai tab trong hộp Túi đồ (phím B). Máy chủ quyết định giá, điều kiện, số dư (game_shop / game_buy / game_craft).
// Mua: chọn món → số lượng + nơi nhận (túi / kho nhà) → Xác nhận (thấy số dư sau mua) → máy chủ trừ Xu + cộng đồ trong MỘT giao dịch.
// Danh mục chưa có hệ thống dùng (hạt giống, trang phục…) hiện "Sắp có", không bày hàng.
import {ic} from './icons.js';
import {ITEMS, setItems} from '../net/progress.js';

const $ = id => document.getElementById(id);
const esc = s => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;'}[c]));
const nf = n => Number(n || 0).toLocaleString('vi-VN');
const nm = id => (ITEMS[id] || {}).name || id;
const icon = id => (ITEMS[id] || {}).icon || '📦';

export function createShop({prog, toast, rerender, errText, onOpenBag}) {
  let shop = null, rec = null, cat = null, query = '', sel = null, confirm = false, busy = false, rSel = null;
  async function load() {
    try { [shop, rec] = await Promise.all([prog.shop(), prog.recipes()]); if (shop) setItems(shop.items); } catch (e) { toast(errText(e)); }
    rerender();
  }

  // ======================= CỬA HÀNG =======================
  function renderShop(B, sub) {
    if (!shop) { B.innerHTML = '<p class="pg-empty">Đang mở cửa hàng…</p>'; sub.textContent = ''; return; }
    sub.textContent = nf(shop.xu) + ' Xu';
    const cats = shop.cats || [];
    if (!cat) cat = (cats.find(c => c.live) || cats[0] || {}).id;
    const C = cats.find(c => c.id === cat) || {};
    const q = query.trim().toLowerCase();
    const list = (shop.listings || []).filter(l => l.cat === cat && (!q || nm(l.item).toLowerCase().includes(q)));
    if (sel && !list.find(l => l.item === sel)) { sel = null; confirm = false; }
    const L = sel && list.find(l => l.item === sel), it = L && (ITEMS[L.item] || {});
    let det = '';
    if (L) {
      const maxW = L.week_limit ? Math.max(0, L.week_limit - (L.bought_week || 0)) : 99;
      const nIn = Math.max(1, Math.min(99, maxW || 1, parseInt(($('shN') || {}).value, 10) || 1));
      const cost = L.price * nIn, after = shop.xu - cost, toHouse = !!($('shDst') && $('shDst').dataset.h === '1');
      const why = L.locked ? `Mở khi đạt cấp ${L.lv}` : L.week_limit && maxW <= 0 ? 'Đã mua đủ giới hạn tuần này' : after < 0 ? `Còn thiếu ${nf(-after)} Xu` : '';
      det = `<div class="bg-big r-${esc(it.rarity || 'common')}">${esc(icon(L.item))}</div><b>${esc(nm(L.item))}</b>
        <small>${esc(C.name || '')} · đang có ${nf(L.mine)} trong túi${L.house ? ', ' + nf(L.house) + ' trong kho nhà' : ''}</small><p>${esc(it.desc || '')}</p>
        ${it.group === 'furniture' ? '<small class="sh-soon">Đặt vào nhà: mở cùng chế độ Xây nhà. Mua bây giờ để cất trước.</small>' : ''}
        ${L.week_limit ? `<small>Giới hạn ${L.week_limit} / tuần · đã mua ${nf(L.bought_week || 0)}</small>` : ''}
        ${confirm && !why ? `<div class="sh-cf"><b>Xác nhận mua?</b><span>${nIn} × ${esc(nm(L.item))} → ${toHouse ? 'Kho nhà' : 'Túi của tôi'}</span>
            <span>Giá: <b>${nf(cost)} Xu</b> · Số dư sau mua: <b>${nf(after)} Xu</b></span>
            <div class="bg-mv"><button class="pl" id="shNo">Huỷ</button><button class="pb" id="shYes"${busy ? ' disabled' : ''}>${busy ? 'Đang mua…' : 'Xác nhận'}</button></div></div>`
          : `<div class="sh-row"><span>Số lượng</span><input type="number" id="shN" min="1" max="${Math.min(99, maxW)}" value="${nIn}" aria-label="Số lượng"${why ? ' disabled' : ''}></div>
            <div class="chips sh-dst" id="shDst" data-h="${toHouse ? 1 : 0}"><div class="chip${toHouse ? '' : ' on'}" data-h="0">Vào túi</div><div class="chip${toHouse ? ' on' : ''}" data-h="1">Cất vào kho nhà</div></div>
            <div class="sh-tot"><span>Tổng</span><b id="shTot">${nf(cost)} Xu</b></div>
            ${why ? `<p class="sh-why">${esc(why)}</p>` : ''}
            <div class="bg-mv"><button class="pb" id="shBuy"${why ? ' disabled' : ''}>Mua</button></div>`}`;
    } else det = `<p class="pg-empty">${C.live === false ? '' : 'Chọn một món để xem giá và mua.'}</p>`;
    B.innerHTML = `<div class="bg-tools"><div class="chips" id="shCat">${cats.map(c => `<div class="chip${c.id === cat ? ' on' : ''}${c.live ? '' : ' soon'}" data-c="${c.id}">${esc(c.name)}</div>`).join('')}</div>
        <label class="bg-search"><span class="ic">${ic('search')}</span><input id="shQ" placeholder="Tìm món…" value="${esc(query)}" autocomplete="off"></label></div>
      ${C.live === false ? `<div class="sh-empty"><span class="ic">${ic('bag')}</span><b>${esc(C.name)} — Sắp có</b><p>${esc(C.soon || 'Danh mục này sẽ mở ở bản sau.')}</p></div>` :
      `<div class="bg-wrap"><div class="sh-list" id="shList">${list.map(l => `<button class="sh-item${l.item === sel ? ' on' : ''}${l.locked ? ' lock' : ''}" data-i="${esc(l.item)}">
          <span class="sh-ic r-${esc((ITEMS[l.item] || {}).rarity || 'common')}">${esc(icon(l.item))}</span><span class="sh-nm">${esc(nm(l.item))}<small>${l.locked ? 'Cấp ' + l.lv : l.week_limit ? 'Còn ' + Math.max(0, l.week_limit - (l.bought_week || 0)) + '/tuần' : l.mine ? 'Đang có ' + nf(l.mine) : ''}</small></span>
          <em class="${shop.xu < l.price ? 'no' : ''}">${nf(l.price)} Xu</em></button>`).join('') || '<p class="pg-empty">Không có món phù hợp.</p>'}</div>
        <div class="bg-det">${det}</div></div>`}`;
    $('shCat').onclick = e => { const c = e.target.closest('.chip'); if (c) { cat = c.dataset.c; sel = null; confirm = false; rerender(); } };
    const qi = $('shQ'); qi.oninput = () => { query = qi.value; const p = qi.selectionStart; rerender(); const n = $('shQ'); n.focus(); n.setSelectionRange(p, p); };
    $('shList') && ($('shList').onclick = e => { const c = e.target.closest('[data-i]'); if (c) { sel = c.dataset.i === sel ? null : c.dataset.i; confirm = false; rerender(); } });
    if ($('shN')) {   // gõ số lượng: chỉ cập nhật tổng tiền (không vẽ lại cả bảng để khỏi mất con trỏ); rời ô thì vẽ lại cho đúng giới hạn
      $('shN').oninput = () => { const n = Math.max(1, parseInt($('shN').value, 10) || 1), c = L.price * n; $('shTot').textContent = nf(c) + ' Xu'; $('shBuy').disabled = !!(L.locked || c > shop.xu); };
      $('shN').onchange = () => rerender();
    }
    $('shDst') && ($('shDst').onclick = e => { const c = e.target.closest('.chip'); if (c) { $('shDst').dataset.h = c.dataset.h; rerender(); } });
    // giữ số lượng + nơi nhận qua bước xác nhận
    $('shBuy') && ($('shBuy').onclick = () => { confirm = {n: $('shN').value, h: $('shDst').dataset.h}; rerender(); });
    if (confirm && L) {
      const n = Math.max(1, parseInt(confirm.n, 10) || 1), toHouse = confirm.h === '1';
      // vẽ lại phần xác nhận với đúng số lượng đã chọn
      const cf = B.querySelector('.sh-cf');
      if (cf) cf.querySelector('span').textContent = n + ' × ' + nm(L.item) + ' → ' + (toHouse ? 'Kho nhà' : 'Túi của tôi');
      if (cf) cf.querySelectorAll('span')[1].innerHTML = `Giá: <b>${nf(L.price * n)} Xu</b> · Số dư sau mua: <b>${nf(shop.xu - L.price * n)} Xu</b>`;
      $('shNo').onclick = () => { confirm = false; rerender(); };
      $('shYes').onclick = async () => {
        if (busy) return; busy = true; rerender();
        try {
          const r = await prog.buy(L.item, n, toHouse);
          if (r && r.ok) { toast(`Đã mua ${n} ${nm(L.item)} (−${nf(r.spent)} Xu)${toHouse ? ' · cất vào kho nhà' : ''}`); window.SFX && window.SFX.play && window.SFX.play('success'); }
          confirm = false;
        } catch (e) { toast(errText(e)); }
        busy = false; await load();
      };
    }
  }

  // ======================= CHẾ TẠO =======================
  function renderCraft(B, sub) {
    if (!rec) { B.innerHTML = '<p class="pg-empty">Đang mở bàn chế tạo…</p>'; sub.textContent = ''; return; }
    const sk = prog.me && (prog.me.skills || []).find(s => s.id === 'craft');
    sub.textContent = sk ? 'Chế tạo cấp ' + sk.level : '';
    const have = id => rec.mine[id] || 0;
    const can = r => r.in.reduce((m, i) => Math.min(m, Math.floor(have(i.item) / i.n)), 99);
    const rw = (rec.reward || []).map(x => '+' + x.n + ' ' + (x.c === 'xp' ? 'XP' : x.c === 'skill:craft' ? 'điểm Chế tạo' : x.c)).join(' · ');
    B.innerHTML = `<p class="pg-help">Nguyên liệu lấy từ <b>túi của bạn</b>${Object.keys(rec.house || {}).length ? ' — kho nhà đang có đồ, lấy về túi ở tab Kho nhà nếu thiếu' : ''}. Mỗi món: ${esc(rw)}.</p>
      <div class="cr-list">${rec.recipes.map(r => {
        const lock = (r.lv || 1) > rec.level, max = lock ? 0 : can(r), on = r.id === rSel;
        return `<div class="cr-r${lock ? ' lock' : ''}${max ? ' ok' : ''}${on ? ' on' : ''}" data-r="${esc(r.id)}">
          <span class="sh-ic">${esc(icon(r.out.item))}</span>
          <div><b>${esc(nm(r.out.item))}${r.out.n > 1 ? ' ×' + r.out.n : ''}</b>
            <div class="cr-in">${r.in.map(i => `<span class="${have(i.item) >= i.n ? 'ok' : 'no'}">${esc(icon(i.item))} ${esc(nm(i.item))} ${nf(have(i.item))}/${i.n}</span>`).join('')}</div>
            ${lock ? `<small>Mở khi đạt cấp ${r.lv}</small>` : !max ? `<small>Thiếu: ${r.in.filter(i => have(i.item) < i.n).map(i => (i.n - have(i.item)) + ' ' + nm(i.item)).join(', ')}</small>` : ''}
            ${on && max ? `<div class="bg-mv cr-go"><input type="number" id="crN" min="1" max="${Math.min(20, max)}" value="1" aria-label="Số lượng"><div class="chips sh-dst" id="crDst" data-h="0"><div class="chip on" data-h="0">Vào túi</div><div class="chip" data-h="1">Kho nhà</div></div><button class="pb" id="crGo">Chế tạo</button></div>` : ''}
          </div><em>${lock ? 'Khoá' : max ? 'Làm được ' + max : 'Thiếu đồ'}</em></div>`;
      }).join('')}</div>`;
    B.querySelector('.cr-list').onclick = e => { if (e.target.closest('.cr-go')) return; const c = e.target.closest('[data-r]'); if (c) { rSel = c.dataset.r === rSel ? null : c.dataset.r; rerender(); } };
    $('crDst') && ($('crDst').onclick = e => { const c = e.target.closest('.chip'); if (!c) return; $('crDst').dataset.h = c.dataset.h; $('crDst').querySelectorAll('.chip').forEach(x => x.classList.toggle('on', x === c)); });
    $('crGo') && ($('crGo').onclick = async e => {
      const r = rec.recipes.find(x => x.id === rSel), n = Math.max(1, Math.min(20, parseInt($('crN').value, 10) || 1)), toHouse = $('crDst').dataset.h === '1';
      e.currentTarget.disabled = true; e.currentTarget.textContent = 'Đang làm…';
      try { const res = await prog.craft(r.id, n, toHouse); if (res && res.ok) { toast(`Đã chế tạo ${res.n} ${res.name}${toHouse ? ' · cất vào kho nhà' : ''}`); window.SFX && window.SFX.play && window.SFX.play('success'); } }
      catch (er) { toast(errText(er)); }
      await load();
    });
  }
  return {load, renderShop, renderCraft, reset: () => { sel = null; confirm = false; rSel = null; }};
}
