// PHÒNG VY — WORKROOM · các LOẠI VIỆC và cách mỗi loại được viết ra đúng mẫu.
// Mỗi loại: dữ liệu (data) → bố cục theo mẫu (layout) → file .docx/.xlsx (fmt.js) + dàn ý AI (schema + prompt).
// Cấu trúc bố cục bám đúng từng file mẫu Vy đưa: thứ tự mục, nhãn, cột bảng, chữ cố định.
import {docx, timelineXlsx, previewHtml, timelineHtml, plain} from './fmt.js';

export const SIGN = 'Thực hiện bởi Phòng Truyền thông & QHDN';
const S = v => String(v == null ? '' : v).trim();
const arr = v => Array.isArray(v) ? v : [];
const today = () => { const d = new Date(); return `${d.getDate()}/${d.getMonth() + 1}/${d.getFullYear()}`; };
const monthNow = () => { const d = new Date(); return `${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`; };

// ===================== KỊCH BẢN BẢN TIN (ULAW TV / TIẾNG ANH) =====================
const FOOT_TV = '---------------------\nChương trình “Bản tin ULAW” được phát sóng hàng tháng trên các kênh truyền thông chính thức của Trường Đại học Luật TP. HCM, hãy đăng ký theo dõi để cập nhật thường xuyên các thông tin nóng hổi về các hoạt động tiêu điểm của Nhà trường nhé!\n📲 Đừng quên theo dõi ULAW TV tại:\n➡️ Facebook: Trường Đại học Luật Tp. Hồ Chí Minh\n➡️ YouTube: https://www.youtube.com/@Truong-Dai-Hoc-Luat-TP-HCM\n➡️ TikTok: ULAW TV (@ulawtv) | TikTok';
const FOOT_EN = '---------------------\n📲 Đừng quên theo dõi ULAW TV tại:\n➡️ Facebook: Trường Đại học Luật Tp. Hồ Chí Minh\n➡️ YouTube: https://www.youtube.com/@ulawhcm\n➡️ TikTok: ULAW TV (@ulawtv) | TikTok';
function newsBlank(en) {
  const m = monthNow();
  return {title: en ? `BẢN TIN ULAW TIẾNG ANH SỐ THÁNG ${m.slice(0, 2)}` : `BẢN TIN ULAW TV SỐ 1 THÁNG ${m}`, desc: `Điểm qua các sự kiện tiêu biểu trong tháng ${m}`,
    duration: en ? '10-15’ (hoặc hơn nếu có chuyên đề)' : '10-15’ (hoặc hơn nếu có talkshow, chuyên đề)', staff: {script: '', image: '', editor: '', mc: ''},
    cap: {title: en ? `[ULAW TV] Tháng ${m}` : `[ULAW TV] BẢN TIN SỐ 1 THÁNG ${m}:`, intro: '', outro: en ? '' : '🎥 Kính mời quý thầy cô và các bạn sinh viên cùng theo dõi để không bỏ lỡ những thông tin nổi bật và dấu ấn đáng chú ý của ULAW!', youtube: '', footer: en ? FOOT_EN : FOOT_TV},
    short: {title: en ? '' : `[UlawTV] BẢN TIN ULAW SỐ 1 THÁNG ${m}`, tags: '#ulaw #ulawhcm #ulawtv #tintuc'},
    open: '', news: [{title: '', intro: '', detail: '', visual: '', parts: []}], special: {title: en ? 'ULAW SPOTLIGHT' : '', intro: 'Xin được tiếp nối bản tin với chuyên đề “Ulaw Spotlight” - nơi quy tụ những sự kiện đáng chú ý vừa diễn ra tại Ulaw.', items: []}, close: ''};
}
const r4 = (c0, c1 = [], c2 = [], c3 = []) => ({cells: [c0, c1, c2, c3]});
const trans = () => r4([{p: 'plain', t: 'Chuyển cảnh'}], [{p: 'visB', t: 'VIDEO'}], [], [{p: 'note', t: 'Nhạc nền'}]);
const say = (tag, t) => S(t) ? [{p: 'tag', t: tag}, {p: 'body', t: S(t)}] : [{p: 'tag', t: tag}, {p: 'body', t: '[CẦN BỔ SUNG]'}];
function newsLayout(d, en) {
  const id = en ? 'script_en' : 'script_news', c = d.cap || {}, st = d.staff || {}, news = arr(d.news).filter(n => S(n.title) || S(n.intro) || S(n.detail));
  const L = [{p: 'title', t: ' ' + S(d.title)}, {p: 'meta', t: `**1. Mô tả:** ${en ? '' : '- '}${S(d.desc)}`, b: false}, {p: 'meta', t: `**2. Thời lượng:** ${S(d.duration)}`, b: false}, {p: 'meta', t: '3. Nhân sự:'},
    {p: 'staff', t: `- Kịch bản: ${S(st.script)}`}, {p: 'staff', t: `- Hình ảnh: ${S(st.image)}`}, {p: 'staff', t: `- Biên tập: ${S(st.editor)}`}, {p: 'staff', t: `- MC: ${S(st.mc)}`},
    ...(en ? [] : [{p: 'blank', t: ''}]), {p: 'label', t: '4. Caption:'}, {p: 'label', t: '4.1 Caption đăng FB:'}];
  if (en) {
    L.push({p: 'capTitle', t: `(*) TIẾNG VIỆT :  ${S(c.title)}`}, {p: 'capBody', t: S(c.intro)}, {p: 'capTitle', t: 'TIN TỨC NỔI BẬT:'});
    news.forEach((n, i) => L.push({p: 'capTitle', t: `${i + 1}. ${S(n.title)}`}));
    if (S(d.special && d.special.items && d.special.items[0] && d.special.items[0].title)) L.push({p: 'capTitle', t: `GÓC CHUYÊN ĐỀ: ${S(d.special.items[0].title)}`});
  } else {
    L.push({p: 'capTitle', t: S(c.title) + ' '}, {p: 'capBody', t: S(c.intro)});
    news.forEach((n, i) => L.push({p: 'capList', t: `${i + 1}. ${S(n.title)}`}));
    if (S(c.outro)) L.push({p: 'capBody', t: S(c.outro)});
  }
  L.push({p: 'capBody', t: `Link youtube: ${S(c.youtube) || (en ? '…' : '')}`}, {p: 'capBody', t: S(c.footer)}, {p: 'label', t: '4.2 Caption đăng Tiktok/Youtube:'});
  if (S(d.short && d.short.title)) L.push({p: 'label', t: S(d.short.title)});
  if (!en) L.push({p: 'blank', t: ''});
  L.push({p: 'short', t: `**Caption Short:**. ${S(d.short && d.short.tags)}`, b: false}, {p: 'label', t: '5. Nội dung:'});
  const rows = [r4([{p: 'h', t: '1. INTRO'}, {p: 'plain', t: 'Chạy hình hiệu chương trình'}], [{p: 'visB', t: 'VIDEO'}], [{p: 'dur', t: '5-10s'}], [{p: 'note', t: 'Nhạc nền'}]),
    r4([{p: 'h', t: '2. MC mở đầu chương trình:'}, ...say('<Lời dẫn>', d.open)], [{p: 'vis', t: 'Nhạc nền, \nKhung hình cận MC, Background MC dẫn '}], [{p: 'dur', t: '25-30s'}], [{p: 'note', t: 'MC dẫn'}]), trans(),
    r4([{p: 'h', t: `${en ? '' : '3. '}Phần điểm qua tiêu đề tin tức - sự kiện (HEADLINES):`}, ...news.map((n, i) => ({p: 'list', t: `${i + 1}. ${S(n.title)}`}))], [{p: 'vis', t: 'Khung hình “ĐIỂM TIN”,'}], [{p: 'dur', t: '30s'}], []), trans()];
  if (en) rows.push({span: [{p: 'p', t: '4. PHẦN TIN TỨC - SỰ KIỆN '}]});
  news.forEach((n, i) => {
    const k = i + 1, vis = S(n.visual) ? [{p: 'vis', t: S(n.visual)}] : [];
    if (en) {
      rows.push(r4([{p: 'h', t: `4.${k} TIN ${k}: ${S(n.title)}`}, ...say('<Lời dẫn>', n.intro)], [], [], []));
      const parts = arr(n.parts).filter(p => S(p.title) || S(p.detail));
      if (parts.length) parts.forEach((p, j) => { rows.push({span: [{p: 'p', t: `TEXT: ${S(p.title)}`}]}); rows.push(r4([{p: 'h', t: `TIN ${k}.${j + 1}: ${S(p.title)}`}, ...say(' <Thu âm>', p.detail)], S(p.visual) ? [{p: 'vis', t: S(p.visual)}] : [], [], [])); });
      else rows.push(r4(say('<Thu âm>', n.detail), vis, [], []));
    } else {
      rows.push(r4([...(i ? [] : [{p: 'h', t: '4. Phần tin tức - sự kiện chi tiết:'}]), {p: 'h', t: `4.${k} TIN ${k}: ${S(n.title)}`}, {p: 'h', t: `a) Giới thiệu TIN ${k}:   `}, ...say('<Lời dẫn>', n.intro)], [], [], []));
      rows.push(r4([{p: 'h', t: `b) Chi tiết TIN ${k}:`}, ...say('<Thu âm>', n.detail)], vis.length ? vis : [{p: 'vis', t: 'Slide hình/ Video sự kiện'}], [], [{p: 'note', t: 'MC \nVoiceoff'}]));
      if (i) rows.push(r4([{p: 'plain', t: 'Chuyển cảnh'}], [], [], []));
    }
  });
  if (en) rows.push(trans());
  const sp = d.special || {}, items = arr(sp.items).filter(x => S(x.title) || S(x.intro));
  if (items.length || S(sp.intro)) {
    rows.push(r4([{p: 'h', t: en ? `5. Góc chuyên đề - ${S(sp.title) || 'ULAW SPOTLIGHT'}` : '5. Góc chuyên đề: '}, ...say('<Lời dẫn>', sp.intro)], en ? [] : [{p: 'vis', t: 'Khung hình tin chi tiết (MC + Background của Bản tin)'}], [], en ? [] : [{p: 'note', t: 'MC dẫn'}]));
    items.forEach((x, j) => rows.push(r4([{p: 'h', t: `5.${j + 1}. ${S(x.title)}`}, ...say('<Lời dẫn>', x.intro), ...(S(x.detail) ? say('<Thu âm>', x.detail) : [])], S(x.visual) ? [{p: 'vis', t: S(x.visual)}] : [], [], [])));
    if (en) rows.push(trans());
  }
  rows.push(r4([{p: 'h', t: '6. Phần kết:'}, ...say('<Lời dẫn>', d.close)], [], [], [{p: 'note', t: 'MC dẫn'}]));
  L.push({table: 'T', rows, empty: 'note'});
  if (!en) {   // phần cuối mẫu ULAW TV: gom lời dẫn cho MC đọc
    const apx = (label, t) => S(t) ? [{p: 'apxLabel', t: label}, {p: 'apxTag', t: '<Lời dẫn> '}, {p: 'apxBody', t: S(t)}] : [];
    L.push(...apx('CHÀO ĐẦU: ', d.open), ...news.flatMap((n, i) => apx(`Giới thiệu TIN ${i + 1}:   `, n.intro)), ...apx('5. Góc chuyên đề: ', sp.intro),
      ...items.flatMap((x, j) => apx(`5.${j + 1} ${S(x.title)}`, x.intro)), ...apx('Phần kết:', d.close));
  }
  return {id, layout: L};
}
const NEWS_SCHEMA = en => ({type: 'OBJECT', properties: {
  title: {type: 'STRING'}, desc: {type: 'STRING'},
  cap: {type: 'OBJECT', properties: {title: {type: 'STRING'}, intro: {type: 'STRING'}, outro: {type: 'STRING'}}, required: ['title', 'intro']},
  short: {type: 'OBJECT', properties: {title: {type: 'STRING'}, tags: {type: 'STRING'}}},
  open: {type: 'STRING'},
  news: {type: 'ARRAY', items: {type: 'OBJECT', properties: {title: {type: 'STRING'}, intro: {type: 'STRING'}, detail: {type: 'STRING'}, visual: {type: 'STRING'},
    ...(en ? {parts: {type: 'ARRAY', items: {type: 'OBJECT', properties: {title: {type: 'STRING'}, detail: {type: 'STRING'}}, required: ['title', 'detail']}}} : {})}, required: ['title', 'intro', 'detail']}},
  special: {type: 'OBJECT', properties: {title: {type: 'STRING'}, intro: {type: 'STRING'}, items: {type: 'ARRAY', items: {type: 'OBJECT', properties: {title: {type: 'STRING'}, intro: {type: 'STRING'}, detail: {type: 'STRING'}}, required: ['title', 'intro']}}}},
  close: {type: 'STRING'}}, required: ['title', 'cap', 'open', 'news', 'close']});
