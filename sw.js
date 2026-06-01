/* うんこ＆紫外線チェッカー - Service Worker v4 */
const CACHE_NAME = 'unko-checker-v4';

self.addEventListener('install', (event) => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((names) =>
      Promise.all(names.map((name) => caches.delete(name)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  // キャッシュ一切使わず常にネットワークから取得
  event.respondWith(fetch(event.request));
});
