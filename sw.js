// Service Worker for Mind Core Fitness PWA
const CACHE_NAME = 'mindcore-fitness-v2';
const urlsToCache = [
  '/',
  '/index.html',
  '/quick.html',
  '/personal-training.html',
  '/online-coaching.html',
  '/pricing.html',
  '/checkout.html',
  '/welcome.html',
  '/profile.html',
  '/core-buddy.html',
  '/group-detail.html',
  '/workout.html',
  '/workout-active.html',
  '/logo.PNG',
  '/manifest.json'
];

// Install event - cache files
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => {
        console.log('Opened cache');
        return cache.addAll(urlsToCache);
      })
  );
  self.skipWaiting();
});

// Fetch event - serve from cache, fallback to network
self.addEventListener('fetch', event => {
  event.respondWith(
    caches.match(event.request)
      .then(response => {
        // Return cached version or fetch from network
        return response || fetch(event.request);
      }
    )
  );
});

// Activate event - clean up old caches
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(cacheNames => {
      return Promise.all(
        cacheNames.map(cacheName => {
          if (cacheName !== CACHE_NAME) {
            return caches.delete(cacheName);
          }
        })
      );
    })
  );
  self.clients.claim();
});