const NEWS_GUIDE = en => `Cấu trúc bản tin (giữ đúng): MC mở đầu (open, <Lời dẫn>, 2–3 câu "Xin kính chào quý vị khán giả…") → điểm tin (headline = tiêu đề từng tin) → từng TIN: intro = <Lời dẫn> MC giới thiệu (2–4 câu, mở bằng "Thưa quý vị, …"), detail = <Thu âm> lời đọc chi tiết (2–4 đoạn, cách nhau bằng xuống dòng)${en ? '; nếu tin dài, chia parts (mỗi part: title VIẾT HOA là dòng TEXT trên hình, detail là lời thu âm)' : ''} → Góc chuyên đề (special: "Ulaw Spotlight") nếu có → Phần kết (close: cảm ơn, mời theo dõi kênh FB, YOUTUBE, TIKTOK, "Xin chào và hẹn gặp lại!").
Caption FB: title dạng "${en ? '[ULAW TV] Tháng MM/YYYY' : '[ULAW TV] BẢN TIN SỐ X THÁNG MM/YYYY:'}", intro 1 đoạn mở bằng emoji 📌 tóm tắt các tin${en ? '' : ', outro mời theo dõi (🎥 …)'}. Caption short: tags dạng "#ulaw #ulawhcm #ulawtv #tintuc".${en ? ' Viết TOÀN BỘ bằng tiếng Việt (bản tiếng Anh do người khác dịch sau).' : ''}`;

