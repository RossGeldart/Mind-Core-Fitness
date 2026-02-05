const CACHE_NAME = 'mind-core-fitness-v2';
const urlsToCache = [
  '/',
  '/dashboard/',
  '/admin/',
  '/Logo.PNG',
  '/styles.css',
  '/js/dashboard-styles.css',
  '/js/firebase-config.js',
  '/social-share.css',
  '/social-share.js'
];

// Install service worker and cache essential files
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => {
        console.log('Opened cache');
        return cache.addAll(urlsToCache);
      })
      .catch(err => {
        console.log('Cache install failed:', err);
      })
  );
  self.skipWaiting();
});

// Activate and clean up old caches
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(cacheNames => {
      return Promise.all(
        cacheNames.map(cacheName => {
          if (cacheName !== CACHE_NAME) {
            console.log('Deleting old cache:', cacheName);
            return caches.delete(cacheName);
          }
        })
      );
    })
  );
  self.clients.claim();
});

// Fetch strategy: Network first, fall back to cache
self.addEventListener('fetch', event => {
  // Skip non-GET requests and Firebase/external requests
  if (event.request.method !== 'GET') return;
  if (event.request.url.includes('firebaseio.com') || 
      event.request.url.includes('googleapis.com') ||
      event.request.url.includes('firebase')) return;

  event.respondWith(
    fetch(event.request)
      .then(response => {
        // Clone the response before caching
        if (response && response.status === 200) {
          const responseClone = response.clone();
          caches.open(CACHE_NAME).then(cache => {
            cache.put(event.request, responseClone);
          });
        }
        return response;
      })
      .catch(() => {
        // Network failed, try cache
        return caches.match(event.request);
      })
  );
});
