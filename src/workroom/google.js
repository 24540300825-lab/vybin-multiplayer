// PHÒNG VY — WORKROOM · Google Workspace (Drive, Docs, Sheets, Calendar, Gmail nháp) qua API chính thức.
// Cách xin quyền: dùng lại đăng nhập Google sẵn có của game (Supabase Auth) và xin THÊM quyền khi Vy bấm "Kết nối".
//   • Trình duyệt chỉ giữ access token ngắn hạn (~1 giờ) trong sessionStorage của tab này. KHÔNG lưu refresh token, không có client secret ở đây.
//   • Hết hạn → hiện "cần kết nối lại" (bấm 1 nút). Ngắt kết nối = thu hồi token ở Google.
// Phạm vi quyền (xin từng nhóm, đúng lúc cần):
//   drive    — đọc thư mục mẫu, sao chép mẫu, tạo/cập nhật Docs & Sheets (API Docs/Sheets chấp nhận quyền này)
//   calendar — tạo/sửa sự kiện lịch          gmail — CHỈ soạn nháp (không gửi)
const TOK = 'vyGTok';
export const SCOPES = {
  drive: 'https://www.googleapis.com/auth/drive',
  calendar: 'https://www.googleapis.com/auth/calendar.events',
  gmail: 'https://www.googleapis.com/auth/gmail.compose',
};
const MIME = {doc: 'application/vnd.google-apps.document', sheet: 'application/vnd.google-apps.spreadsheet', folder: 'application/vnd.google-apps.folder',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'};
class GError extends Error { constructor(code, msg, o = {}) { super(msg); this.code = code; Object.assign(this, o); } }

export function createGoogle(SH, store) {
  const hs = [];
  const read = () => { try { const t = JSON.parse(sessionStorage.getItem(TOK) || 'null'); return t && Date.now() - t.at < 55 * 60e3 ? t : null; } catch (e) { return null; } };
  const G = {
    MIME,
    on(fn) { hs.push(fn); return () => hs.splice(hs.indexOf(fn), 1); },
    get token() { return read(); },
    has(group = 'drive') { const t = read(); return !!t && (t.sc || '').split(' ').includes(SCOPES[group]); },
    get status() { const raw = sessionStorage.getItem(TOK); return read() ? 'connected' : raw ? 'expired' : (store.settings.google_linked ? 'expired' : 'none'); },
    get available() { return !store.local && !!(SH.sess && SH.sess.sb && SH.sess.sb.auth.signInWithOAuth); },
  };
  const emit = () => hs.slice().forEach(f => { try { f(); } catch (e) {} });
  // chuyển sang trang Google xin quyền rồi quay lại đúng Workroom. groups: ['drive','calendar','gmail']
  G.connect = async (groups = ['drive']) => {
    if (!G.available) throw new GError('unavailable', 'Bản thử không kết nối Google được. Mở game bằng tài khoản thật để kết nối.');
    const cur = (read() || {}).sc || '', want = [...new Set([...cur.split(' ').filter(Boolean), ...(store.settings.google_groups || []).map(g => SCOPES[g]), ...groups.map(g => SCOPES[g])])].join(' ');
    await store.setSetting('google_groups', [...new Set([...(store.settings.google_groups || []), ...groups])]);
    sessionStorage.setItem('vyGPending', '1'); sessionStorage.setItem('vyGScope', want); sessionStorage.setItem('vyWrReopen', '1');
    const {error} = await SH.sess.sb.auth.signInWithOAuth({provider: 'google', options: {redirectTo: location.origin + location.pathname + location.search, scopes: want,
      queryParams: {prompt: 'consent', access_type: 'online', include_granted_scopes: 'true', ...(store.account ? {login_hint: store.account} : {})}}});
    if (error) { sessionStorage.removeItem('vyGPending'); throw new GError('oauth', error.message || String(error)); }
  };
  G.disconnect = async () => {
    const t = read(); try { if (t) await fetch('https://oauth2.googleapis.com/revoke?token=' + encodeURIComponent(t.t), {method: 'POST'}); } catch (e) {}
    sessionStorage.removeItem(TOK); await store.setSetting('google_linked', false); await store.setSetting('google_groups', []); emit();
  };
  // sau khi quay lại từ Google: ghi nhận đã kết nối (không lưu token vào cơ sở dữ liệu)
  G.afterReturn = async () => { if (read() && !store.settings.google_linked) { await store.setSetting('google_linked', true); await store.log('google.connect', 'Kết nối Google Workspace'); } };

  async function api(url, o = {}, tries = 0) {
    const t = read(); if (!t) throw new GError('expired', 'Chưa kết nối Google hoặc phiên đã hết hạn. Vào Cài đặt & Kết nối để kết nối lại.');
    let r; try { r = await fetch(url, {...o, headers: {Authorization: 'Bearer ' + t.t, ...(o.headers || {})}}); } catch (e) { throw new GError('network', 'Không gọi được Google (mạng?).'); }
    if (r.status === 401) { sessionStorage.setItem(TOK, JSON.stringify({...t, at: 0})); emit(); throw new GError('expired', 'Phiên Google đã hết hạn. Bấm "Kết nối lại" ở Cài đặt & Kết nối.'); }
    if ((r.status === 429 || r.status >= 500) && tries < 2) { await new Promise(s => setTimeout(s, 700 * (tries + 1))); return api(url, o, tries + 1); }   // tự thử lại khi Google bận
    if (!r.ok) {
      let m = ''; try { m = (await r.json()).error.message; } catch (e) {}
      if (r.status === 403 && /has not been used|is disabled|accessNotConfigured|SERVICE_DISABLED/i.test(m)) {
        const api = /gmail/i.test(url) ? 'Gmail API' : /sheets/i.test(url) ? 'Google Sheets API' : /calendar/i.test(url) ? 'Google Calendar API' : 'Google Drive API';
        const link = (m.match(/https:\/\/console\.(?:developers|cloud)\.google\.com\/[^\s"')]+/) || [])[0] || 'https://console.cloud.google.com/apis/library';
        throw new GError('api_off', `${api} chưa được bật trong dự án Google Cloud mà game dùng để đăng nhập. Bấm “Bật ${api}” → Enable, đợi 1–2 phút rồi thử lại.`, {url: link, urlLabel: 'Bật ' + api});
      }
      if (r.status === 403 && /insufficient|scope/i.test(m)) throw new GError('scope', 'Chưa cấp quyền này. Vào Cài đặt & Kết nối để cấp thêm quyền.');
      throw new GError('http', 'Google báo lỗi ' + r.status + (m ? ': ' + m : ''));
    }
    return o.raw ? r : r.status === 204 ? null : r.json();
  }
  const D = 'https://www.googleapis.com/drive/v3', q = o => new URLSearchParams({supportsAllDrives: 'true', ...o}).toString();
  const FIELDS = 'id,name,mimeType,modifiedTime,webViewLink,parents,size';
  G.idFromUrl = s => { const m = String(s || '').match(/\/(?:folders|d)\/([\w-]{20,})/) || String(s || '').match(/[?&]id=([\w-]{20,})/) || String(s || '').match(/^([\w-]{25,})$/); return m ? m[1] : null; };

  G.drive = {
    meta: id => api(`${D}/files/${id}?${q({fields: FIELDS})}`),
    async list(folderId) { const out = []; let pageToken = ''; do { const r = await api(`${D}/files?${q({q: `'${folderId}' in parents and trashed = false`, fields: `nextPageToken,files(${FIELDS})`, pageSize: 200, includeItemsFromAllDrives: 'true', orderBy: 'folder,name', ...(pageToken ? {pageToken} : {})})}`); out.push(...(r.files || [])); pageToken = r.nextPageToken || ''; } while (pageToken); return out; },
    // duyệt cả thư mục con (tối đa 3 tầng, 300 file) — chỉ trong thư mục người dùng đã chọn
    async walk(folderId, depth = 3, path = '') { const out = []; for (const f of await G.drive.list(folderId)) { if (f.mimeType === MIME.folder) { if (depth > 1 && out.length < 300) out.push(...await G.drive.walk(f.id, depth - 1, path + f.name + ' / ')); } else out.push({...f, path}); } return out; },
    search: text => api(`${D}/files?${q({q: `fullText contains '${String(text).replace(/['\\]/g, ' ')}' and trashed = false`, fields: `files(${FIELDS})`, pageSize: 20, includeItemsFromAllDrives: 'true'})}`).then(r => r.files || []),
    async bytes(id) { return (await api(`${D}/files/${id}?${q({alt: 'media'})}`, {raw: true})).arrayBuffer(); },
    async exportAs(id, mime) { return (await api(`${D}/files/${id}/export?mimeType=${encodeURIComponent(mime)}`, {raw: true})).blob(); },
    // sao chép (không đụng file gốc). toMime: đổi sang Google Docs/Sheets để chỉnh sửa mà vẫn giữ định dạng mẫu
    copy: (id, name, {parent, toMime} = {}) => api(`${D}/files/${id}/copy?${q({fields: FIELDS})}`, {method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({name, ...(parent ? {parents: [parent]} : {}), ...(toMime ? {mimeType: toMime} : {})})}),
    createFolder: (name, parent) => api(`${D}/files?${q({fields: FIELDS})}`, {method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({name, mimeType: MIME.folder, ...(parent ? {parents: [parent]} : {})})}),
    // tạo Google Docs từ HTML (Google tự đổi tiêu đề, đoạn, danh sách, in đậm/nghiêng)
    createDoc(name, html, parent) { return upload('POST', `https://www.googleapis.com/upload/drive/v3/files?${q({uploadType: 'multipart', fields: FIELDS})}`, {name, mimeType: MIME.doc, ...(parent ? {parents: [parent]} : {})}, html); },
    // cập nhật nội dung Docs đã tạo từ Workroom (thay toàn bộ nội dung — chỉ gọi sau khi người dùng xác nhận)
    updateDoc(id, html, name) { return upload('PATCH', `https://www.googleapis.com/upload/drive/v3/files/${id}?${q({uploadType: 'multipart', fields: FIELDS})}`, name ? {name} : {}, html); },
  };
  // tải file .docx/.xlsx lên Drive (giữ nguyên định dạng file như mẫu). id có sẵn → ghi phiên bản mới cho đúng file đó (Drive giữ lịch sử phiên bản)
  // convertTo: MIME.doc / MIME.sheet → Google tự chuyển .docx/.xlsx thành Google Docs/Sheets (sửa và góp ý ngay trên Google)
  G.drive.putFile = (blob, {name, mime, parent, id, convertTo}) => {
    const b = 'wr' + Math.random().toString(36).slice(2), meta = id ? {name} : {name, mimeType: convertTo || mime, ...(parent ? {parents: [parent]} : {})};
    const body = new Blob([`--${b}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(meta)}\r\n--${b}\r\nContent-Type: ${mime}\r\n\r\n`, blob, `\r\n--${b}--`]);
    return api(id ? `https://www.googleapis.com/upload/drive/v3/files/${id}?${q({uploadType: 'multipart', fields: FIELDS})}` : `https://www.googleapis.com/upload/drive/v3/files?${q({uploadType: 'multipart', fields: FIELDS})}`,
      {method: id ? 'PATCH' : 'POST', headers: {'Content-Type': 'multipart/related; boundary=' + b}, body});
  };
  // duyệt thư mục để chọn nơi đẩy lên (chỉ thư mục, không đọc nội dung file)
  G.drive.folders = (parent = 'root', shared = false) => api(`${D}/files?${q({q: shared ? `sharedWithMe = true and mimeType = '${MIME.folder}' and trashed = false` : `'${parent}' in parents and mimeType = '${MIME.folder}' and trashed = false`, fields: `files(${FIELDS})`, pageSize: 200, orderBy: 'name', includeItemsFromAllDrives: 'true'})}`).then(r => r.files || []);
  // chia sẻ cho người nhận (Google tự gửi email báo — chỉ chạy khi Vy bấm và xác nhận)
  G.drive.share = (id, email, role = 'commenter', message = '') => api(`${D}/files/${id}/permissions?${q({sendNotificationEmail: 'true', ...(message ? {emailMessage: message} : {})})}`, {method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({type: 'user', role, emailAddress: email})});
  // góp ý (bình luận) trên Google Docs/Sheets
  G.drive.comments = id => api(`${D}/files/${id}/comments?${q({fields: 'comments(id,content,resolved,createdTime,author(displayName,emailAddress),quotedFileContent(value),replies(content,author(displayName)))', pageSize: 100, includeDeleted: 'false'})}`).then(r => r.comments || []);
  // thư mục con theo tên (tạo nếu chưa có), nhớ id trong cài đặt
  G.folderPath = async (names, base = null) => {
    const key = (base ? base.id + ':' : '') + names.join(' / '), map = {...(store.settings.drive_dirs || {})};
    if (!names.length && base) return base;
    if (map[key]) { try { await G.drive.meta(map[key].id); return map[key]; } catch (e) { if (e.code !== 'http') throw e; } }
    let parent = base ? base.id : (await G.workFolder()).id, f = null;
    for (const n of names) {
      const found = await api(`${D}/files?${q({q: `'${parent}' in parents and trashed = false and mimeType = '${MIME.folder}' and name = '${n.replace(/['\\]/g, ' ')}'`, fields: `files(${FIELDS})`, includeItemsFromAllDrives: 'true'})}`);
      f = (found.files || [])[0] || await G.drive.createFolder(n, parent); parent = f.id;
    }
    map[key] = {id: f.id, url: f.webViewLink}; await store.setSetting('drive_dirs', map); return map[key];
  };
  function upload(method, url, meta, html) {
    const b = 'wr' + Math.random().toString(36).slice(2), doc = `<!doctype html><html><head><meta charset="utf-8"><style>body{font-family:'Times New Roman';font-size:13pt;line-height:1.5}p{text-align:justify}h1{font-size:15pt;text-align:center}h2{font-size:14pt}h3{font-size:13pt}</style></head><body>${html}</body></html>`;
    return api(url, {method, headers: {'Content-Type': 'multipart/related; boundary=' + b}, body: `--${b}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(meta)}\r\n--${b}\r\nContent-Type: text/html; charset=UTF-8\r\n\r\n${doc}\r\n--${b}--`});
  }
  // đọc 1 file Drive thành văn bản / bảng (không sửa gì trên Drive)
  G.readFile = async f => {
    const {readDocx, readXlsx, readCsv} = await import('./files.js');
    if (f.mimeType === MIME.doc) return {kind: 'text', text: await (await G.drive.exportAs(f.id, 'text/plain')).text()};
    if (f.mimeType === MIME.sheet) { const v = await G.sheets.values(f.id); return {kind: 'table', rows: v, text: v.map(r => r.join(' | ')).join('\n')}; }
    if (f.mimeType === MIME.docx) return {kind: 'text', text: await readDocx(await G.drive.bytes(f.id))};
    if (f.mimeType === MIME.xlsx) { const rows = await readXlsx(await G.drive.bytes(f.id)); return {kind: 'table', rows, text: rows.map(r => r.join(' | ')).join('\n')}; }
    if (/^text\//.test(f.mimeType)) { const t = new TextDecoder().decode(await G.drive.bytes(f.id)); return /csv/.test(f.mimeType) ? {kind: 'table', rows: readCsv(t), text: t} : {kind: 'text', text: t}; }
    throw new GError('type', 'Chưa đọc được loại file này: ' + f.name);
  };
  const SH_ = 'https://sheets.googleapis.com/v4/spreadsheets';
  G.sheets = {
    info: id => api(`${SH_}/${id}?fields=spreadsheetId,spreadsheetUrl,properties.title,sheets.properties`),
    async values(id, range) { if (!range) { const i = await G.sheets.info(id); range = `'${i.sheets[0].properties.title.replace(/'/g, "''")}'`; } return ((await api(`${SH_}/${id}/values/${encodeURIComponent(range)}?valueRenderOption=FORMATTED_VALUE`)).values || []); },
    write: (id, data) => api(`${SH_}/${id}/values:batchUpdate`, {method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({valueInputOption: 'USER_ENTERED', data})}),
    batch: (id, requests) => api(`${SH_}/${id}:batchUpdate`, {method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({requests})}),
    create: (title, parent) => api(`${D}/files?${q({fields: FIELDS})}`, {method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({name: title, mimeType: MIME.sheet, ...(parent ? {parents: [parent]} : {})})}),
  };
  const CAL = 'https://www.googleapis.com/calendar/v3/calendars/primary';
  G.calendar = {
    list: (timeMin, timeMax) => api(`${CAL}/events?${new URLSearchParams({timeMin, timeMax, singleEvents: 'true', orderBy: 'startTime', maxResults: '100'})}`).then(r => r.items || []),
    insert: ev => api(`${CAL}/events`, {method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify(ev)}),
    patch: (id, ev) => api(`${CAL}/events/${id}`, {method: 'PATCH', headers: {'Content-Type': 'application/json'}, body: JSON.stringify(ev)}),
  };
  // Gmail: chỉ TẠO NHÁP. Workroom không có hàm gửi thư.
  G.gmail = {
    draft({to = '', subject, html}) {
      const b64 = s => { const u = new TextEncoder().encode(s); let o = ''; for (let i = 0; i < u.length; i += 6000) o += String.fromCharCode(...u.subarray(i, i + 6000)); return btoa(o); };
      const mime = [`To: ${to}`, `Subject: =?UTF-8?B?${b64(subject)}?=`, 'MIME-Version: 1.0', 'Content-Type: text/html; charset=UTF-8', 'Content-Transfer-Encoding: base64', '', b64(html).replace(/(.{76})/g, '$1\r\n')].join('\r\n');
      return api('https://gmail.googleapis.com/gmail/v1/users/me/drafts', {method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({message: {raw: b64(mime).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')}})});
    },
  };
  // thư mục làm việc của Workroom trên Drive (tạo 1 lần, nhớ id) + thư mục riêng cho từng sự kiện
  G.workFolder = async ev => {
    let root = store.settings.drive_root;
    if (root) { try { await G.drive.meta(root.id); } catch (e) { if (e.code === 'http') root = null; else throw e; } }
    if (!root) { const f = await G.drive.createFolder('PHÒNG VY — Workroom'); root = {id: f.id, url: f.webViewLink}; await store.setSetting('drive_root', root); }
    if (!ev) return root;
    if (ev.links && ev.links.folder) return ev.links.folder;
    const f = await G.drive.createFolder(`${ev.code} — ${ev.name}`.slice(0, 120), root.id), folder = {id: f.id, url: f.webViewLink};
    await store.set('events', ev.id, {links: {...(ev.links || {}), folder}}, {silent: true}); return folder;
  };
  return G;
}