// ===================== KỊCH BẢN VIDEO (storyboard) =====================
function videoLayout(d) {
  const c = d.cap || {}, sc = arr(d.scenes).filter(s => S(s.name) || S(s.desc) || S(s.vo));
  const L = [{p: 'title', t: S(d.title)}, {p: 'meta', t: `**Mô tả:** ${S(d.desc)}`, b: false}, {p: 'meta', t: `**Nhạc nền:** ${S(d.music)}`, b: false}, {p: 'meta', t: `**Thời lượng:** ${S(d.duration)}`, b: false},
    {p: 'label', t: 'Caption:'}, {p: 'capTitle', t: S(c.title)}, ...arr(c.paras).filter(S).map(t => ({p: 'capBody', t: S(t)})), {p: 'capSign', t: S(c.sign) || SIGN}, {p: 'blank', t: ''}, {p: 'content', t: 'Nội dung:'},
    {table: 'T', rows: sc.map(s => r4([{p: 'scene', t: S(s.name)}], [{p: 'desc', t: S(s.desc) || ' ', b: false}], [{p: 'vo', t: S(s.vo)}], [{p: 'note', t: S(s.note)}]))}];
  const info = d.info || {}, steps = arr(info.steps).filter(x => S(x.title));
  if (d.withInfo && steps.length) L.push({p: 'center', t: ''}, {p: 'infoTitle', t: `INFOGRAPHIC TỔNG HỢP:  ${S(info.title)} `}, {p: 'center', t: ''},
    {table: 'I', head: false, rows: [{cells: [[{p: 'head', t: S(info.head) || S(info.title)}]]}, ...steps.map(x => ({cells: [[{p: 'step', t: S(x.title)}, {p: 'sub', t: S(x.sub)}]]}))]}, {p: 'center', t: ''});
  return {id: 'script_video', layout: L};
}
const VIDEO_SCHEMA = {type: 'OBJECT', properties: {title: {type: 'STRING'}, desc: {type: 'STRING'}, music: {type: 'STRING'}, duration: {type: 'STRING'},
  cap: {type: 'OBJECT', properties: {title: {type: 'STRING'}, paras: {type: 'ARRAY', items: {type: 'STRING'}}}, required: ['title', 'paras']},
  scenes: {type: 'ARRAY', items: {type: 'OBJECT', properties: {name: {type: 'STRING'}, desc: {type: 'STRING'}, vo: {type: 'STRING'}, note: {type: 'STRING'}}, required: ['name', 'desc', 'vo']}},
  info: {type: 'OBJECT', properties: {title: {type: 'STRING'}, head: {type: 'STRING'}, steps: {type: 'ARRAY', items: {type: 'OBJECT', properties: {title: {type: 'STRING'}, sub: {type: 'STRING'}}, required: ['title', 'sub']}}}}},
  required: ['title', 'desc', 'duration', 'cap', 'scenes']};
