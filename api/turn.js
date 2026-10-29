// Cấp thông tin TURN NGẮN HẠN cho cuộc gọi (chỉ thành viên đang ở trong phòng mới nhận được).
// Khóa bí mật của nhà cung cấp TURN nằm trong biến môi trường của Vercel — KHÔNG bao giờ gửi xuống trình duyệt.
// Chưa cấu hình biến môi trường => trả danh sách rỗng, cuộc gọi dùng STUN công cộng (hoạt động ở đa số mạng, không phải mọi mạng).
//
// Nhà cung cấp hỗ trợ (đặt biến môi trường trong Vercel → Settings → Environment Variables):
//   Cloudflare Realtime TURN : CF_TURN_KEY_ID, CF_TURN_API_TOKEN
//   Metered (Open Relay)     : METERED_APP (tên app, vd "vybin"), METERED_API_KEY
const SB_URL = process.env.SUPABASE_URL || 'https://fywwphdhsytiecrtmemp.supabase.co';
// anon key là thông tin CÔNG KHAI (cũng nằm trong config.js); quyền thật nằm ở RLS/RPC.
const SB_ANON = process.env.SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZ5d3dwaGRoc3l0aWVjcnRtZW1wIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTMyNjMyMTQsImV4cCI6MjEwODgzOTIxNH0.GU0e7uewu4Jq7CrSr9W75o1i5ZozTbjEuT0VVHjUjaE';
const TTL = 3600;                       // thông tin TURN sống 1 giờ; trình duyệt tự làm mới sau 45 phút
const CACHE_MS = 10 * 60e3;             // dùng chung cho cả 2 người trong 10 phút => ít gọi nhà cung cấp
let cache = {at: 0, servers: null, provider: ''};

async function getJson(url, opt, ms = 5000) {
  const ac = new AbortController(), to = setTimeout(() => ac.abort(), ms);
  try { const r = await fetch(url, {...opt, signal: ac.signal}); return {ok: r.ok, status: r.status, body: await r.json().catch(() => null)}; }
  finally { clearTimeout(to); }
}

async function mint() {
  const e = process.env;
  if (e.CF_TURN_KEY_ID && e.CF_TURN_API_TOKEN) {
    const r = await getJson(`https://rtc.live.cloudflare.com/v1/turn/keys/${encodeURIComponent(e.CF_TURN_KEY_ID)}/credentials/generate`,
      {method: 'POST', headers: {Authorization: 'Bearer ' + e.CF_TURN_API_TOKEN, 'Content-Type': 'application/json'}, body: JSON.stringify({ttl: TTL})});
    if (!r.ok || !r.body || !r.body.iceServers) throw new Error('cloudflare_' + r.status);
    const one = Array.isArray(r.body.iceServers) ? r.body.iceServers : [r.body.iceServers];
    // cổng 53 bị trình duyệt chặn cho TURN => bỏ
    return {provider: 'cloudflare', servers: one.map(s => ({...s, urls: [].concat(s.urls).filter(u => !/:53(\?|$)/.test(u))})).filter(s => s.urls.length)};
  }
  if (e.METERED_APP && e.METERED_API_KEY) {
    const r = await getJson(`https://${encodeURIComponent(e.METERED_APP)}.metered.live/api/v1/turn/credentials?apiKey=${encodeURIComponent(e.METERED_API_KEY)}`);
    if (!r.ok || !Array.isArray(r.body)) throw new Error('metered_' + r.status);
    return {provider: 'metered', servers: r.body.filter(s => s.urls && s.username && s.credential)};
  }
  return {provider: '', servers: []};
}

module.exports = async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  if (req.method !== 'GET') return res.status(405).json({error: 'method'});
  const token = String(req.headers.authorization || '').replace(/^Bearer\s+/i, '');
  const room = String((req.query && req.query.room) || '');
  if (!token || token.length > 4000 || !/^[a-z0-9_-]{1,32}$/.test(room)) return res.status(400).json({error: 'bad_request'});
  try {
    // 1 lần gọi vừa kiểm tra đăng nhập (JWT hợp lệ) vừa kiểm tra đang là thành viên phòng (RPC is_room_member, chạy dưới quyền người gọi)
    const m = await getJson(`${SB_URL}/rest/v1/rpc/is_room_member`, {method: 'POST', headers: {apikey: SB_ANON, Authorization: 'Bearer ' + token, 'Content-Type': 'application/json'}, body: JSON.stringify({p_room: room})});
    if (m.status === 401 || m.status === 403) return res.status(401).json({error: 'unauthorized'});
    if (!m.ok || m.body !== true) return res.status(403).json({error: 'not_member'});
    if (!cache.servers || Date.now() - cache.at > CACHE_MS) { const r = await mint(); cache = {at: Date.now(), servers: r.servers, provider: r.provider}; }
    return res.status(200).json({iceServers: cache.servers, provider: cache.provider || null, ttl: TTL});
  } catch (e) {
    return res.status(502).json({error: 'upstream', iceServers: []});     // trình duyệt tự rơi về STUN
  }
};
