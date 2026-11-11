// PHÒNG VY — WORKROOM · AI viết tài liệu ĐÚNG MẪU.
// AI chỉ điền NỘI DUNG vào dàn ý của mẫu (schema); bố cục, nhãn, chữ cố định, định dạng do kinds.js + fmt.js đảm bảo.
// Văn phong: lấy từ chính các bài mẫu của Vy (lưu riêng tư trong cơ sở dữ liệu, mục "sample").
import {KINDS, asText} from './kinds.js';
import {toAI} from './sources.js';

const clip = (s, n) => { s = String(s || ''); return s.length > n ? s.slice(0, n) + '\n…' : s; };
export const RULES = `Bạn là biên tập viên Phòng Truyền thông & Quan hệ doanh nghiệp, Trường Đại học Luật TP. Hồ Chí Minh (ULAW).
Viết tiếng Việt chuẩn mực, trang trọng, đúng văn phong các bài mẫu của phòng. Dùng "Trường Đại học Luật TP. Hồ Chí Minh"/"ULAW"/"Nhà trường" như mẫu.
QUY TẮC DỮ KIỆN (bắt buộc): chỉ dùng tên người, chức danh, học hàm học vị, ngày giờ, địa điểm, số liệu, trích dẫn có trong THÔNG TIN được cung cấp. Tuyệt đối không bịa. Chỗ thiếu dữ kiện ghi đúng "[CẦN BỔ SUNG]" (có thể kèm gợi ý cần gì, vd "[CẦN BỔ SUNG: tên diễn giả]").
Không chép dữ kiện từ bài mẫu sang bài mới — mẫu chỉ để học cấu trúc, cách viết, độ dài.
Dùng **chữ đậm** đúng chỗ mẫu in đậm (nhãn như "**- Text:**"). Không dùng markdown khác (không #, không gạch đầu dòng kiểu *).`;

export function samples(store, kind, n = 2) {
  return (store.knowledge || []).filter(k => k.category === 'sample' && k.status === 'official' && k.meta && k.meta.kind === kind).slice(0, n);
}
export function staffList(store) {
  const L = (store.staff || []).filter(s => s.active !== false);
  return L.length ? L.map(s => `- ${s.name}${(s.roles || []).length ? ' (' + s.roles.join(', ') + ')' : ''}${s.note ? ' — ' + s.note : ''}`).join('\n') : '(chưa có danh sách — để trống phần phân công người)';
}
export function programFacts(ev) {
  if (!ev) return '';
  const f = [['Tên chương trình', ev.name], ['Ngày', ev.event_date ? ev.event_date.split('-').reverse().join('/') : ''], ['Giờ', ev.event_time], ['Địa điểm', ev.venue], ['Đơn vị tổ chức', ev.organizer], ['Thành phần', ev.attendees], ['Brief / ghi chú', ev.brief], ['Ghi chú khác', ev.note]];
  return f.filter(x => x[1]).map(x => `${x[0]}: ${x[1]}`).join('\n');
}
// giữ các trường cố định của mẫu khi AI không trả về (footer, nhân sự, ký tên…)
function merge(base, out) {
  if (Array.isArray(out)) return out;
  if (out && typeof out === 'object') { const r = {...(base && typeof base === 'object' && !Array.isArray(base) ? base : {})}; for (const k in out) if (out[k] != null && out[k] !== '') r[k] = merge(r[k], out[k]); return r; }
  return out;
}
// viết / viết lại. o: {brief, program, current, instruction, opts}
export async function writeDoc(ctx, kind, o = {}) {
  const K = KINDS[kind], store = ctx.store, sm = samples(store, kind);
  const sys = [RULES, '', 'LOẠI TÀI LIỆU: ' + K.name, K.guide,
    sm.length ? '\nBÀI MẪU CỦA PHÒNG (học cấu trúc & văn phong, KHÔNG chép dữ kiện):\n' + sm.map((s, i) => `--- MẪU ${i + 1}: ${s.name} ---\n${clip(s.content, 7000)}`).join('\n') : '',
    /schedule|timeline/.test(kind) ? '\nDANH SÁCH NHÂN SỰ (chỉ phân công những người này):\n' + staffList(store) : ''].join('\n');
  const opts = o.opts ? Object.entries(o.opts).filter(([, v]) => v).map(([k, v]) => `- ${({tone: 'Giọng văn', length: 'Độ dài', emoji: 'Emoji', extra: 'Yêu cầu thêm', des: 'Kèm nội dung DES'})[k] || k}: ${v}`).join('\n') : '';
  const src = toAI(o.sources || []);
  const has = o.current && asText(kind, o.current).replace(/\s|\[CẦN BỔ SUNG\]|-+/g, '').length > 80;
  const prompt = [
    o.program ? 'THÔNG TIN CHƯƠNG TRÌNH:\n' + programFacts(o.program) : '',
    o.brief ? 'THÔNG TIN / TƯ LIỆU VY CUNG CẤP:\n' + clip(o.brief, 24000) : '',
    src.text ? 'NGUỒN VY NẠP VÀO (phân tích kỹ, lấy dữ kiện từ đây):\n' + clip(src.text, 60000) : '', src.note,
    opts ? 'TUỲ CHỌN:\n' + opts : '',
    has ? 'BẢN HIỆN TẠI (JSON):\n' + clip(JSON.stringify(o.current), 20000) : '',
    o.instruction ? 'YÊU CẦU: ' + o.instruction : (has ? 'YÊU CẦU: hoàn thiện bản hiện tại, giữ những gì đã đúng.' : 'YÊU CẦU: viết bản hoàn chỉnh.'),
    has ? 'Trả về TOÀN BỘ tài liệu sau khi sửa (JSON đúng schema); phần không cần sửa giữ nguyên.' : 'Trả về JSON đúng schema.',
  ].filter(Boolean).join('\n\n');
  const out = await ctx.ai.json({task: (has ? 'Sửa ' : 'Viết ') + K.short, system: sys, prompt, parts: src.parts, schema: o.schema || K.schema, temperature: 0.6});
  if (o.raw) return out;
  return merge(o.current || K.blank(), out);
}
// caption: 3 phương án khác nhau để Vy chọn
export async function captionVariants(ctx, o) {
  const one = KINDS.caption.schema;
  const r = await writeDoc(ctx, 'caption', {...o, raw: true, schema: {type: 'OBJECT', properties: {variants: {type: 'ARRAY', items: one}}, required: ['variants']},
    instruction: (o.instruction ? o.instruction + '. ' : '') + 'Viết 3 phương án KHÁC NHAU rõ rệt (cách mở, nhịp, emoji) — đều đúng mẫu.'});
  return (r.variants || []).slice(0, 3).map(v => merge(o.current || KINDS.caption.blank(), v));
}
// đọc nhanh thông tin chương trình từ brief dán vào
export async function extractProgram(ctx, text) {
  return ctx.ai.json({task: 'Đọc brief', system: RULES + '\nTrích thông tin chương trình/sự kiện từ văn bản. Không đoán; không có thì để trống.',
    prompt: clip(text, 20000), schema: {type: 'OBJECT', properties: {name: {type: 'STRING'}, event_date: {type: 'STRING', description: 'YYYY-MM-DD'}, event_time: {type: 'STRING'}, venue: {type: 'STRING'}, organizer: {type: 'STRING'}, attendees: {type: 'STRING'}, brief: {type: 'STRING', description: 'tóm tắt nội dung chính 3-6 câu'}}, required: ['name']}, temperature: 0.1});
}