const VIDEO_GUIDE = `Kịch bản video dạng storyboard (TVC/clip ngắn): title VIẾT HOA bắt đầu "KỊCH BẢN VIDEO …". scenes: cảnh đầu "Intro", các cảnh giữa đặt tên VIẾT HOA kèm khoảng giây (vd "BƯỚC 1  GỬI Ý TƯỞNG (5-15s)"), cảnh cuối "Outro".
Mỗi cảnh: desc = các dòng bắt đầu "- ", nhãn in đậm bằng **…**, vd "**- Text:** “…”", "**- Hình ảnh:** …"; vo = lời voice off trong ngoặc kép “…”; note = ghi chú dựng (có thể trống).
Caption: title VIẾT HOA mở bằng 1 emoji, paras = 4–7 đoạn ngắn mỗi đoạn mở bằng 1 emoji. info (nếu nội dung là quy trình): bảng tóm tắt các bước "01. …" kèm 1 dòng chi tiết.`;

// ===================== CAPTION FACEBOOK =====================
const DES_TYPES = [['center', 'Dòng giữa (tiêu đề)'], ['head', 'Mục (đậm)'], ['quote', 'Thông điệp (đậm)'], ['body', 'Đoạn thường'], ['bullet', 'Gạch đầu dòng'], ['end', 'Câu kết']];
function captionLayout(d) {
  const L = [{p: 'title', t: S(d.title)}, {p: 'sep', t: '-----------------------------'}];
  arr(d.paras).filter(S).forEach((t, i) => { if (i) L.push({p: 'blank', t: ''}); L.push({p: 'body', t: S(t)}); });
  L.push({p: 'sep', t: '-----------------------------'}, {p: 'sign', t: S(d.sign) || 'Thực hiện: Phòng Truyền thông & QHDN'});
  const des = arr(d.des).filter(x => S(x.text));
  if (d.withDes && des.length) { L.push({p: 'blank', t: ''}, {p: 'desLabel', t: 'NỘI DUNG DES '});
    des.forEach(x => L.push({p: {center: 'desCenter', head: 'desHead', quote: 'desQuote', body: 'desBody', bullet: 'desBullet', end: 'desEnd'}[x.type] || 'desBody', t: S(x.text)})); }
  return {id: 'caption', layout: L};
}
const CAPTION_SCHEMA = {type: 'OBJECT', properties: {title: {type: 'STRING'}, paras: {type: 'ARRAY', items: {type: 'STRING'}},
  des: {type: 'ARRAY', items: {type: 'OBJECT', properties: {type: {type: 'STRING', enum: DES_TYPES.map(x => x[0])}, text: {type: 'STRING'}}, required: ['type', 'text']}}}, required: ['title', 'paras']};
