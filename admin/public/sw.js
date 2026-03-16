/* ==================== FIREBASE CLOUD MESSAGING ==================== */

// Handle background push messages using raw push event.
// We intentionally do NOT initialise firebase.messaging() here —
// having both the Firebase SDK listener and a raw 'push' handler
// causes duplicate or dropped notifications. The raw handler is
// more reliable on iOS Safari PWAs because we control waitUntil().
self.addEventListener('push', (e) => {
  if (!e.data) return;

  let payload;
  try {
    payload = e.data.json();
  } catch {
    return;
  }

  // We send data-only FCM messages (no top-level `notification` key) so
  // the SW push event always fires — especially on iOS Safari PWAs where
  // a notification-type message can be swallowed without waking the SW.
  // Read title/body from data first, fall back to notification for compat.
  const data = payload.data || {};
  const notif = payload.notification || {};
  const notifTitle = data.title || notif.title || 'Core Buddy';
  const notifOptions = {
    body: data.body || notif.body || 'You have a new notification',
    icon: notif.icon || '/login/Logo.webp',
    badge: '/login/Logo.webp',
    data: data,
    tag: data.type || 'general',
  };

  e.waitUntil(self.registration.showNotification(notifTitle, notifOptions));
});

// Handle notification click — open the app
self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  const urlToOpen = '/login/#/client/core-buddy';
  e.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      // Focus existing window if open
      for (const client of clientList) {
        if (client.url.includes('/login') && 'focus' in client) {
          return client.focus();
        }
      }
      // Otherwise open a new one
      return self.clients.openWindow(urlToOpen);
    })
  );
});

/* ==================== CACHING ==================== */

const CACHE_NAME = 'mcf-v4';

// App-shell assets cached on install
const APP_SHELL = [
  '/login/',
  '/login/Logo.webp',
  '/login/manifest.json',
];

// Install: cache app shell
self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL))
  );
  self.skipWaiting();
});

// Activate: clean old caches
self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

// Fetch: network-first for navigation, cache-first for static assets
self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);

  // Skip non-GET and cross-origin requests (Firebase, etc.)
  if (e.request.method !== 'GET') return;
  if (url.origin !== self.location.origin) return;

  // HTML navigation: network-first, fallback to cached SPA shell
  if (e.request.mode === 'navigate') {
    e.respondWith(
      fetch(e.request)
        .then((res) => {
          if (res.ok) {
            const clone = res.clone();
            caches.open(CACHE_NAME).then((c) => c.put(e.request, clone));
          }
          return res;
        })
        .catch(() => caches.match('/login/'))
    );
    return;
  }

  // Static assets (JS, CSS, images, fonts): cache-first
  if (/\.(js|css|webp|jpg|jpeg|png|svg|woff2?)$/.test(url.pathname)) {
    e.respondWith(
      caches.match(e.request).then((cached) => {
        if (cached) return cached;
        return fetch(e.request).then((res) => {
          if (res.ok) {
            const clone = res.clone();
            caches.open(CACHE_NAME).then((c) => c.put(e.request, clone));
          }
          return res;
        });
      })
    );
    return;
  }
});
