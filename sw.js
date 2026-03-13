var CACHE_NAME = 'mcf-v4';
var ASSETS_TO_CACHE = [
  '/',
  '/styles.css',
  '/social-share.css',
  '/social-share.js',
  '/Logo.webp',
  '/Logo.PNG',
  '/manifest.json',
  '/index.html',
  '/pricing.html',
  '/about.html',
  '/personal-training.html',
  '/blog.html',
  '/faq.html',
  '/core-buddy.html'
];

self.addEventListener('install', function(event) {
  event.waitUntil(
    caches.open(CACHE_NAME).then(function(cache) {
      return cache.addAll(ASSETS_TO_CACHE);
    })
  );
  self.skipWaiting();
});

self.addEventListener('activate', function(event) {
  event.waitUntil(
    caches.keys().then(function(cacheNames) {
      return Promise.all(
        cacheNames.filter(function(name) {
          return name !== CACHE_NAME;
        }).map(function(name) {
          return caches.delete(name);
        })
      );
    })
  );
  self.clients.claim();
});

// Stale-while-revalidate: serve from cache immediately, update cache in background
self.addEventListener('fetch', function(event) {
  var request = event.request;

  // Only handle GET requests
  if (request.method !== 'GET') return;

  var url = new URL(request.url);

  // Skip cross-origin analytics/tracking requests entirely
  if (url.origin !== self.location.origin &&
      !url.hostname.includes('fonts.googleapis.com') &&
      !url.hostname.includes('fonts.gstatic.com')) {
    return;
  }

  // Skip API calls — always go to network
  if (url.pathname.startsWith('/api/')) return;

  // For navigation requests, use network-first with cache fallback
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request).then(function(networkResponse) {
        if (networkResponse && networkResponse.status === 200) {
          var responseClone = networkResponse.clone();
          caches.open(CACHE_NAME).then(function(cache) {
            cache.put(request, responseClone);
          });
        }
        return networkResponse;
      }).catch(function() {
        return caches.match(request).then(function(cachedResponse) {
          return cachedResponse || caches.match('/');
        });
      })
    );
    return;
  }

  // For all other assets: stale-while-revalidate
  event.respondWith(
    caches.open(CACHE_NAME).then(function(cache) {
      return cache.match(request).then(function(cachedResponse) {
        var fetchPromise = fetch(request).then(function(networkResponse) {
          // Cache the fresh response for next time
          if (networkResponse && networkResponse.status === 200) {
            cache.put(request, networkResponse.clone());
          }
          return networkResponse;
        }).catch(function() {
          // Network failed — cachedResponse is our only hope
          return cachedResponse;
        });

        // Return cached version immediately if available, otherwise wait for network
        return cachedResponse || fetchPromise;
      });
    })
  );
});
