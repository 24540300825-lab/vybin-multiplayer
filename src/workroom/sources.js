// PHÒNG VY — WORKROOM · NGUỒN: Vy thả tài liệu / ảnh / PDF / dán chữ / dán link Google Docs → AI đọc và dựng khung.
// • .docx .xlsx .csv .txt → trích chữ ngay trên máy.   • Ảnh → thu nhỏ (tối đa 1280 px) rồi gửi Gemini xem trực tiếp.
// • PDF → Gemini đọc trực tiếp (lần đầu nhờ AI chép lại chữ để lưu; file gốc không lưu).
// • Link Google Docs/Sheets/Drive → đọc qua Google (cần kết nối Google).
import {h, icon} from './ui.js';
import {readAnyFile} from './files.js';

const MAX_IMG = 10, MAX_TEXT = 60000;
const id = () => 'S' + Math.random().toString(36).slice(2, 7);
const b64 = buf => { const u = new Uint8Array(buf); let s = ''; for (let i = 0; i < u.length; i += 0x8000) s += String.fromCharCode(...u.subarray(i, i + 0x8000)); return btoa(s); };
async function shrink(file, max = 1280, q = 0.78) {
  const bmp = await createImageBitmap(file); const k = Math.min(1, max / Math.max(bmp.width, bmp.height));
  const c = document.createElement('canvas'); c.width = Math.round(bmp.width * k); c.height = Math.round(bmp.height * k);
  c.getContext('2d').drawImage(bmp, 0, 0, c.width, c.height);
  const url = c.toDataURL('image/jpeg', q); return {data: url.split(',')[1], w: c.width, h: c.height};
}
// 1 file → nguồn
export async function ingestFile(ctx, f) {
  const n = f.name.toLowerCase();
  if (/^image\//.test(f.type) || /\.(png|jpe?g|webp|heic|gif)$/.test(n)) { const im = await shrink(f); return {id: id(), name: f.name, type: 'image', mime: 'image/jpeg', data: im.data, w: im.w, h: im.h}; }
  if (f.type === 'application/pdf' || n.endsWith('.pdf')) {
    if (f.size > 15e6) throw new Error(f.name + ': PDF quá lớn (tối đa 15 MB).');
    const data = b64(await f.arrayBuffer());
    let text = '';
    if (ctx.ai.cfg.key) { try { text = (await ctx.ai.generate({task: 'Đọc PDF', prompt: 'Chép lại TOÀN BỘ chữ trong tài liệu PDF này (giữ đúng tên người, chức danh, số liệu, ngày giờ). Bảng thì ghi mỗi dòng một hàng, ngăn cột bằng " | ". Không bình luận.', parts: [{inlineData: {mimeType: 'application/pdf', data}}], temperature: 0})).text; } catch (e) { text = ''; } }
    return {id: id(), name: f.name, type: 'text', text: (text || '[Chưa đọc được chữ trong PDF này]').slice(0, MAX_TEXT), from: 'pdf'};
  }
  const r = await readAnyFile(f);
  return {id: id(), name: f.name, type: 'text', text: String(r.text || '').slice(0, MAX_TEXT)};
}
export async function ingestText(ctx, t) {
  t = String(t || '').trim(); if (!t) return null;
  const gid = ctx.g.idFromUrl(t);
  if (gid && /docs\.google|drive\.google/.test(t)) {
    if (ctx.g.status !== 'connected') throw new Error('Đọc link Google cần kết nối Google trước (Cài đặt → Kết nối Google), hoặc mở link rồi dán nội dung vào đây.');
    const meta = await ctx.g.drive.meta(gid), r = await ctx.g.readFile(meta);
    return {id: id(), name: meta.name, type: 'text', text: String(r.text || '').slice(0, MAX_TEXT), url: meta.webViewLink};
  }
  if (/^https?:\/\/\S+$/.test(t)) throw new Error('Workroom không tự mở được trang web ngoài. Mở link, chọn hết nội dung (⌘A, ⌘C) rồi dán vào đây.');
  return {id: id(), name: t.split('\n')[0].slice(0, 60) || 'Ghi chú', type: 'text', text: t.slice(0, MAX_TEXT)};
}
// Gemini: chữ gom vào prompt, ảnh gửi kèm trực tiếp (có nhãn S… để AI gắn ảnh vào đúng chỗ)
export function toAI(list = []) {
  const texts = list.filter(s => s.type === 'text'), imgs = list.filter(s => s.type === 'image');
  return {
    text: texts.length ? texts.map(s => `=== NGUỒN ${s.id}: ${s.name} ===\n${s.text}`).join('\n\n') : '',
    note: imgs.length ? `Có ${imgs.length} ẢNH gửi kèm (${imgs.map(s => s.id + ' = ' + s.name).join('; ')}). Đọc chữ trên ảnh (băng rôn, slide, thư mời…) làm dữ kiện; mô tả đúng những gì thấy.` : '',
    parts: imgs.flatMap(s => [{text: `Ảnh ${s.id} (${s.name}):`}, {inlineData: {mimeType: s.mime, data: s.data}}]),
  };
}
export const srcSummary = list => list.length ? list.map(s => s.type === 'image' ? '🖼 ' + s.name : '📄 ' + s.name).join(' · ') : '';

// ---------- ô thả nguồn (dùng ở hộp tạo mới và trong tài liệu) ----------
export function sourceBox(ctx, list, onChange, o = {}) {
  const err = h('p', {class: 'wr-err'}), chips = h('div', {class: 'wr-chips'}), busy = h('span', {class: 'wr-mute'});
  const paint = () => chips.replaceChildren(...list.map((s, i) => h('span', {class: 'wr-src'}, s.type === 'image' ? h('img', {src: 'data:' + s.mime + ';base64,' + s.data, alt: ''}) : icon('doc'), h('span', {title: s.name}, s.name),
    h('button', {class: 'wr-x del', 'aria-label': 'Bỏ nguồn ' + s.name, onclick: () => { list.splice(i, 1); paint(); onChange && onChange(list); }}, icon('x')))));
  const add = async items => {
    err.textContent = ''; busy.textContent = 'Đang đọc…';
    for (const it of items) {
      try {
        if (it instanceof File && /^image\//.test(it.type) && list.filter(s => s.type === 'image').length >= MAX_IMG) throw new Error('Tối đa ' + MAX_IMG + ' ảnh mỗi lần.');
        const s = it instanceof File ? await ingestFile(ctx, it) : await ingestText(ctx, it);
        if (s) list.push(s);
      } catch (e) { err.textContent = e.message; }
    }
    busy.textContent = ''; paint(); onChange && onChange(list);
  };
  const pick = h('input', {type: 'file', multiple: true, style: 'display:none', accept: '.docx,.xlsx,.csv,.txt,.md,.pdf,image/*', onchange: e => { add([...e.target.files]); e.target.value = ''; }});
  const paste = h('textarea', {class: 'wr-in', rows: o.rows || 3, placeholder: 'Dán nội dung, thông báo, ghi chú… hoặc link Google Docs/Sheets', 'aria-label': 'Dán nguồn',
    onpaste: e => { const fs = [...(e.clipboardData && e.clipboardData.files || [])]; if (fs.length) { e.preventDefault(); add(fs); } }});
  const addText = () => { const t = paste.value.trim(); if (t) { paste.value = ''; add([t]); } };
  const zone = h('div', {class: 'wr-drop', tabIndex: 0, role: 'button', 'aria-label': 'Thả tài liệu hoặc ảnh vào đây',
    onclick: () => pick.click(), onkeydown: e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); pick.click(); } },
    ondragover: e => { e.preventDefault(); zone.classList.add('on'); }, ondragleave: () => zone.classList.remove('on'),
    ondrop: e => { e.preventDefault(); zone.classList.remove('on'); add([...e.dataTransfer.files]); }},
    icon('up'), h('b', {}, 'Thả tài liệu, ảnh, PDF vào đây'), h('small', {}, 'hoặc bấm để chọn · Word, Excel, PDF, ảnh, .txt'));
  paint();
  const box = h('div', {class: 'wr-stack wr-srcbox'}, zone, pick, h('div', {class: 'wr-row', style: 'align-items:flex-end'}, h('div', {style: 'flex:1'}, paste), h('button', {class: 'wr-btn ghost sm', onclick: addText}, 'Thêm')), busy, chips, err);
  box.flushText = addText; box.pending = () => paste.value.trim();
  return box;
}
