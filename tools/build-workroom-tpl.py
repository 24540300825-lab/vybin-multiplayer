# Tạo "khung định dạng" cho Workroom từ các file mẫu THẬT của Vy (không đưa nội dung mẫu vào repo).
# Chạy: python3 -I tools/build-workroom-tpl.py <thư mục chứa mẫu>
#   cần: script_news.docx script_en.docx script_video.docx caption.docx schedule.docx article1.docx timeline.xlsx
# Ra:  src/workroom/tpl/<id>.docx|xlsx (giữ styles, lề, khổ giấy, numbering; thân văn bản rỗng)
#      src/workroom/tpl/spec.js (định dạng từng loại đoạn / ô / dòng, lấy nguyên XML từ mẫu)
import sys, os, re, json, zipfile, io
SRC = sys.argv[1]; OUT = os.path.join(os.path.dirname(__file__), '..', 'src', 'workroom', 'tpl')
os.makedirs(OUT, exist_ok=True)

RID = re.compile(r' w:rsid\w*="[^"]*"| w14:paraId="[^"]*"| w14:textId="[^"]*"')
def clean(x): return RID.sub('', x)
def paras(xml): return re.findall(r'<w:p[ >].*?</w:p>|<w:p/>', xml, re.S)
def text(p): return ''.join(re.findall(r'<w:t[^>]*>([^<]*)</w:t>', p))
def ppr(p):
    m = re.search(r'<w:pPr>.*?</w:pPr>', p, re.S); return clean(m.group(0)) if m else ''
def rpr_of(p):
    for r in re.findall(r'<w:r[ >].*?</w:r>', p, re.S):
        if re.search(r'<w:t[^>]*>[^<]', r):
            m = re.search(r'<w:rPr>.*?</w:rPr>', r, re.S); return m.group(0) if m else '<w:rPr></w:rPr>'
    m = re.search(r'<w:pPr>.*?(<w:rPr>.*?</w:rPr>).*?</w:pPr>', p, re.S); return m.group(1) if m else '<w:rPr></w:rPr>'
FLAG = re.compile(r'<w:(b|bCs|i|iCs)(?: w:val="[^"]*")?/>')
def isOn(rpr, tag): m = re.search(r'<w:%s(?: w:val="([^"]*)")?/>' % tag, rpr); return bool(m) and (m.group(1) in (None, '1', 'true', 'on'))
def proto(p):
    r = rpr_of(p)
    return {'ppr': ppr(p), 'rpr': clean(FLAG.sub('', r)).replace('<w:rtl w:val="0"/>', ''), 'b': isOn(r, 'b'), 'i': isOn(r, 'i')}
def body_items(xml):
    b = xml[xml.index('<w:body>') + 8: xml.rindex('<w:sectPr')]
    return [m.group(0) for m in re.finditer(r'<w:tbl>.*?</w:tbl>|<w:p[ >].*?</w:p>|<w:p/>', b, re.S)]
def top_paras(xml): return [x for x in body_items(xml) if not x.startswith('<w:tbl>')]
def tables(xml): return re.findall(r'<w:tbl>.*?</w:tbl>', xml, re.S)
def rows(t): return re.findall(r'<w:tr[ >].*?</w:tr>|<w:tr>.*?</w:tr>', t, re.S)
def cells(r): return re.findall(r'<w:tc>.*?</w:tc>', r, re.S)
def tcpr(c): m = re.search(r'<w:tcPr>.*?</w:tcPr>', c, re.S); return m.group(0) if m else ''
def trpr(r): m = re.search(r'<w:trPr>.*?</w:trPr>', r, re.S); return m.group(0) if m else ''
def find(ps, start, after=0):
    for i, p in enumerate(ps):
        if i >= after and text(p).strip().startswith(start): return p
    raise SystemExit('không thấy đoạn mẫu: ' + start)
def table_shell(t):
    pr = re.search(r'<w:tblPr>.*?</w:tblPr>', t, re.S).group(0); g = re.search(r'<w:tblGrid>(?:<w:gridCol[^>]*/>)+', t).group(0) + '</w:tblGrid>'
    return clean(pr), g