const CAPTION_GUIDE = `Caption Facebook: title VIẾT HOA, đặt giữa 2 emoji (vd "🌟 … 🌟") hoặc mở bằng [CHÍNH THỨC …]. paras = các đoạn, MỖI đoạn mở bằng 1 emoji phù hợp (✨ 🌱 🚀 👉 📌 …), đoạn cuối kêu gọi theo dõi/tham gia. Không tự thêm hashtag nếu không được yêu cầu.
des (Nội dung DES cho thiết kế ấn phẩm, chỉ khi được yêu cầu): dãy khối ngắn theo thứ tự: center (dòng tiêu đề lớn, VIẾT HOA), head (tên mục VIẾT HOA như THÔNG ĐIỆP, MỤC TIÊU), quote (khẩu hiệu trong ngoặc kép, VIẾT HOA), body (1–2 câu), bullet (các ý ngắn), end (câu kết).`;

// ===================== TIN BÀI =====================
function articleLayout(d) {
  const L = [{p: 'title', t: S(d.title)}, {p: 'lead', t: S(d.lead)}];
  arr(d.blocks).forEach(b => {
    if (b.type === 'img') { L.push({p: 'img', t: `[Chèn ảnh${S(b.text) ? ': ' + S(b.text) : ''}]`}); if (S(b.caption)) L.push({p: 'imgCap', t: S(b.caption)}); }
    else if (S(b.text)) L.push({p: b.type === 'sub' ? 'sub' : 'body', t: S(b.text)});
  });
  const cr = d.credits || {};
  L.push({p: 'credit', t: `Nội dung: ${S(cr.content)}`}, {p: 'credit', t: `Hình ảnh: ${S(cr.image)}`}, {p: 'credit', t: SIGN});
  return {id: 'article', layout: L};
}
const ARTICLE_SCHEMA = {type: 'OBJECT', properties: {title: {type: 'STRING'}, lead: {type: 'STRING'},
  blocks: {type: 'ARRAY', items: {type: 'OBJECT', properties: {type: {type: 'STRING', enum: ['p', 'sub', 'img']}, text: {type: 'STRING'}, caption: {type: 'STRING'}}, required: ['type']}}}, required: ['title', 'lead', 'blocks']};
