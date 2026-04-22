const CACHE_NAME = 'gpf-insight-cache-v2';

self.addEventListener('install', (event) => {
  self.skipWaiting(); // บังคับให้ Service Worker ตัวใหม่ทำงานทันที
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(['/']);
    })
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cacheName) => {
          if (cacheName !== CACHE_NAME) {
            return caches.delete(cacheName); // ล้างแคชตัวเก่าทิ้ง
          }
        })
      );
    }).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  // สำคัญมาก: ปล่อยผ่าน Request ที่ไม่ใช่ GET (เช่น POST ของ Firebase) ไม่ให้พัง
  if (event.request.method !== 'GET') return;

  const url = new URL(event.request.url);
  // ปล่อยผ่าน API และ Firebase ทั้งหมด ไม่ต้องเอาลง Cache
  if (url.hostname.includes('googleapis.com') || 
      url.hostname.includes('cnn.io') ||
      url.hostname.includes('firebase')) {
    return;
  }

  event.respondWith(
    caches.match(event.request).then((response) => {
      return response || fetch(event.request);
    }).catch(() => fetch(event.request))
  );
});