def skeleton(name, out):
    zin = zipfile.ZipFile(os.path.join(SRC, name)); buf = io.BytesIO(); zout = zipfile.ZipFile(buf, 'w', zipfile.ZIP_DEFLATED)
    for it in zin.infolist():
        n = it.filename
        if n.startswith('word/media/') or n.startswith('customXml') or n == 'word/comments.xml' or n.startswith('word/people'): continue
        d = zin.read(n)
        if n == 'word/document.xml':
            x = d.decode('utf8'); s = x.index('<w:body>') + 8; e = x.rindex('<w:sectPr')
            x = x[:s] + '{{BODY}}' + x[e:]; d = x.encode('utf8')
        elif n == 'word/_rels/document.xml.rels':
            x = d.decode('utf8'); x = re.sub(r'<Relationship [^>]*Type="[^"]*/(image|comments|people)"[^>]*/>', '', x); d = x.encode('utf8')
        elif n == 'docProps/core.xml':
            x = d.decode('utf8'); x = re.sub(r'<dc:creator>.*?</dc:creator>', '<dc:creator>PHÒNG VY Workroom</dc:creator>', x); x = re.sub(r'<cp:lastModifiedBy>.*?</cp:lastModifiedBy>', '', x); x = re.sub(r'<dc:title>.*?</dc:title>', '', x); d = x.encode('utf8')
        elif n == '[Content_Types].xml':
            x = d.decode('utf8'); x = re.sub(r'<Override PartName="/(word/comments|word/people|customXml)[^>]*/>', '', x); d = x.encode('utf8')
        zout.writestr(n, d)
    zout.close(); open(os.path.join(OUT, out), 'wb').write(buf.getvalue())
    return zin.read('word/document.xml').decode('utf8')

SPEC = {}
# ---------- KỊCH BẢN BẢN TIN (ULAW TV) ----------
def news(fname, sid, appendix):
    x = skeleton(fname, sid + '.docx'); ps = top_paras(x); t = tables(x)[0]; rs = rows(t); pr, grid = table_shell(t)
    title = ps[0]; meta = find(ps, '1. Mô tả'); staff = find(ps, '- Kịch bản'); cap = find(ps, '4. Caption'); short = find(ps, 'Caption Short')
    i_cap = ps.index(find(ps, '4.1 Caption')); capbody = ps[i_cap + 2]; sep = find(ps, '-----')
    lst = [p for p in ps if re.match(r'\d\. ', text(p).strip()) and '<w:jc ' not in ppr(p)]
    r_intro, r_mc = rs[1], rs[2]; c = cells(r_mc)[0]; cp = paras(c)
    head_r = [r for r in rs if 'HEADLINES' in text(r)][0]; hp = paras(cells(head_r)[0])
    vis = paras(cells(r_mc)[1])[0]; dur = paras(cells(r_intro)[2])[0]; note = paras(cells(r_intro)[3])[0]
    spec = {'P': {'title': proto(title), 'meta': proto(meta), 'staff': proto(staff), 'label': proto(cap), 'capTitle': proto(ps[i_cap + 1]),
                  'capBody': proto(capbody), 'capList': proto(lst[0] if lst else capbody), 'sep': proto(sep), 'short': proto(short), 'blank': proto(ps[ps.index(staff) + 4]) if len(ps) > ps.index(staff) + 4 else proto(staff)},
            'T': {'pr': pr, 'grid': grid, 'head': clean(rs[0]), 'trPr': clean(trpr(r_mc)), 'tcPr': [clean(tcpr(cc)) for cc in cells(r_mc)],
                  'C': {'h': proto(cp[0]), 'tag': proto(cp[1]), 'body': proto(cp[2]), 'list': proto(hp[1]), 'vis': proto(vis), 'visB': proto(paras(cells(r_intro)[1])[0]), 'dur': proto(dur), 'note': proto(note), 'plain': proto(paras(cells(rs[3])[0])[0])}}}
    span = [r for r in rs if len(cells(r)) == 1]
    if span: spec['T']['span'] = {'trPr': clean(trpr(span[0])), 'tcPr': clean(tcpr(cells(span[0])[0])), 'p': proto(paras(cells(span[0])[0])[0])}
    if appendix:
        i = ps.index(find(ps, 'CHÀO ĐẦU')); spec['P'].update({'apxLabel': proto(ps[i]), 'apxTag': proto(ps[i + 1]), 'apxBody': proto(ps[i + 2])})
    SPEC[sid] = spec
