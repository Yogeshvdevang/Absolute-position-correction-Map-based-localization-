/// <reference lib="webworker" />

const CACHE_NAME = 'map-tiles-v1';
const TILE_PATTERNS = [
  /tile\.openstreetmap\.org/,
  /arcgisonline\.com.*MapServer\/tile/,
  /tile\.opentopomap\.org/,
  /tiles\.stadiamaps\.com\/tiles\/alidade_smooth_dark/
];

declare const self: ServiceWorkerGlobalScope;

// Install event - cache static assets
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll([]);
    })
  );
  self.skipWaiting();
});

// Activate event - clean up old caches
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames
          .filter((name) => name !== CACHE_NAME)
          .map((name) => caches.delete(name))
      );
    })
  );
  self.clients.claim();
});

// Fetch event - serve from cache, fallback to network
self.addEventListener('fetch', (event) => {
  const url = event.request.url;
  
  // Check if this is a tile request
  const isTileRequest = TILE_PATTERNS.some(pattern => pattern.test(url));
  
  if (isTileRequest) {
    event.respondWith(
      caches.open(CACHE_NAME).then(async (cache) => {
        // Try to get from cache first
        const cachedResponse = await cache.match(event.request);
        
        if (cachedResponse) {
          // Return cached version immediately
          // Also fetch fresh version in background for next time
          fetch(event.request).then((networkResponse) => {
            if (networkResponse.ok) {
              cache.put(event.request, networkResponse.clone());
            }
          }).catch(() => {});
          
          return cachedResponse;
        }
        
        // Not in cache, fetch from network
        try {
          const networkResponse = await fetch(event.request);
          
          if (networkResponse.ok) {
            // Cache the new tile
            cache.put(event.request, networkResponse.clone());
          }
          
          return networkResponse;
        } catch (error) {
          // Network failed and no cache - return a placeholder or error
          return new Response('Tile not available', { status: 503 });
        }
      })
    );
  }
});

// Message handler for cache management
self.addEventListener('message', (event) => {
  if (event.data.type === 'CLEAR_TILE_CACHE') {
    caches.delete(CACHE_NAME).then(() => {
      caches.open(CACHE_NAME);
    });
  }
});

export {};
