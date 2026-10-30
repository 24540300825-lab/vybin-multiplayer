// Tìm nhạc YouTube ngay trong game (người dùng không cần ra ngoài copy link).
// Chỉ thành viên đang ở trong phòng mới gọi được (cùng cách kiểm tra như /api/turn) để không thành "máy tìm kiếm miễn phí" cho người lạ.
// Chỉ TRẢ DANH SÁCH (id, tên, kênh, thời lượng, ảnh bìa). Phát nhạc vẫn qua trình nhúng chính thức của YouTube trên máy người dùng.
//
// Nguồn kết quả, thử lần lượt (cái nào chạy thì dừng):
//   1) YouTube Data API v3 — CHỈ khi có biến môi trường YT_API_KEY trong Vercel (chính thức, ổn định nhất; miễn phí ~100 lượt tìm/ngày).
//   2) Điểm cuối tìm kiếm công khai của chính trang youtube.com (không cần khoá) — là cách mặc định.
//   3) Piped / Invidious (máy chủ công cộng) — dự phòng khi (2) bị chặn.
// Kết quả được nhớ 10 phút trong bộ nhớ của hàm để giảm số lần gọi ra ngoài.
const SB_URL = process.env.SUPABASE_URL || 'https://fywwphdhsytiecrtmemp.supabase.co';
const SB_ANON = process.env.SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZ5d3dwaGRoc3l0aWVjcnRtZW1wIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTMyNjMyMTQsImV4cCI6MjEwODgzOTIxNH0.GU0e7uewu4Jq7CrSr9W75o1i5ZozTbjEuT0VVHjUjaE';
const WEB_KEY = 'AIzaSyAO_FJ2SlqU8Q4STEHLGCilw_Y9_11qcW8';   // khoá công khai của trang youtube.com (ai mở YouTube cũng thấy)
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36';
const CACHE_MS = 10 * 60e3, MAX_CACHE = 200, PER_MIN = 40;
const cache = new Map(), hits = new Map(), okMemberAt = new Map();

async function getJson(url, opt = {}, ms = 4500) {
  const ac = new AbortController(), to = setTimeout(() => ac.abort(), ms);
  try { const r = await fetch(url, {...opt, signal: ac.signal}); return {ok: r.ok, status: r.status, body: await r.json().catch(() => null)}; }
  finally { clearTimeout(to); }
}
const clip = (s, n) => String(s || '').slice(0, n);
const secs = t => { const p = String(t || '').split(':').map(Number); if (!p.length || p.some(isNaN)) return 0; return p.reduce((a, b) => a * 60 + b, 0); };
const fmtDur = s => { s = Math.max(0, s | 0); const h = (s / 3600) | 0, m = ((s % 3600) / 60) | 0, x = s % 60; return (h ? h + ':' + String(m).padStart(2, '0') : m) + ':' + String(x).padStart(2, '0'); };
const norm = a => a.filter(x => x && /^[\w-]{11}$/.test(x.id)).slice(0, 20).map(x => ({id: x.id, t: clip(x.t, 140), c: clip(x.c, 60), d: x.d || ''}));

