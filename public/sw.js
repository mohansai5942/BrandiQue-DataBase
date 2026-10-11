/* BrandiQue Data Console service worker: offline shell + push notifications */
const CACHE = 'bq-data-v1';
const SHELL = ['/', '/favicon.svg', '/icons/icon-192.png', '/manifest.webmanifest'];

self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(SHELL)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', event => {
  event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', event => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin || url.pathname.startsWith('/api/')) return;
  if (req.mode === 'navigate') {
    event.respondWith(fetch(req).then(res => { const copy = res.clone(); caches.open(CACHE).then(c => c.put('/', copy)); return res; }).catch(() => caches.match('/')));
    return;
  }
  if (url.pathname.startsWith('/assets/') || url.pathname.startsWith('/icons/')) {
    event.respondWith(caches.match(req).then(hit => hit || fetch(req).then(res => { if (res.ok) { const copy = res.clone(); caches.open(CACHE).then(c => c.put(req, copy)); } return res; })));
  }
});

self.addEventListener('push', event => {
  let data = {};
  try { data = event.data ? event.data.json() : {}; } catch { data = { title: 'BrandiQue Data', body: event.data ? event.data.text() : '' }; }
  const title = data.title || 'New submission';
  event.waitUntil(self.registration.showNotification(title, {
    body: data.body || 'Someone just filled a form on brandique.in',
    icon: '/icons/icon-192.png',
    badge: '/icons/badge-96.png',
    tag: data.tag ? `${data.tag}-${Date.now()}` : undefined,
    data: { url: data.url || '/' },
    vibrate: [120, 60, 120],
  }));
});

self.addEventListener('notificationclick', event => {
  event.notification.close();
  let target = self.location.origin + '/';
  try {
    const url = new URL((event.notification.data && event.notification.data.url) || '/', self.location.origin);
    if (url.origin === self.location.origin) target = url.href; // never open off-site links from a push
  } catch { /* keep the dashboard root */ }
  event.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(list => {
    for (const client of list) {
      if (client.url.startsWith(self.location.origin)) { client.navigate(target).catch(() => undefined); return client.focus(); }
    }
    return self.clients.openWindow(target);
  }));
});
