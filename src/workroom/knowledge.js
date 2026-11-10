// PHÒNG VY — WORKROOM · tri thức dùng chung: phân loại, tìm đoạn liên quan, dựng ngữ cảnh cho AI (chỉ gửi phần liên quan, kèm nguồn).
export const CATS = [
  ['official', 'Tài liệu chính thức'], ['approved_article', 'Bài đã duyệt'], ['article_sample', 'Bài mẫu'], ['guideline', 'Quy chuẩn biên tập'], ['template', 'Biểu mẫu'],
  ['event_record', 'Hồ sơ sự kiện'], ['people', 'Nhân vật & chức danh'], ['staff', 'Danh bạ nhân sự'], ['timeline_template', 'Mẫu timeline'], ['media', 'Tư liệu hình ảnh'],
  ['ai_draft', 'Bản nháp AI'], ['archive', 'Dự án lưu trữ'], ['reference', 'Tham khảo'],
];
export const catName = id => (CATS.find(c => c[0] === id) || [0, id])[1];
export const STATUS = {official: 'Chính thức', reference: 'Tham khảo', draft: 'Bản nháp'};
export const KINDS = [['news', 'Tin bài'], ['caption', 'Caption Facebook'], ['announce', 'Thông báo'], ['invite', 'Thư mời'], ['internal', 'Truyền thông nội bộ'], ['newsletter', 'Bản tin'], ['script', 'Kịch bản / lời dẫn'], ['schedule', 'Lịch công tác'], ['timeline', 'Timeline']];
export const kindName = id => (KINDS.find(c => c[0] === id) || [0, id || '—'])[1];

const STOP = new Set('và của là các những cho với trong được một này đó khi đã sẽ có không tại về từ đến trên theo như cũng để ra vào thì mà hay hoặc bởi vì nên rằng the of and to in'.split(' '));
export const toks = s => (String(s || '').toLowerCase().match(/[\p{L}\p{N}]+/gu) || []).filter(w => w.length > 1 && !STOP.has(w));
const chunks = (text, size = 900) => { const out = []; let cur = ''; for (const p of String(text || '').split(/\n+/)) { if (cur && (cur + p).length > size) { out.push(cur); cur = ''; } cur += (cur ? '\n' : '') + p; } if (cur) out.push(cur); return out; };

// Tìm đoạn liên quan nhất. Không bao giờ trả 'bản nháp' / 'bản nháp AI' trừ khi gọi với includeDrafts.
export function retrieve(store, query, {cats = null, k = 4, includeDrafts = false, eventId = null} = {}) {
  const qt = [...new Set(toks(query))]; if (!qt.length) return [];
  const docs = store.knowledge.filter(d => (includeDrafts || (d.status !== 'draft' && d.category !== 'ai_draft')) && (!cats || cats.includes(d.category)));
  const all = docs.flatMap(d => chunks(d.name + '\n' + d.content).map((c, i) => ({d, i, c, t: toks(c)})));
  const df = {}; all.forEach(x => new Set(x.t).forEach(w => { df[w] = (df[w] || 0) + 1; }));
  return all.map(x => {
    const tf = {}; x.t.forEach(w => { tf[w] = (tf[w] || 0) + 1; });
    let s = 0; for (const w of qt) if (tf[w]) s += Math.min(3, tf[w]) * Math.log(1 + all.length / df[w]);
    s = s / Math.sqrt(40 + x.t.length) * (x.d.status === 'official' ? 1.25 : 1) * (eventId && x.d.event_id === eventId ? 1.3 : 1);
    return {...x, s};
  }).filter(x => x.s > 0.15).sort((a, b) => b.s - a.s).slice(0, k).map(x => ({id: x.d.id, name: x.d.name, status: x.d.status, category: x.d.category, version: x.d.version || '', file_id: x.d.file_id || '', url: x.d.url || '', excerpt: x.c, score: +x.s.toFixed(2)}));
}
export const srcRef = d => ({id: d.id, name: d.name, status: d.status, category: d.category, version: d.version || '', file_id: d.file_id || '', url: d.url || ''});
// bài mẫu cho 1 loại nội dung: CHỈ lấy tài liệu được xác nhận 'chính thức'; không có thì trả rỗng (và giao diện nói rõ là đang thiếu mẫu chuẩn)
export function samplesFor(store, kind, n = 1) {
  return store.knowledge.filter(d => d.status === 'official' && ['approved_article', 'article_sample', 'template'].includes(d.category) && (d.kind || 'news') === kind).slice(0, n);
}
export const guidelines = store => store.knowledge.filter(d => d.category === 'guideline' && d.status === 'official');

