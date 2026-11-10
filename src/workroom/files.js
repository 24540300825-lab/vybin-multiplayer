// PHÒNG VY — WORKROOM · đọc/ghi file Word (.docx), Excel (.xlsx), CSV ngay trên trình duyệt — không tải thư viện ngoài.
// Đọc: lấy văn bản (docx) hoặc bảng giá trị (xlsx). Ghi: tài liệu/bảng đơn giản, mở được bằng Word / Excel / Google Docs / Sheets.
// Giới hạn đã biết: không giữ ảnh, màu, công thức khi ĐỌC; khi cần giữ nguyên định dạng mẫu thì dùng bản sao trên Google (xem google.js).
const enc = new TextEncoder(), dec = new TextDecoder();
const X = s => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;'})[c]).replace(/[\x00-\x08\x0b\x0c\x0e-\x1f]/g, '');
const unX = s => s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&#(\d+);/g, (m, n) => String.fromCodePoint(+n)).replace(/&#x([0-9a-f]+);/gi, (m, n) => String.fromCodePoint(parseInt(n, 16))).replace(/&amp;/g, '&');

// ---------- ZIP ----------
const CRC = (() => { const t = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
const crc32 = b => { let c = ~0; for (let i = 0; i < b.length; i++) c = CRC[(c ^ b[i]) & 255] ^ (c >>> 8); return ~c >>> 0; };
export function zip(files) {   // {tên: chuỗi | Uint8Array} — lưu không nén
  const parts = [], cen = []; let off = 0;
  for (const [name, data] of Object.entries(files)) {
    const nb = enc.encode(name), b = typeof data === 'string' ? enc.encode(data) : data, crc = crc32(b);
    const hd = new DataView(new ArrayBuffer(30)); hd.setUint32(0, 0x04034b50, true); hd.setUint16(4, 20, true); hd.setUint16(6, 0x800, true); hd.setUint32(14, crc, true); hd.setUint32(18, b.length, true); hd.setUint32(22, b.length, true); hd.setUint16(26, nb.length, true);
    const cd = new DataView(new ArrayBuffer(46)); cd.setUint32(0, 0x02014b50, true); cd.setUint16(4, 20, true); cd.setUint16(6, 20, true); cd.setUint16(8, 0x800, true); cd.setUint32(16, crc, true); cd.setUint32(20, b.length, true); cd.setUint32(24, b.length, true); cd.setUint16(28, nb.length, true); cd.setUint32(42, off, true);
    parts.push(new Uint8Array(hd.buffer), nb, b); cen.push(new Uint8Array(cd.buffer), nb); off += 30 + nb.length + b.length;
  }
  const cs = cen.reduce((n, x) => n + x.length, 0), end = new DataView(new ArrayBuffer(22));
  end.setUint32(0, 0x06054b50, true); end.setUint16(8, cen.length / 2, true); end.setUint16(10, cen.length / 2, true); end.setUint32(12, cs, true); end.setUint32(16, off, true);
  return new Blob([...parts, ...cen, new Uint8Array(end.buffer)]);
}
export async function unzip(buf, want) {   // → {tên: chuỗi} cho những tên khớp want(name)
  const u = new Uint8Array(buf), v = new DataView(u.buffer, u.byteOffset, u.byteLength); let e = u.length - 22;
  while (e >= 0 && v.getUint32(e, true) !== 0x06054b50) e--;
  if (e < 0) throw new Error('File không đúng định dạng (không phải .docx/.xlsx hợp lệ)');
  const n = v.getUint16(e + 10, true); let p = v.getUint32(e + 16, true); const out = {};
  for (let i = 0; i < n; i++) {
    const method = v.getUint16(p + 10, true), cs = v.getUint32(p + 20, true), nl = v.getUint16(p + 28, true), el = v.getUint16(p + 30, true), cl = v.getUint16(p + 32, true), lo = v.getUint32(p + 42, true);
    const name = dec.decode(u.subarray(p + 46, p + 46 + nl)); p += 46 + nl + el + cl;
    if (!want(name)) continue;
    const ds = lo + 30 + v.getUint16(lo + 26, true) + v.getUint16(lo + 28, true), raw = u.subarray(ds, ds + cs);
    if (method === 0) out[name] = dec.decode(raw);
    else if (method === 8) out[name] = await new Response(new Blob([raw]).stream().pipeThrough(new DecompressionStream('deflate-raw'))).text();
    else throw new Error('Kiểu nén không hỗ trợ');
  }
  return out;
}

// ---------- DOCX ----------
// đọc: mỗi đoạn văn 1 dòng; tiêu đề (Heading/Title) thành "# …"; in đậm cả đoạn giữ nguyên chữ
export async function readDocx(buf) {
  const f = await unzip(buf, n => n === 'word/document.xml'), xml = f['word/document.xml'];
  if (!xml) throw new Error('Không đọc được nội dung file Word');
  const out = [];
  for (const m of xml.matchAll(/<w:p[ >][\s\S]*?<\/w:p>|<w:p\/>/g)) {
    const p = m[0], style = (p.match(/<w:pStyle w:val="([^"]+)"/) || [])[1] || '';
    const t = [...p.matchAll(/<w:t(?:\s[^>]*)?>([\s\S]*?)<\/w:t>|<w:tab\/>|<w:br\/>/g)].map(x => x[1] != null ? unX(x[1]) : x[0] === '<w:tab/>' ? '\t' : '\n').join('').trim();
    if (!t) continue;
    const lv = /^(Title|Tiu|Heading1|u1)/i.test(style) ? 1 : /Heading2|u2/i.test(style) ? 2 : /Heading3|u3/i.test(style) ? 3 : 0;
    out.push((lv ? '#'.repeat(lv) + ' ' : '') + t);
  }
  return out.join('\n\n');
}
// ghi: từ HTML của trình soạn thảo (h2/h3/p/ul/ol/b/i/u)
export function writeDocx(title, html) {
  const d = document.createElement('div'); d.innerHTML = html || '';
  const runs = (node, f = {}) => [...node.childNodes].map(c => {
    if (c.nodeType === 3) return c.nodeValue ? `<w:r><w:rPr>${f.b ? '<w:b/>' : ''}${f.i ? '<w:i/>' : ''}${f.u ? '<w:u w:val="single"/>' : ''}</w:rPr><w:t xml:space="preserve">${X(c.nodeValue)}</w:t></w:r>` : '';
    if (c.nodeType !== 1) return '';
    if (c.tagName === 'BR') return '<w:r><w:br/></w:r>';
    return runs(c, {b: f.b || /^(B|STRONG)$/.test(c.tagName), i: f.i || /^(I|EM)$/.test(c.tagName), u: f.u || c.tagName === 'U'});
  }).join('');
  const para = (inner, o = {}) => `<w:p><w:pPr>${o.center ? '<w:jc w:val="center"/>' : o.right ? '<w:jc w:val="right"/>' : '<w:jc w:val="both"/>'}<w:spacing w:after="${o.after ?? 160}" w:line="312" w:lineRule="auto"/>${o.ind ? '<w:ind w:left="360" w:hanging="240"/>' : ''}</w:pPr>${inner}</w:p>`;
  const sized = (inner, sz) => inner.replace(/<w:rPr>/g, `<w:rPr><w:b/><w:sz w:val="${sz}"/><w:szCs w:val="${sz}"/>`);
  let body = title ? para(sized(`<w:r><w:rPr></w:rPr><w:t xml:space="preserve">${X(title)}</w:t></w:r>`, 30), {center: true, after: 240}) : '';
  const blocks = d.children.length ? [...d.children] : [Object.assign(document.createElement('p'), {textContent: d.textContent})];
  for (const b of blocks) {
    if (/^H[1-4]$/.test(b.tagName)) body += para(sized(runs(b), b.tagName === 'H2' ? 28 : 26), {after: 120});
    else if (b.tagName === 'UL' || b.tagName === 'OL') [...b.children].forEach((li, i) => { body += para(`<w:r><w:rPr></w:rPr><w:t xml:space="preserve">${b.tagName === 'OL' ? i + 1 + '. ' : '• '}</w:t></w:r>` + runs(li), {ind: true, after: 60}); });
    else body += para(runs(b), {center: b.style && b.style.textAlign === 'center', right: b.style && b.style.textAlign === 'right'});
  }
  const NS = 'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"';
  return zip({
    '[Content_Types].xml': '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/><Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/></Types>',
    '_rels/.rels': '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>',
    'word/_rels/document.xml.rels': '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>',
    'word/styles.xml': `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:styles ${NS}><w:docDefaults><w:rPrDefault><w:rPr><w:rFonts w:ascii="Times New Roman" w:hAnsi="Times New Roman" w:cs="Times New Roman" w:eastAsia="Times New Roman"/><w:sz w:val="26"/><w:szCs w:val="26"/><w:lang w:val="vi-VN"/></w:rPr></w:rPrDefault></w:docDefaults><w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/></w:style></w:styles>`,
    'word/document.xml': `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document ${NS}><w:body>${body}<w:sectPr><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="1134" w:right="1134" w:bottom="1134" w:left="1701" w:header="708" w:footer="708" w:gutter="0"/></w:sectPr></w:body></w:document>`,
  });
}

// ---------- XLSX ----------
const colName = i => { let s = ''; for (i++; i > 0; i = Math.floor((i - 1) / 26)) s = String.fromCharCode(65 + (i - 1) % 26) + s; return s; };
const colIdx = ref => { let n = 0; for (const c of ref.replace(/\d+/g, '')) n = n * 26 + c.charCodeAt(0) - 64; return n - 1; };
// đọc: trang tính đầu tiên → mảng 2 chiều giá trị (chuỗi)
export async function readXlsx(buf) {
  const f = await unzip(buf, n => /^xl\/(sharedStrings\.xml|workbook\.xml|worksheets\/sheet\d+\.xml)$/.test(n));
  const ss = [...(f['xl/sharedStrings.xml'] || '').matchAll(/<si>([\s\S]*?)<\/si>/g)].map(m => [...m[1].matchAll(/<t(?:\s[^>]*)?>([\s\S]*?)<\/t>/g)].map(x => unX(x[1])).join(''));
  const sheet = Object.keys(f).filter(n => /worksheets\/sheet/.test(n)).sort((a, b) => a.length - b.length || a.localeCompare(b))[0];
  if (!sheet) throw new Error('Không tìm thấy trang tính trong file Excel');
  const rows = [];
  for (const rm of f[sheet].matchAll(/<row[^>]*?r="(\d+)"[^>]*>([\s\S]*?)<\/row>/g)) {
    const r = +rm[1] - 1; rows[r] ||= [];
    for (const c of rm[2].matchAll(/<c\s([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
      const ref = (c[1].match(/r="([A-Z]+\d+)"/) || [])[1], t = (c[1].match(/t="(\w+)"/) || [])[1], inner = c[2] || '';
      const vv = (inner.match(/<v>([\s\S]*?)<\/v>/) || [])[1], is = [...inner.matchAll(/<t(?:\s[^>]*)?>([\s\S]*?)<\/t>/g)].map(x => unX(x[1])).join('');
      let val = t === 's' ? ss[+vv] ?? '' : t === 'inlineStr' ? is : t === 'b' ? (vv === '1' ? 'TRUE' : 'FALSE') : vv != null ? unX(vv) : '';
      if (ref) rows[r][colIdx(ref)] = val;
    }
  }
  const w = Math.max(0, ...rows.map(r => r ? r.length : 0));
  return Array.from(rows, r => Array.from({length: w}, (_, i) => (r && r[i] != null ? String(r[i]) : '')));
}
// ghi: mảng 2 chiều; opt.bold = Set các chỉ số dòng in đậm; opt.widths = độ rộng cột
export function writeXlsx(rows, opt = {}) {
  const bold = opt.bold || new Set();
  const data = rows.map((r, i) => `<row r="${i + 1}">${r.map((v, j) => {
    if (v === '' || v == null) return '';
    const ref = colName(j) + (i + 1), s = bold.has(i) ? ' s="1"' : ' s="2"';
    if (typeof v === 'boolean') return `<c r="${ref}" t="b"${s}><v>${v ? 1 : 0}</v></c>`;
    if (typeof v === 'number') return `<c r="${ref}"${s}><v>${v}</v></c>`;
    return `<c r="${ref}" t="inlineStr"${s}><is><t xml:space="preserve">${X(v)}</t></is></c>`;
  }).join('')}</row>`).join('');
  const cols = opt.widths ? `<cols>${opt.widths.map((w, i) => `<col min="${i + 1}" max="${i + 1}" width="${w}" customWidth="1"/>`).join('')}</cols>` : '';
  const M = 'xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"';
  return zip({
    '[Content_Types].xml': '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/></Types>',
    '_rels/.rels': '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>',
    'xl/_rels/workbook.xml.rels': '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>',
    'xl/workbook.xml': `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook ${M} xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="${X(opt.sheet || 'Sheet1')}" sheetId="1" r:id="rId1"/></sheets></workbook>`,
    'xl/styles.xml': `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><styleSheet ${M}><fonts count="2"><font><sz val="11"/><name val="Times New Roman"/></font><font><b/><sz val="11"/><name val="Times New Roman"/></font></fonts><fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills><borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="3"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1" applyAlignment="1"><alignment vertical="center" wrapText="1"/></xf><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0" applyAlignment="1"><alignment vertical="top" wrapText="1"/></xf></cellXfs></styleSheet>`,
    'xl/worksheets/sheet1.xml': `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet ${M}>${cols}<sheetData>${data}</sheetData></worksheet>`,
  });
}
export function readCsv(text) {
  const rows = []; let row = [], cur = '', q = false;
  for (let i = 0; i < text.length; i++) { const c = text[i];
    if (q) { if (c === '"') { if (text[i + 1] === '"') { cur += '"'; i++; } else q = false; } else cur += c; }
    else if (c === '"') q = true; else if (c === ',') { row.push(cur); cur = ''; } else if (c === '\n') { row.push(cur); rows.push(row); row = []; cur = ''; } else if (c !== '\r') cur += c; }
  if (cur || row.length) { row.push(cur); rows.push(row); }
  return rows;
}
// đọc 1 file người dùng chọn → {kind:'text'|'table', text, rows}
export async function readAnyFile(file) {
  const n = file.name.toLowerCase();
  if (n.endsWith('.docx')) return {kind: 'text', text: await readDocx(await file.arrayBuffer())};
  if (n.endsWith('.xlsx')) { const rows = await readXlsx(await file.arrayBuffer()); return {kind: 'table', rows, text: rows.map(r => r.join(' | ')).join('\n')}; }
  if (n.endsWith('.csv')) { const rows = readCsv(await file.text()); return {kind: 'table', rows, text: rows.map(r => r.join(' | ')).join('\n')}; }
  if (/\.(txt|md|json)$/.test(n)) return {kind: 'text', text: await file.text()};
  throw new Error('Chưa hỗ trợ loại file này. Dùng .docx, .xlsx, .csv hoặc .txt');
}
