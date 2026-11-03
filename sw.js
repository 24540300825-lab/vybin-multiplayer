// Service worker của VIBE LAB — chỉ lo THÔNG BÁO HỆ THỐNG (không cache game, không chặn mạng).
// - Trang gọi registration.showNotification(...) khi đang ở tab khác / thu nhỏ → thông báo nổi ở góc màn hình như Zalo/Messenger.
// - Bấm vào thông báo: đưa tab game lên trước (mở mới nếu đã đóng) và báo trang biết cần mở gì (chat, cuộc gọi…).
// - Sự kiện 'push' để sẵn cho bước sau (thông báo khi đã đóng hẳn trình duyệt — cần máy chủ gửi).
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', e => e.waitUntil(self.clients.claim()));

self.addEventListener('notificationclick', e => {
  const n = e.notification, data = n.data || {}, act = e.action || data.action || '';
  n.close();
  e.waitUntil((async () => {
    const all = await self.clients.matchAll({type: 'window', includeUncontrolled: true});
    const scope = self.registration.scope;
    let c = all.find(w => w.url.startsWith(scope));
    if (c) { try { await c.focus(); } catch (err) {} }
    else c = await self.clients.openWindow(data.url || scope);
    if (c) c.postMessage({vyNotify: true, action: act, tag: n.tag});
  })());
});

self.addEventListener('push', e => {
  let d = {}; try { d = e.data ? e.data.json() : {}; } catch (err) { d = {title: 'VIBE LAB', body: e.data && e.data.text()}; }
  e.waitUntil(self.registration.showNotification(d.title || 'VIBE LAB', {
    body: d.body || '', icon: d.icon || 'assets/ui/icon-192.png', badge: 'assets/ui/badge-96.png', tag: d.tag || 'vy', data: d.data || {},
  }));
});