// dữ kiện ĐÃ CÓ của sự kiện (do người dùng nhập/xác nhận) — nguồn duy nhất AI được coi là sự thật về sự kiện
export function eventFacts(ev) {
  if (!ev) return '';
  const d = ev.event_date ? new Date(ev.event_date).toLocaleDateString('vi-VN') : '';
  const rows = [['Mã', ev.code], ['Tên sự kiện', ev.name], ['Ngày', d], ['Giờ', ev.event_time], ['Địa điểm', ev.venue], ['Đơn vị tổ chức', ev.organizer], ['Thành phần tham dự', ev.attendees], ['Ghi chú', ev.note]];
  return rows.filter(r => r[1]).map(r => `- ${r[0]}: ${r[1]}`).join('\n') + (ev.brief ? `\n\nBRIEF:\n${ev.brief.slice(0, 6000)}` : '');
}
export const FACT_RULES = `QUY TẮC BẮT BUỘC VỀ DỮ KIỆN:
- Chỉ dùng tên người, chức danh, đơn vị, thời gian, địa điểm, số liệu, lời phát biểu CÓ TRONG phần "DỮ KIỆN" bên dưới. Tuyệt đối không tự thêm, không suy đoán.
- Không tự tạo trích dẫn. Chỉ đặt trong ngoặc kép những câu có nguyên văn trong dữ kiện.
- Chỗ nào thiếu thông tin thì viết đúng dạng [CẦN BỔ SUNG: cần gì] thay vì bịa.
- Viết bằng tiếng Việt, văn phong báo chí – trang trọng, khách quan.`;

// Phân loại sơ bộ 1 file theo tên thư mục/tên file (người dùng xác nhận lại trước khi nhập)
export function guessCategory(name, path = '') {
  const s = (path + ' ' + name).toLowerCase();
  if (/timeline/.test(s)) return {category: 'timeline_template', kind: 'timeline'};
  if (/phân công|lịch công tác|nhân lực|nhân sự/.test(s)) return {category: 'template', kind: 'schedule'};
  if (/caption|facebook|fanpage/.test(s)) return {category: 'article_sample', kind: 'caption'};
  if (/đã (được )?duyệt|approved/.test(s)) return {category: 'approved_article', kind: 'news'};
  if (/thư mời/.test(s)) return {category: 'article_sample', kind: 'invite'};
  if (/thông báo/.test(s)) return {category: 'article_sample', kind: 'announce'};
  if (/quy chuẩn|quy định|checklist|hướng dẫn|guideline/.test(s)) return {category: 'guideline', kind: null};
  if (/brief/.test(s)) return {category: 'event_record', kind: null};
  return {category: 'reference', kind: null};
}
// Tên riêng kèm danh xưng trong 1 văn bản (để đối chiếu với nguồn). Chỉ là dò theo mẫu chữ — kết quả là "cần xác minh", không phải kết luận.
const TITLE = '(?:PGS\\.?\\s?TS\\.?|GS\\.?\\s?TS\\.?|TS\\.?|ThS\\.?|LS\\.?|Luật sư|ông|bà|Ông|Bà|anh|chị|thầy|cô|Thầy|Cô)';
const NAME = '(?:\\p{Lu}[\\p{Ll}]+\\s){1,4}\\p{Lu}[\\p{Ll}]+';
export function findPeople(text) {
  const out = new Map();
  for (const m of String(text || '').matchAll(new RegExp(`${TITLE}\\s+(${NAME})`, 'gu'))) out.set(m[1].trim(), m[0].trim());
  return [...out].map(([name, full]) => ({name, full}));
}