const ARTICLE_GUIDE = `Tin bài website/Facebook của Trường: title VIẾT HOA. lead = đoạn sapo in đậm mở bằng thời gian, địa điểm ("Ngày dd/mm/yyyy, Trường Đại học Luật TP. Hồ Chí Minh …"). blocks theo trình tự sự kiện: p = đoạn thân (3–5 câu), sub = tiêu đề phần (vd "Phiên tham luận 1 - “…”"), img = vị trí ảnh: text mô tả ảnh cần chèn, caption = chú thích ảnh (vd "Toàn cảnh toạ đàm tại …", "PGS.TS. … phát biểu khai mạc"). Xen 1 ảnh sau mỗi 1–2 đoạn. Ghi đúng học hàm học vị, chức vụ như dữ kiện.`;

// ===================== LỊCH CÔNG TÁC TUẦN (phân công) =====================
const FIELDS = [['attendees', 'Thành phần', 'field'], ['time', 'Thời gian', 'field'], ['place', 'Địa điểm', 'place'], ['content', 'Content', 'person'], ['media', 'Media', 'person'], ['editor', 'Biên tập', 'person'],
  ['dl_news', 'Deadline tin bài', 'field'], ['dl_edit', 'Deadline biên tập', 'field'], ['dl_video', 'Deadline video', 'field']];
function scheduleLayout(d) {
  const L = [{p: 'title', t: `LỊCH CÔNG TÁC TUẦN ${S(d.week)} (${S(d.from)} - ${S(d.to)})`}, {p: 'sep', t: '-----------------'}];
  arr(d.days).forEach((day, i) => {
    const items = arr(day.items).filter(x => S(x.title));
    L.push({p: 'day', t: `${i + 1}. ${S(day.label)} `});
    items.forEach((x, j) => { L.push({p: 'item', t: items.length > 1 ? `${i + 1}.${j + 1}. ${S(x.title)}` : S(x.title)});
      FIELDS.forEach(([k, lab, p]) => { if (S(x[k])) L.push({p, t: `${lab}: ${S(x[k])}`}); }); });
  });
  L.push({p: 'endSep', t: '----------------- '}, {p: 'wish', t: S(d.wish) || '💖Chúc cả nhà có một tuần học tập và làm việc thật hiệu quả!'});
  return {id: 'schedule', layout: L};
}
const SCHEDULE_SCHEMA = {type: 'OBJECT', properties: {week: {type: 'STRING'}, from: {type: 'STRING'}, to: {type: 'STRING'},
  days: {type: 'ARRAY', items: {type: 'OBJECT', properties: {label: {type: 'STRING'}, items: {type: 'ARRAY', items: {type: 'OBJECT', properties: Object.fromEntries([['title', {type: 'STRING'}], ...FIELDS.map(([k]) => [k, {type: 'STRING'}])]), required: ['title']}}}, required: ['label', 'items']}}}, required: ['days']};