news('script_news.docx', 'script_news', True)
news('script_en.docx', 'script_en', False)

# ---------- KỊCH BẢN VIDEO (storyboard) ----------
x = skeleton('script_video.docx', 'script_video.docx'); ps = top_paras(x); T = tables(x); rs = rows(T[0]); pr, grid = table_shell(T[0])
r1 = rs[2]; c1 = paras(cells(r1)[1])
SPEC['script_video'] = {'P': {'title': proto(ps[0]), 'meta': proto(find(ps, 'Mô tả')), 'label': proto(find(ps, 'Caption:')), 'capTitle': proto(ps[5]), 'capBody': proto(ps[6]),
                              'capSign': proto(find(ps, 'Thực hiện bởi')), 'content': proto(find(ps, 'Nội dung:')), 'blank': proto(ps[13]), 'infoTitle': proto(find(ps, 'INFOGRAPHIC')), 'center': proto(ps[-1])},
    'T': {'pr': pr, 'grid': grid, 'head': clean(rs[0]), 'trPr': clean(trpr(rs[3])), 'tcPr': [clean(tcpr(cc)) for cc in cells(r1)],
          'C': {'scene': proto(paras(cells(r1)[0])[0]), 'desc': proto(c1[0]), 'vo': proto(paras(cells(r1)[2])[0]), 'note': proto(paras(cells(rs[1])[3])[0])}}}
ir = rows(T[1]); ipr, igrid = table_shell(T[1]); ic = cells(ir[1])
SPEC['script_video']['I'] = {'pr': ipr, 'grid': igrid, 'trPr': clean(trpr(ir[1])), 'tcPr': clean(tcpr(ic[0])), 'head': proto(paras(cells(ir[0])[0])[0]), 'step': proto(paras(ic[0])[0]), 'sub': proto(paras(ic[0])[1])}

# ---------- CAPTION FACEBOOK ----------
x = skeleton('caption.docx', 'caption.docx'); ps = top_paras(x)
bul = [p for p in ps if '<w:numPr>' in p]
SPEC['caption'] = {'P': {'title': proto(ps[0]), 'sep': proto(ps[1]), 'body': proto(ps[2]), 'blank': proto(ps[3]), 'sign': proto(find(ps, 'Thực hiện')),
    'desLabel': proto(find(ps, 'NỘI DUNG DES')), 'desCenter': proto(ps[ps.index(find(ps, 'NỘI DUNG DES')) + 1]), 'desHead': proto(find(ps, 'THÔNG ĐIỆP')), 'desQuote': proto(ps[ps.index(find(ps, 'THÔNG ĐIỆP')) + 1]),
    'desBody': proto(ps[ps.index(find(ps, 'THÔNG ĐIỆP')) + 2]), 'desBullet': proto(bul[0]), 'desEnd': proto(ps[ps.index(find(ps, 'CÙNG ULAW')) + 1])}}

# ---------- LỊCH CÔNG TÁC TUẦN ----------
x = skeleton('schedule.docx', 'schedule.docx'); ps = top_paras(x)
it = find(ps, '1.1.'); i = ps.index(it)
SPEC['schedule'] = {'P': {'title': proto(ps[0]), 'sep': proto(ps[1]), 'day': proto(find(ps, '1. THỨ')), 'item': proto(it), 'field': proto(ps[i + 1]), 'place': proto(find(ps, 'Địa điểm')),
    'person': proto(find(ps, 'Content:')), 'deadline': proto(find(ps, 'Deadline')), 'endSep': proto([p for p in ps if text(p).strip().startswith('-----')][1]), 'wish': proto(find(ps, '💖'))}}

# ---------- TIN BÀI ----------
x = skeleton('article1.docx', 'article.docx'); ps = top_paras(x)
caps = [p for p in ps if '<w:jc w:val="center"/>' in p and '<w:drawing' not in p and text(p).strip()]
SPEC['article'] = {'P': {'title': proto(ps[0]), 'lead': proto(ps[1]), 'img': {**proto(next(p for p in ps if '<w:drawing' in p)), 'i': False}, 'imgCap': proto(caps[2] if len(caps) > 2 else caps[0]),
    'body': proto(find(ps, 'Tọa đàm quy tụ')), 'sub': proto(find(ps, 'Phiên tham luận 1')), 'credit': proto(find(ps, 'Nội dung:'))}}

