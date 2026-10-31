// Cấu hình runtime. Giá trị lấy từ /config.js (window.VYBIN_CONFIG) + tham số URL.
// Supabase URL + anon key là THÔNG TIN CÔNG KHAI theo thiết kế (bảo mật nằm ở RLS). Không bao giờ để service_role ở đây.
const c = window.VYBIN_CONFIG || {};
const q = new URLSearchParams(location.search);
export const CONFIG = {
  supabaseUrl: c.supabaseUrl || '',
  supabaseAnonKey: c.supabaseAnonKey || '',
  supabaseJs: c.supabaseJs || 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.45.4/+esm',
  room: (q.get('room') || c.room || 'main').toLowerCase().replace(/[^a-z0-9_-]/g, '').slice(0, 32) || 'main',
  privateChannels: c.privateChannels !== false,
  snapshotHz: c.snapshotHz || 10,          // tần số gửi vị trí khi đi qua Supabase (có giới hạn tin/giây)
  p2pHz: c.p2pHz || 20,                    // tần số gửi vị trí khi có đường nối thẳng 2 máy
  p2p: c.p2p !== false && !q.has('nop2p'), // tắt thử: ?nop2p
  idleHz: c.idleHz || 0.4,                  // khi đứng yên
  ice: c.ice || [{urls: 'stun:stun.l.google.com:19302'}, {urls: 'stun:stun1.l.google.com:19302'}],
  turn: c.turn || null,                    // {urls:[...], username, credential}
  mock: q.get('mock') || c.mock || '',     // dev: đường dẫn module Supabase giả lập
  solo: q.has('solo'),
  as: q.get('as') || '',
  perf: q.has('perf'),
  test: /[?&]test/.test(location.search),
};
CONFIG.multiplayer = !CONFIG.solo && !!((CONFIG.supabaseUrl && CONFIG.supabaseAnonKey) || CONFIG.mock);