const SCHEDULE_GUIDE = `Lịch công tác tuần: days sắp theo ngày, label dạng "THỨ HAI (12/10)" (thêm " - SÁNG"/" - CHIỀU" nếu cả ngày chỉ một buổi). Mỗi sự kiện: title = tên chính thức đầy đủ; attendees = thành phần; time dạng "8h00"; place; content = người viết + việc trong ngoặc (vd "Ngọc Ninh (tin bài + kịch bản thu âm tin video)"); media = người + việc (vd "Hữu Đức (chụp + quay), Hiểu Đồng (VO + Dựng)"); editor = biên tập; deadline dạng "21h00 ngày 12/10/2026" (thường tin bài ~3 giờ sau sự kiện, biên tập +1 giờ, video tối cùng ngày hoặc sáng hôm sau).
Chỉ phân công người có trong DANH SÁCH NHÂN SỰ; chia việc đều, tránh 1 người trùng giờ ở 2 sự kiện. Thiếu người thì để trống.`;

// ===================== TIMELINE TRUYỀN THÔNG (.xlsx) =====================
const TL_ITEM = {type: 'OBJECT', properties: Object.fromEntries(['content', 'format', 'deadline', 'publish', 'channel', 'a_content', 'a_media', 'a_editor', 'note'].map(k => [k, {type: 'STRING'}])), required: ['content', 'format']};
const TIMELINE_SCHEMA = {type: 'OBJECT', properties: {title: {type: 'STRING'}, channel: {type: 'STRING'}, phases: {type: 'ARRAY', items: {type: 'OBJECT', properties: {name: {type: 'STRING'}, items: {type: 'ARRAY', items: TL_ITEM}}, required: ['name', 'items']}}}, required: ['title', 'phases']};
const TIMELINE_GUIDE = `Timeline truyền thông sự kiện: title = "TIMELINE TRUYỀN THÔNG\\n<TÊN SỰ KIỆN VIẾT HOA> (<ngày>)". channel = "TRUYỀN THÔNG KÊNH NỘI BỘ". phases: "I. TRƯỚC <LỄ/SỰ KIỆN>", "II. TRONG …", "III. SAU …". Mỗi dòng: content = tên ấn phẩm/bài (vd "Banner", "Đếm ngược đến ngày …", "Recap …"); format ∈ Thiết kế | Tin bài | Tin ảnh | Clip | Ema | Gửi báo | Caption…; deadline, publish dạng "d/m" hoặc "Sáng 8/8"; channel ∈ Facebook | Web + Facebook | Web | Chiếu lễ; a_content/a_media/a_editor = người phụ trách (chỉ người trong DANH SÁCH NHÂN SỰ, không có thì "x"); note = tham khảo/ghi chú.`;
function timelineData(d) { return {title: S(d.title), date: S(d.date) || `Tp. Hồ Chí Minh, ngày ${new Date().getDate()} tháng ${new Date().getMonth() + 1} năm ${new Date().getFullYear()}`, channel: S(d.channel), phases: arr(d.phases)}; }

