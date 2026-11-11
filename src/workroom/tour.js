// Hướng dẫn từng bước (overlay): làm tối màn hình, khoét sáng đúng phần tử đang nói tới, thẻ giải thích bên cạnh.
// Lần đầu tự chạy (nhớ theo trình duyệt + settings.tours để đồng bộ máy khác); sau đó mở lại bằng nút "Hướng dẫn".
import {h} from './ui.js';

const LS = 'vyWorkroomTours';
const seen = () => { try { return JSON.parse(localStorage.getItem(LS) || '{}'); } catch (e) { return {}; } };
export function tourDone(store, id) { return !!(seen()[id] || ((store.settings || {}).tours || {})[id]); }
function markDone(store, id) {
  try { localStorage.setItem(LS, JSON.stringify({...seen(), [id]: 1})); } catch (e) {}
  if (store && store.setSetting) store.setSetting('tours', {...((store.settings || {}).tours || {}), [id]: 1}).catch(() => {});
}
let active = null;
export const tourOpen = () => !!active;

// steps: [{el: selector | () => Element, title, text, place?: 'right'|'left'|'top'|'bottom', before?: () => void}]
export function tour(store, id, steps, {force = false} = {}) {
  if (active || (!force && tourDone(store, id))) return;
  const root = document.getElementById('wr') || document.body;
  let i = 0;
  const hole = h('div', {class: 'wr-tour-hole'});
  const card = h('div', {class: 'wr-tour-card', role: 'dialog', 'aria-modal': 'true', 'aria-live': 'polite'});
  const ov = h('div', {class: 'wr-tour', onclick: e => { if (e.target === ov) next(); }}, hole, card);
  const find = s => { try { const el = typeof s.el === 'function' ? s.el() : s.el ? document.querySelector(s.el) : null; return el && el.getClientRects().length ? el : null; } catch (e) { return null; } };
  const end = () => { ov.remove(); removeEventListener('resize', place); document.removeEventListener('keydown', key, true); active = null; markDone(store, id); };
  const next = () => { if (i < steps.length - 1) { i++; show(); } else end(); };
  const back = () => { if (i > 0) { i--; show(); } };
  const key = e => { if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); end(); } else if (e.key === 'ArrowRight' || e.key === 'Enter') { e.preventDefault(); e.stopPropagation(); next(); } else if (e.key === 'ArrowLeft') { e.preventDefault(); e.stopPropagation(); back(); } };
  function place() {
    const s = steps[i], el = find(s), W = innerWidth, H = innerHeight, pad = 6;
    if (!el) { hole.style.cssText = `left:${W / 2}px;top:${H / 2}px;width:0;height:0`; card.style.left = Math.max(12, (W - card.offsetWidth) / 2) + 'px'; card.style.top = Math.max(12, (H - card.offsetHeight) / 2) + 'px'; return; }
    const r = el.getBoundingClientRect();
    hole.style.cssText = `left:${r.left - pad}px;top:${r.top - pad}px;width:${r.width + pad * 2}px;height:${r.height + pad * 2}px`;
    const cw = card.offsetWidth, ch = card.offsetHeight, g = 14;
    const opts = {right: [r.right + g, r.top], left: [r.left - cw - g, r.top], bottom: [r.left, r.bottom + g], top: [r.left, r.top - ch - g]};
    const fits = ([x, y]) => x >= 8 && y >= 8 && x + cw <= W - 8 && y + ch <= H - 8;
    let p = [s.place, 'right', 'bottom', 'left', 'top'].filter(Boolean).map(k => opts[k]).find(fits) || opts.bottom;
    card.style.left = Math.min(Math.max(8, p[0]), W - cw - 8) + 'px'; card.style.top = Math.min(Math.max(8, p[1]), H - ch - 8) + 'px';
  }
  function show() {
    const s = steps[i];
    if (s.before) try { s.before(); } catch (e) {}
    const el = find(s); if (el) el.scrollIntoView({block: 'nearest', inline: 'nearest'});
    card.replaceChildren(
      h('div', {class: 'wr-tour-step'}, `Bước ${i + 1}/${steps.length}`),
      h('h3', {}, s.title), h('p', {}, s.text),
      h('div', {class: 'wr-tour-dots'}, steps.map((_, j) => h('i', {class: j === i ? 'on' : ''}))),
      h('div', {class: 'wr-tour-act'},
        h('button', {class: 'wr-btn ghost sm', onclick: end}, 'Bỏ qua'), h('span', {style: 'flex:1'}),
        i > 0 && h('button', {class: 'wr-btn ghost sm', onclick: back}, '← Trước'),
        h('button', {class: 'wr-btn sm', onclick: next}, i === steps.length - 1 ? 'Đã hiểu ✓' : 'Tiếp →')));
    requestAnimationFrame(() => { place(); card.querySelector('.wr-btn:not(.ghost)').focus({preventScroll: true}); });
  }
  root.append(ov); addEventListener('resize', place); document.addEventListener('keydown', key, true);
  active = {end}; show();
}
