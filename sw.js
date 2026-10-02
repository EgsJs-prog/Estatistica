// Service Worker – Estatística Descritiva PWA
// Cache-first strategy for offline support

var CACHE_NAME = 'estat-v1';
var ASSETS = [
  './',
  './index.html',
  './style.css',
  './app.js',
  './manifest.json',
  './icons/icon-192.png',
  './icons/icon-512.png'
];

// Install: cache essential assets
self.addEventListener('install', function (e) {
  e.waitUntil(
    caches.open(CACHE_NAME).then(function (cache) {
      return cache.addAll(ASSETS);
    }).then(function () {
      return self.skipWaiting();
    })
  );
});

// Activate: clean old caches
self.addEventListener('activate', function (e) {
  e.waitUntil(
    caches.keys().then(function (names) {
      return Promise.all(
        names.filter(function (n) { return n !== CACHE_NAME; })
          .map(function (n) { return caches.delete(n); })
      );
    }).then(function () {
      return self.clients.claim();
    })
  );
});

// Fetch: cache-first for app assets, network-first for fonts/external
self.addEventListener('fetch', function (e) {
  var url = new URL(e.request.url);

  // Skip non-GET requests
  if (e.request.method !== 'GET') return;

  // For Google Fonts and external resources: network first, fallback to cache
  if (url.origin !== location.origin) {
    e.respondWith(
      fetch(e.request).then(function (response) {
        // Cache a copy
        var clone = response.clone();
        caches.open(CACHE_NAME).then(function (cache) {
          cache.put(e.request, clone);
        });
        return response;
      }).catch(function () {
        return caches.match(e.request);
      })
    );
    return;
  }

  // For app assets: cache first, fallback to network
  e.respondWith(
    caches.match(e.request).then(function (cached) {
      if (cached) {
        // Also update the cache in background
        fetch(e.request).then(function (response) {
          caches.open(CACHE_NAME).then(function (cache) {
            cache.put(e.request, response);
          });
        }).catch(function () { /* offline, ignore */ });
        return cached;
      }
      return fetch(e.request).then(function (response) {
        var clone = response.clone();
        caches.open(CACHE_NAME).then(function (cache) {
          cache.put(e.request, clone);
        });
        return response;
      });
    })
  );
});
