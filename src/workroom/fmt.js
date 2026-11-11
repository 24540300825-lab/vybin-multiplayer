// PHÒNG VY — WORKROOM · máy in theo MẪU THẬT.
// Mỗi tài liệu được dựng từ khung định dạng của chính file mẫu Vy đưa (src/workroom/tpl/*, sinh bởi tools/build-workroom-tpl.py):
// giữ nguyên styles, khổ giấy, lề, đánh số, và XML định dạng của từng loại đoạn/ô. Chỉ thay chữ.
// Bố cục (layout) = danh sách khối: {p:'khoá', t:'chữ'} | {table:'T'|'I', rows:[{cells:[[{p,t}]...]} | {span:[{p,t}]}]}
// Chữ hỗ trợ **đậm** và *nghiêng*; xuống dòng = đoạn mới cùng định dạng.
import {SPEC} from './tpl/spec.js';
import {zip, unzipAll, utf8} from './files.js';

const X = s => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;'})[c]).replace(/[\x00-\x08\x0b\x0c\x0e-\x1f]/g, '');
// "**a** b *c*" → [{t,b,i}]
export function segs(text, b0 = false, i0 = false) {
  const out = [], re = /\*\*([\s\S]+?)\*\*|\*([^*\n]+?)\*/g; let last = 0, m;
  const s = String(text == null ? '' : text);
  while ((m = re.exec(s))) {
    if (m.index > last) out.push({t: s.slice(last, m.index), b: b0, i: i0});
    out.push(m[1] != null ? {t: m[1], b: true, i: i0} : {t: m[2], b: b0, i: true}); last = re.lastIndex;
  }
  if (last < s.length) out.push({t: s.slice(last), b: b0, i: i0});
  return out;
}
export const plain = s => String(s == null ? '' : s).replace(/\*\*([\s\S]+?)\*\*/g, '$1').replace(/\*([^*\n]+?)\*/g, '$1');
const flags = (rpr, b, i) => {
  const f = (b ? '<w:b w:val="1"/><w:bCs w:val="1"/>' : '<w:b w:val="0"/><w:bCs w:val="0"/>') + (i ? '<w:i w:val="1"/><w:iCs w:val="1"/>' : '<w:i w:val="0"/><w:iCs w:val="0"/>');
  if (!rpr || rpr === '<w:rPr></w:rPr>') return '<w:rPr>' + f + '</w:rPr>';
  return /<w:rFonts[^>]*\/>/.test(rpr) ? rpr.replace(/(<w:rFonts[^>]*\/>)/, '$1' + f) : rpr.replace(/^<w:rPr>(<w:rStyle[^>]*\/>)?/, (m0, st) => '<w:rPr>' + (st || '') + f);
};
function para(pr, line, bl = {}) {
  const runs = segs(line, bl.b ?? pr.b, bl.i ?? pr.i).filter(s => s.t).map(s => `<w:r>${flags(pr.rpr, s.b, s.i)}<w:t xml:space="preserve">${X(s.t)}</w:t></w:r>`).join('');
  return `<w:p>${pr.ppr}${runs}</w:p>`;
}
const lines = t => String(t == null ? '' : t).split('\n');
function paras(spec, blocks, table) {
  return blocks.map(bl => {
    const pr = (table ? spec[table].C || {} : {})[bl.p] || spec.P[bl.p] || (table && (spec[table][bl.p] || (spec[table].span && spec[table].span[bl.p])));
    if (!pr) throw new Error('Mẫu thiếu kiểu đoạn: ' + bl.p);
    return lines(bl.t).map(l => para(pr, l, bl)).join('');
  }).join('');
}
function tableXml(spec, blk) {
  const T = spec[blk.table];
  const rows = blk.rows.map(r => {
    if (r.raw) return r.raw;
    if (r.span) { const sp = T.span || {trPr: T.trPr, tcPr: T.tcPr && T.tcPr[0]}; return `<w:tr>${sp.trPr}<w:tc>${sp.tcPr}${paras(spec, r.span.length ? r.span : [{p: 'plain', t: ''}], blk.table) || '<w:p/>'}</w:tc></w:tr>`; }
    const tc = Array.isArray(T.tcPr) ? T.tcPr : [T.tcPr];
    return `<w:tr>${T.trPr}${r.cells.map((c, i) => `<w:tc>${tc[Math.min(i, tc.length - 1)]}${paras(spec, c.length ? c : [{p: blk.empty || 'note', t: ''}], blk.table) || '<w:p/>'}</w:tc>`).join('')}</w:tr>`;
  }).join('');
  return `<w:tbl>${T.pr}${T.grid}${blk.head === false ? '' : (T.head || '')}${rows}</w:tbl>`;
}
export function bodyXml(id, layout) {
  const spec = SPEC[id];
  return layout.map(b => b.table ? tableXml(spec, b) : paras(spec, [b])).join('');
}
const cache = {};
async function tpl(file) {
  if (!cache[file]) cache[file] = fetch(new URL('./tpl/' + file, import.meta.url)).then(r => { if (!r.ok) throw new Error('Không tải được khung mẫu ' + file); return r.arrayBuffer(); }).then(unzipAll).catch(e => { delete cache[file]; throw e; });
  return cache[file];
}
export async function docx(id, layout, file = id + '.docx') {
  const parts = {...await tpl(file)};
  const doc = utf8.dec(parts['word/document.xml']).replace('{{BODY}}', bodyXml(id, layout));
  parts['word/document.xml'] = utf8.enc(doc);
  return new Blob([await zip(parts).arrayBuffer()], {type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'});
}

// ---------- TIMELINE (.xlsx) theo đúng bảng mẫu ----------
const colN = c => c.charCodeAt(0) - 64, COLS = 'ABCDEFGHIJK'.split('');
const cell = (ref, s, v) => {
  if (v == null || v === '') return `<c r="${ref}" s="${s}"/>`;
  if (typeof v === 'boolean') return `<c r="${ref}" s="${s}" t="b"><v>${v ? 1 : 0}</v></c>`;
  if (typeof v === 'number') return `<c r="${ref}" s="${s}"><v>${v}</v></c>`;
  return `<c r="${ref}" s="${s}" t="inlineStr"><is><t xml:space="preserve">${X(v)}</t></is></c>`;
};
// d: {title, date, channel, phases:[{name, items:[{content, format, deadline, publish, channel, a_content, a_media, a_editor, note, done}]}]}
export async function timelineXlsx(d) {
  const S = SPEC.timeline, rows = [], merges = [...S.merges];
  S.head.forEach((cs, i) => {
    const r = i + 1;
    rows.push(`<row r="${r}">${cs.map(([c, s, v]) => cell(c + r, s, r === 4 && c === 'A' ? d.title : r === 3 && c === 'E' ? d.date : v)).join('')}</row>`);
  });
  let r = 7;
  const band = (styles, text) => { rows.push(`<row r="${r}">${COLS.map(c => cell(c + r, styles[c], c === 'A' ? text : null)).join('')}</row>`); merges.push(`A${r}:K${r}`); r++; };
  if (d.channel) band(S.channel, d.channel);
  let n = 0;
  for (const ph of d.phases || []) {
    if (ph.name) band(S.phase, ph.name);
    for (const it of ph.items || []) {
      n++;
      const v = {A: n, B: it.content, C: it.format, D: it.deadline, E: it.publish, F: it.channel, G: it.a_content, H: it.a_media, I: it.a_editor, J: it.note, K: !!it.done};
      rows.push(`<row r="${r}">${COLS.map(c => cell(c + r, S.item[c], v[c])).join('')}</row>`); r++;
    }
  }
  const sheet = `${S.sheetHead}<sheetData>${rows.join('')}</sheetData><mergeCells count="${merges.length}">${merges.map(m => `<mergeCell ref="${m}"/>`).join('')}</mergeCells><pageMargins left="0.7" right="0.7" top="0.75" bottom="0.75" header="0.3" footer="0.3"/></worksheet>`;
  const parts = {...await tpl('timeline.xlsx')};
  parts['xl/worksheets/sheet1.xml'] = utf8.enc(sheet);
  return new Blob([await zip(parts).arrayBuffer()], {type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'});
}

// ---------- XEM TRƯỚC (HTML) — đọc thẳng định dạng từ mẫu để trang xem giống file thật ----------
const at = (x, re) => { const m = x && x.match(re); return m ? m[1] : null; };
function css(pr) {
  const jc = at(pr.ppr, /<w:jc w:val="(\w+)"/), sz = at(pr.rpr, /<w:sz w:val="(\d+)"/) || at(pr.ppr, /<w:sz w:val="(\d+)"/);
  const bef = at(pr.ppr, /w:before="([\d.]+)"/), aft = at(pr.ppr, /w:after="([\d.]+)"/), ind = at(pr.ppr, /<w:ind w:left="([\d.]+)"/), num = /<w:numPr>/.test(pr.ppr);
  return [jc && `text-align:${({both: 'justify', left: 'left', right: 'right', center: 'center'})[jc] || jc}`, sz && `font-size:${sz / 2}pt`, `margin:${bef ? bef / 20 : 0}pt 0 ${aft != null ? aft / 20 : 8}pt ${ind ? ind / 20 : 0}pt`, num && 'display:list-item;list-style:disc inside'].filter(Boolean).join(';');
}
const segHtml = (pr, l, bl = {}) => segs(l, bl.b ?? pr.b, bl.i ?? pr.i).map(s => `<span style="${s.b ? 'font-weight:700;' : ''}${s.i ? 'font-style:italic' : ''}">${X(s.t)}</span>`).join('') || '&nbsp;';
function parasHtml(spec, blocks, table) {
  return blocks.map(bl => { const pr = (table ? spec[table].C || {} : {})[bl.p] || spec.P[bl.p] || (table && (spec[table][bl.p] || (spec[table].span && spec[table].span[bl.p]))); if (!pr) return ''; const st = css(pr);
    return lines(bl.t).map(l => `<p style="${st}"${bl.hl ? ` data-hl="${X(bl.hl)}"` : ''}>${segHtml(pr, l, bl)}</p>`).join(''); }).join('');
}
export function previewHtml(id, layout) {
  const spec = SPEC[id];
  return layout.map(b => {
    if (!b.table) return parasHtml(spec, [b]);
    const T = spec[b.table], w = [...(T.grid || '').matchAll(/w:w="([\d.]+)"/g)].map(m => +m[1]), tot = w.reduce((a, x) => a + x, 0) || 1;
    const head = b.head === false || typeof T.head !== 'string' ? '' : (T.head ? `<tr>${[...T.head.matchAll(/<w:tc>.*?<\/w:tc>/gs)].map(m => `<th>${X([...m[0].matchAll(/<w:t[^>]*>([^<]*)<\/w:t>/g)].map(x => x[1]).join('').replace(/&amp;/g, '&'))}</th>`).join('')}</tr>` : '');
    return `<table class="pv-t"><colgroup>${w.map(x => `<col style="width:${(x / tot * 100).toFixed(1)}%">`).join('')}</colgroup>${head}${b.rows.map(r => r.span ? `<tr><td colspan="${w.length}">${parasHtml(spec, r.span, b.table)}</td></tr>` : `<tr>${r.cells.map(c => `<td>${parasHtml(spec, c, b.table)}</td>`).join('')}</tr>`).join('')}</table>`;
  }).join('');
}
export function timelineHtml(d) {
  const H = ['STT', 'Nội dung thực hiện', 'Hình thức đi bài', 'Deadline', 'Thời gian đăng', 'Nơi đăng', 'Nội dung', 'Media', 'Biên tập', 'Ghi chú', 'Trạng thái'];
  let n = 0;
  const band = (t, cls) => `<tr class="${cls}"><td colspan="11">${X(t)}</td></tr>`;
  return `<div class="pv-xh"><div>BỘ GIÁO DỤC VÀ ĐÀO TẠO<br>TRƯỜNG ĐẠI HỌC LUẬT TP.HCM</div><div><b>CỘNG HÒA XÃ HỘI CHỦ NGHĨA VIỆT NAM<br>Độc lập - Tự do - Hạnh phúc</b><br><i>${X(d.date || '')}</i></div></div>
  <p class="pv-xt">${X(d.title || '').replace(/\n/g, '<br>')}</p><table class="pv-t pv-x"><tr>${H.map(x => `<th>${x}</th>`).join('')}</tr>${d.channel ? band(d.channel, 'ch') : ''}
  ${(d.phases || []).map(ph => (ph.name ? band(ph.name, 'ph') : '') + (ph.items || []).map(it => `<tr><td class="n">${++n}</td><td class="b">${X(it.content)}</td><td>${X(it.format)}</td><td>${X(it.deadline)}</td><td>${X(it.publish)}</td><td>${X(it.channel)}</td><td class="a">${X(it.a_content)}</td><td class="a">${X(it.a_media)}</td><td class="a">${X(it.a_editor)}</td><td>${X(it.note)}</td><td>${it.done ? '☑' : '☐'}</td></tr>`).join('')).join('')}</table>`;
}