// ---- 1) API chính thức (nếu có khoá) ----
async function viaOfficial(q, key) {
  const s = await getJson(`https://www.googleapis.com/youtube/v3/search?part=snippet&type=video&videoEmbeddable=true&maxResults=15&q=${encodeURIComponent(q)}&key=${encodeURIComponent(key)}`);
  if (!s.ok || !s.body || !s.body.items) throw new Error('official_' + s.status);
  const ids = s.body.items.map(i => i.id && i.id.videoId).filter(Boolean);
  let dur = {};
  if (ids.length) {
    const v = await getJson(`https://www.googleapis.com/youtube/v3/videos?part=contentDetails&id=${ids.join(',')}&key=${encodeURIComponent(key)}`);
    if (v.ok && v.body && v.body.items) for (const it of v.body.items) { const m = /PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/.exec(it.contentDetails.duration || ''); if (m) dur[it.id] = fmtDur((+m[1] || 0) * 3600 + (+m[2] || 0) * 60 + (+m[3] || 0)); }
  }
  const dec = t => String(t || '').replace(/&amp;/g, '&').replace(/&#39;/g, "'").replace(/&quot;/g, '"');
  return norm(s.body.items.map(i => ({id: i.id.videoId, t: dec(i.snippet.title), c: dec(i.snippet.channelTitle), d: dur[i.id.videoId] || ''})));
}

// ---- 2) điểm cuối tìm kiếm của youtube.com ----
function walk(o, out, depth = 0) {
  if (!o || typeof o !== 'object' || depth > 14) return;
  if (Array.isArray(o)) { for (const x of o) walk(x, out, depth + 1); return; }
  const v = o.videoRenderer;
  if (v && v.videoId) {
    const title = v.title && (v.title.runs ? v.title.runs.map(r => r.text).join('') : v.title.simpleText);
    const chan = v.ownerText && v.ownerText.runs && v.ownerText.runs[0] && v.ownerText.runs[0].text;
    const len = v.lengthText && v.lengthText.simpleText;
    if (len) out.push({id: v.videoId, t: title, c: chan, d: len});    // không có thời lượng = đang phát trực tiếp/quảng cáo → bỏ
  }
  for (const k in o) if (k !== 'videoRenderer') walk(o[k], out, depth + 1);
}
async function viaInnertube(q) {
  const body = {context: {client: {clientName: 'WEB', clientVersion: '2.20240814.01.00', hl: 'vi', gl: 'VN'}}, query: q, params: 'EgIQAQ%3D%3D'};
  const r = await getJson(`https://www.youtube.com/youtubei/v1/search?prettyPrint=false&key=${WEB_KEY}`, {
    method: 'POST', headers: {'Content-Type': 'application/json', 'User-Agent': UA, 'Accept-Language': 'vi,en;q=0.8', Origin: 'https://www.youtube.com', 'X-YouTube-Client-Name': '1', 'X-YouTube-Client-Version': '2.20240814.01.00', Cookie: 'SOCS=CAI; CONSENT=YES+1'},
    body: JSON.stringify(body)});
  if (!r.ok || !r.body) throw new Error('innertube_' + r.status);
  const out = []; walk(r.body.contents, out);
  if (!out.length) throw new Error('innertube_empty');
  return norm(out);
}

// ---- 3) dự phòng: Piped / Invidious ----
const PIPED = ['https://pipedapi.kavin.rocks', 'https://api.piped.private.coffee', 'https://pipedapi.adminforge.de'];
const INVID = ['https://inv.nadeko.net', 'https://yewtu.be', 'https://invidious.nerdvpn.de'];
async function viaMirrors(q) {
  const tries = [
    ...PIPED.map(h => async () => { const r = await getJson(`${h}/search?q=${encodeURIComponent(q)}&filter=videos`, {headers: {'User-Agent': UA}}, 3500); if (!r.ok || !r.body || !Array.isArray(r.body.items)) throw 0;
      return norm(r.body.items.filter(i => i.url && i.duration > 0).map(i => ({id: (i.url.match(/v=([\w-]{11})/) || [])[1], t: i.title, c: i.uploaderName, d: fmtDur(i.duration)}))); }),
    ...INVID.map(h => async () => { const r = await getJson(`${h}/api/v1/search?q=${encodeURIComponent(q)}&type=video`, {headers: {'User-Agent': UA}}, 3500); if (!r.ok || !Array.isArray(r.body)) throw 0;
      return norm(r.body.filter(i => i.videoId && i.lengthSeconds > 0).map(i => ({id: i.videoId, t: i.title, c: i.author, d: fmtDur(i.lengthSeconds)}))); }),
  ];
  for (const f of tries) { try { const x = await f(); if (x.length) return x; } catch (e) {} }
  throw new Error('mirrors_failed');
}

async function isMember(token, room) {
  const k = token.slice(-24) + '|' + room, at = okMemberAt.get(k);
  if (at && Date.now() - at < 5 * 60e3) return 200;
  const m = await getJson(`${SB_URL}/rest/v1/rpc/is_room_member`, {method: 'POST', headers: {apikey: SB_ANON, Authorization: 'Bearer ' + token, 'Content-Type': 'application/json'}, body: JSON.stringify({p_room: room})}, 5000);
  if (m.status === 401 || m.status === 403) return 401;
  if (!m.ok || m.body !== true) return 403;
  okMemberAt.set(k, Date.now()); if (okMemberAt.size > 400) okMemberAt.clear();
  return 200;
}

module.exports = async (req, res) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  if (req.method !== 'GET') return res.status(405).json({error: 'method'});
  const token = String(req.headers.authorization || '').replace(/^Bearer\s+/i, '');
  const room = String((req.query && req.query.room) || '');
  const q = String((req.query && req.query.q) || '').replace(/\s+/g, ' ').trim().slice(0, 100);
  if (!token || token.length > 4000 || !/^[a-z0-9_-]{1,32}$/.test(room) || q.length < 2) return res.status(400).json({error: 'bad_request'});
  // giới hạn tốc độ thô theo người dùng (mỗi bản chạy của hàm): chống bấm/lặp quá nhanh
  const hk = token.slice(-24), now = Date.now(), h = (hits.get(hk) || []).filter(t => now - t < 60e3);
  if (h.length >= PER_MIN) return res.status(429).json({error: 'slow_down'});
  h.push(now); hits.set(hk, h); if (hits.size > 500) hits.clear();
  try {
    const st = await isMember(token, room);
    if (st === 401) return res.status(401).json({error: 'unauthorized'});
    if (st !== 200) return res.status(403).json({error: 'not_member'});
    const key = q.toLowerCase(), c = cache.get(key);
    if (c && now - c.at < CACHE_MS) { res.setHeader('Cache-Control', 'private, max-age=600'); return res.status(200).json({items: c.items, src: c.src + '+cache'}); }
    let items = null, src = '', last = '';
    const steps = [];
    if (process.env.YT_API_KEY) steps.push(['official', () => viaOfficial(q, process.env.YT_API_KEY)]);
    steps.push(['youtube', () => viaInnertube(q)], ['mirror', () => viaMirrors(q)]);
    for (const [name, fn] of steps) { try { items = await fn(); if (items && items.length) { src = name; break; } } catch (e) { last += name + ':' + (e && e.message || e) + ' '; } }
    if (!items || !items.length) return res.status(502).json({error: 'upstream', detail: last.trim()});
    cache.set(key, {at: now, items, src}); if (cache.size > MAX_CACHE) cache.delete(cache.keys().next().value);
    res.setHeader('Cache-Control', 'private, max-age=600');
    return res.status(200).json({items, src});
  } catch (e) {
    return res.status(502).json({error: 'upstream'});
  }
};