# ---------- TIMELINE (xlsx) ----------
zin = zipfile.ZipFile(os.path.join(SRC, 'timeline.xlsx')); sh = zin.read('xl/worksheets/sheet1.xml').decode('utf8')
ss = re.findall(r'<si>(.*?)</si>', zin.read('xl/sharedStrings.xml').decode('utf8'), re.S)
def sstr(i): return ''.join(re.findall(r'<t[^>]*>([^<]*)</t>', ss[i]))
def row(n): return re.search(r'<row r="%d"[^>]*>.*?</row>' % n, sh, re.S).group(0)
def styles(n): return {m.group(1): m.group(2) for m in re.finditer(r'<c r="([A-Z]+)%d" s="(\d+)"' % n, row(n))}
head = []
for n in range(1, 7):
    cs = []
    for m in re.finditer(r'<c r="([A-Z]+)%d" s="(\d+)"(?: t="(\w+)")?(?:/>|>(.*?)</c>)' % n, row(n), re.S):
        col, s, t, inner = m.groups()
        if col in ('L', 'M'): continue
        v = sstr(int(re.search(r'<v>(\d+)</v>', inner).group(1))) if t == 's' and inner else None
        if (col, n) in (('A', 4), ('E', 3)): v = None
        cs.append([col, int(s), v])
    head.append(cs)
SPEC['timeline'] = {'head': head, 'title': {'s': int(styles(4)['A']), 'cols': {k: int(v) for k, v in styles(4).items() if k not in ('L', 'M')}},
    'channel': {k: int(v) for k, v in styles(7).items() if k not in ('L', 'M')}, 'phase': {k: int(v) for k, v in styles(8).items() if k not in ('L', 'M')},
    'item': {k: int(v) for k, v in styles(9).items() if k not in ('L', 'M')}, 'itemB': int(styles(22)['B']), 'empty': {k: int(v) for k, v in styles(10).items() if k not in ('L', 'M')},
    'merges': ['A1:D2', 'E1:K2', 'E3:K3', 'A4:K4', 'A5:A6', 'B5:B6', 'C5:C6', 'D5:D6', 'E5:E6', 'F5:F6', 'G5:I5', 'J5:J6', 'K5:K6'],
    'sheetHead': sh[:sh.index('<sheetData>')].replace('<cols><col customWidth="1" min="13" max="13" width="20.25"/></cols>', '')}
buf = io.BytesIO(); zout = zipfile.ZipFile(buf, 'w', zipfile.ZIP_DEFLATED)
for it in zin.infolist():
    n = it.filename
    if n.startswith('xl/drawings') or n.startswith('xl/persons') or n == 'xl/worksheets/_rels/sheet1.xml.rels': continue
    d = zin.read(n)
    if n == 'xl/worksheets/sheet1.xml': d = b'{{SHEET}}'
    elif n == 'xl/sharedStrings.xml': d = b'<?xml version="1.0" encoding="UTF-8" standalone="yes"?><sst xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" count="0" uniqueCount="0"/>'
    elif n == '[Content_Types].xml': d = re.sub(rb'<Override PartName="/xl/(drawings|persons)[^>]*/>', b'', d)
    elif n == 'xl/_rels/workbook.xml.rels': d = re.sub(rb'<Relationship [^>]*persons?[^>]*/>', b'', d)
    elif n == 'xl/workbook.xml': d = re.sub(rb'<definedNames>.*?</definedNames>', b'', d, flags=re.S)
    zout.writestr(n, d)
zout.close(); open(os.path.join(OUT, 'timeline.xlsx'), 'wb').write(buf.getvalue())

js = '// TỰ SINH bởi tools/build-workroom-tpl.py từ các file mẫu thật của Vy — đừng sửa tay.\n// Mỗi loại đoạn/ô/dòng giữ NGUYÊN định dạng XML của mẫu (lề, khoảng cách, cỡ chữ, font, căn lề, đánh số).\nexport const SPEC = ' + json.dumps(SPEC, ensure_ascii=False) + ';\n'
open(os.path.join(OUT, 'spec.js'), 'w', encoding='utf8').write(js)
print('ok', {k: os.path.getsize(os.path.join(OUT, f)) for k, f in [(f, f) for f in os.listdir(OUT)]})
