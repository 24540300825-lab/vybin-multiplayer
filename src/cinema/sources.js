// Nhận diện link video → nguồn phát. Mỗi nguồn có: type + dữ liệu để dựng trình phát + nhãn hiển thị.
//   yt / vimeo / twitch / file / hls  : đồng bộ CHUẨN (play/pause/tua theo host)
//   dm / embed                        : chỉ nhúng (bắt đầu cùng lúc; không điều khiển được từ xa)
//   page                              : trang không nhúng được → gợi ý "Chia sẻ tab"
//   stream                            : hình + tiếng truyền trực tiếp từ máy host (chia sẻ tab / file trên máy) qua WebRTC
import {parseYouTube} from '../music-yt.js';

export const KIND = {
  yt: 'YouTube', vimeo: 'Vimeo', dm: 'Dailymotion', twitch: 'Twitch', file: 'Video', hls: 'Phát trực tiếp (HLS)',
  embed: 'Trang nhúng', page: 'Trang web', stream: 'Chia sẻ từ máy host',
};
export const SYNCED = new Set(['yt', 'vimeo', 'twitch', 'file', 'hls', 'stream']);

export function parseSource(text) {
  const s = String(text || '').trim(); if (!s) return null;
  const y = parseYouTube(s); if (y && y.v) return {type: 'yt', id: y.v};
  let u; try { u = new URL(/^https?:\/\//i.test(s) ? s : 'https://' + s); } catch (e) { return null; }
  if (!/^https?:$/.test(u.protocol) || !u.hostname.includes('.')) return null;
  const h = u.hostname.replace(/^(www|m|mobile)\./, ''), path = u.pathname;
  let m;
  if (h === 'vimeo.com' || h === 'player.vimeo.com') { m = path.match(/(?:\/video)?\/(\d{5,})/); if (m) return {type: 'vimeo', id: m[1]}; }
  if (h === 'dailymotion.com' || h === 'dai.ly' || h === 'geo.dailymotion.com') {
    m = path.match(/\/video\/([a-z0-9]+)/i) || (h === 'dai.ly' && path.match(/^\/([a-z0-9]+)/i)); if (m) return {type: 'dm', id: m[1]};
    const v = u.searchParams.get('video'); if (v) return {type: 'dm', id: v};
  }
  if (h === 'twitch.tv' || h === 'clips.twitch.tv') {
    if ((m = path.match(/^\/videos\/(\d+)/))) return {type: 'twitch', video: m[1]};
    if (h === 'clips.twitch.tv' || (m = path.match(/^\/[\w]+\/clip\/([\w-]+)/))) { const clip = m ? m[1] : path.slice(1).split('/')[0]; if (clip) return {type: 'embed', url: 'https://clips.twitch.tv/embed?clip=' + encodeURIComponent(clip) + '&parent=' + location.hostname, label: 'Twitch clip'}; }
    if ((m = path.match(/^\/([\w]{3,25})\/?$/))) return {type: 'twitch', channel: m[1]};
  }
  if (/(^|\.)facebook\.com$|^fb\.watch$/.test(h)) return {type: 'embed', url: 'https://www.facebook.com/plugins/video.php?show_text=false&href=' + encodeURIComponent(u.href), label: 'Facebook'};
  if (h === 'tiktok.com' && (m = path.match(/\/video\/(\d+)/))) return {type: 'embed', url: 'https://www.tiktok.com/embed/v2/' + m[1], label: 'TikTok'};
  if (/\.m3u8$/i.test(path)) return {type: 'hls', url: u.href};
  if (/\.(mp4|webm|ogv|ogg|mov|m4v|mp3|m4a|wav)$/i.test(path)) return {type: 'file', url: u.href};
  return {type: 'page', url: u.href};
}

export const srcKey = s => !s ? '' : s.type + ':' + (s.id || s.video || s.channel || s.url || s.sid || '');
export const thumbOf = s => s && s.type === 'yt' ? 'https://i.ytimg.com/vi/' + s.id + '/mqdefault.jpg' : (s && s.thumb) || '';

// tiêu đề: YouTube / Vimeo có oEmbed (CORS mở); còn lại lấy tên miền / tên file
export async function titleOf(s) {
  try {
    if (s.type === 'yt') { const r = await fetch('https://www.youtube.com/oembed?format=json&url=' + encodeURIComponent('https://www.youtube.com/watch?v=' + s.id)); if (r.ok) return (await r.json()).title; }
    if (s.type === 'vimeo') { const r = await fetch('https://vimeo.com/api/oembed.json?url=' + encodeURIComponent('https://vimeo.com/' + s.id)); if (r.ok) { const j = await r.json(); s.thumb = j.thumbnail_url; return j.title; } }
  } catch (e) {}
  if (s.type === 'twitch') return s.video ? 'Twitch · video ' + s.video : 'Twitch · ' + s.channel + ' (trực tiếp)';
  if (s.url) { try { const u = new URL(s.url); const f = decodeURIComponent(u.pathname.split('/').pop() || ''); return (s.label ? s.label + ' · ' : '') + (f && /\./.test(f) ? f : u.hostname.replace(/^www\./, '')); } catch (e) {} }
  return KIND[s.type] || 'Video';
}