// ===================== DANH MỤC =====================
export const GROUPS = [
  {id: 'script', name: 'Kịch bản', icon: 'film', kinds: ['news_tv', 'news_en', 'video']},
  {id: 'caption', name: 'Caption', icon: 'chat', kinds: ['caption']},
  {id: 'article', name: 'Tin bài', icon: 'doc', kinds: ['article']},
  {id: 'schedule', name: 'Phân công', icon: 'users', kinds: ['schedule']},
  {id: 'timeline', name: 'Timeline', icon: 'cal', kinds: ['timeline']},
];
export const KINDS = {
  news_tv: {name: 'Bản tin ULAW TV', short: 'Bản tin TV', ext: 'docx', blank: () => newsBlank(false), layout: d => newsLayout(d, false), schema: NEWS_SCHEMA(false), guide: NEWS_GUIDE(false), titleOf: d => d.title},
  news_en: {name: 'Bản tin ULAW Tiếng Anh', short: 'Bản tin TA', ext: 'docx', blank: () => newsBlank(true), layout: d => newsLayout(d, true), schema: NEWS_SCHEMA(true), guide: NEWS_GUIDE(true), titleOf: d => d.title},
  video: {name: 'Kịch bản video (storyboard)', short: 'Video', ext: 'docx', blank: () => ({title: 'KỊCH BẢN VIDEO ', desc: '', music: 'media chọn', duration: '45-60s', cap: {title: '', paras: [], sign: SIGN},
    scenes: [{name: 'Intro', desc: '- Chạy intro của trường', vo: '', note: ''}, {name: 'Outro', desc: '', vo: '', note: ''}], withInfo: false, info: {title: '', head: '', steps: []}}), layout: videoLayout, schema: VIDEO_SCHEMA, guide: VIDEO_GUIDE, titleOf: d => d.title},
  caption: {name: 'Caption Facebook', short: 'Caption', ext: 'docx', blank: () => ({title: '', paras: [''], sign: 'Thực hiện: Phòng Truyền thông & QHDN', withDes: false, des: [], opts: {tone: 'trang trọng, truyền cảm hứng', length: 'vừa', emoji: 'mỗi đoạn 1 emoji', extra: ''}}),
    layout: captionLayout, schema: CAPTION_SCHEMA, guide: CAPTION_GUIDE, titleOf: d => d.title},
  article: {name: 'Tin bài', short: 'Tin bài', ext: 'docx', blank: () => ({title: '', lead: '', blocks: [{type: 'p', text: ''}], credits: {content: '', image: ''}}), layout: articleLayout, schema: ARTICLE_SCHEMA, guide: ARTICLE_GUIDE, titleOf: d => d.title},
  schedule: {name: 'Lịch công tác tuần (phân công)', short: 'Lịch tuần', ext: 'docx', blank: () => ({week: '', from: '', to: '', days: [], wish: '💖Chúc cả nhà có một tuần học tập và làm việc thật hiệu quả!'}),
    layout: scheduleLayout, schema: SCHEDULE_SCHEMA, guide: SCHEDULE_GUIDE, titleOf: d => `LỊCH CÔNG TÁC TUẦN ${S(d.week)} (${S(d.from)} - ${S(d.to)})`},
  timeline: {name: 'Timeline truyền thông', short: 'Timeline', ext: 'xlsx', blank: () => ({title: 'TIMELINE TRUYỀN THÔNG\n', date: `Tp. Hồ Chí Minh, ngày ${new Date().getDate()} tháng ${new Date().getMonth() + 1} năm ${new Date().getFullYear()}`, channel: 'TRUYỀN THÔNG KÊNH NỘI BỘ',
    phases: [{name: 'I. TRƯỚC SỰ KIỆN', items: []}, {name: 'II. TRONG SỰ KIỆN', items: []}, {name: 'III. SAU SỰ KIỆN', items: []}]}), schema: TIMELINE_SCHEMA, guide: TIMELINE_GUIDE, titleOf: d => S(d.title).replace(/\n/g, ' ')},
};
export const groupOf = kind => GROUPS.find(g => g.kinds.includes(kind));
export const DES = DES_TYPES; export const SCHED_FIELDS = FIELDS;

// file + xem trước
export async function toFile(kind, data) {
  if (kind === 'timeline') return timelineXlsx(timelineData(data));
  const {id, layout} = KINDS[kind].layout(data);
  return docx(id, layout, id + '.docx');
}
export function preview(kind, data) {
  if (kind === 'timeline') return {html: timelineHtml(timelineData(data)), land: true};
  const {id, layout} = KINDS[kind].layout(data);
  return {html: previewHtml(id, layout), land: kind === 'news_tv' || kind === 'news_en'};
}
export const fileName = (kind, doc) => (plain(doc.title || KINDS[kind].titleOf(doc.data || {}) || KINDS[kind].name).replace(/[\\/:*?"<>|\n]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 120) || KINDS[kind].name) + '.' + KINDS[kind].ext;
// văn bản thuần (để AI đọc lại tài liệu, để tìm kiếm)
export function asText(kind, data) {
  if (kind === 'timeline') { const d = timelineData(data); return [d.title, d.channel, ...d.phases.flatMap(p => [p.name, ...arr(p.items).map(i => [i.content, i.format, i.deadline, i.publish, i.channel, i.a_content, i.a_media, i.a_editor, i.note].map(S).join(' | '))])].join('\n'); }
  const {layout} = KINDS[kind].layout(data);
  return layout.map(b => b.table ? b.rows.map(r => r.span ? r.span.map(x => x.t).join(' ') : r.cells.map(c => c.map(x => x.t).join('\n')).join(' | ')).join('\n') : b.t).map(plain).join('\n');
}
export {today};
