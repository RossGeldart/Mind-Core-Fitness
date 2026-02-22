/* ==================== FIREBASE CLOUD MESSAGING ==================== */

// Import Firebase scripts for push notifications
importScripts('https://www.gstatic.com/firebasejs/10.12.0/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.12.0/firebase-messaging-compat.js');

firebase.initializeApp({
  apiKey: 'AIzaSyBCIgMJd3By7qkWH27YiW9VooIBGE3bFLs',
  authDomain: 'mind-core-fitness-client.firebaseapp.com',
  projectId: 'mind-core-fitness-client',
  storageBucket: 'mind-core-fitness-client.firebasestorage.app',
  messagingSenderId: '669343392406',
  appId: '1:669343392406:web:f5a35ee062387e7d6f58b7',
});

const messaging = firebase.messaging();

// Handle background push messages (when app is not in foreground)
messaging.onBackgroundMessage((payload) => {
  const { title, body, icon } = payload.notification || {};
  const notifTitle = title || 'Core Buddy';
  const notifOptions = {
    body: body || 'You have a new notification',
    icon: icon || '/login/Logo.webp',
    badge: '/login/Logo.webp',
    data: payload.data || {},
    tag: payload.data?.type || 'general',
  };
  self.registration.showNotification(notifTitle, notifOptions);
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

const CACHE_NAME = 'mcf-v3';

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
