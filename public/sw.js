const CACHE_NAME = 'gpf-insight-cache-v3';

self.addEventListener('install', (event) => {
  self.skipWaiting(); // บังคับอัปเดต Service Worker ใหม่ทันที
});

self.addEventListener('activate', (event) => {
  // เวลา Activate ให้ไล่ลบแคชเก่าๆ (v1, v2) ทิ้งให้หมดเกลี้ยง
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cacheName) => {
          if (cacheName !== CACHE_NAME) {
            return caches.delete(cacheName);
          }
        })
      );
    }).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  // กรอง Request ที่ไม่ใช่ GET ออกไปก่อน ให้วิ่งสายตรงเท่านั้น
  if (event.request.method !== 'GET') return;

  const url = new URL(event.request.url);
  
  // ปล่อยผ่าน API ภายนอกทั้งหมด ห้ามเอาลง Cache ป้องกันปัญหาจุกจิก
  if (url.hostname.includes('googleapis.com') || 
      url.hostname.includes('firebase') ||
      url.hostname.includes('fonts.')) {
    return;
  }

  // ใช้ยุทธวิธี Network-First (ดึงจากเน็ตก่อนเสมอ เพื่อเอาไฟล์ js ก้อนล่าสุด)
  // ถ้าเน็ตล่มค่อยกลับไปงัดเอาของเก่าจาก Cache (Offline mode fallback)
  event.respondWith(
    fetch(event.request)
      .then((networkResponse) => {
        // ดึงสำเร็จ เอาไปจดลงแคชไว้เพื่อเตรียมความพร้อมสำหรับตอนเน็ตล่ม
        if (networkResponse && networkResponse.status === 200 && networkResponse.type === 'basic') {
          const responseToCache = networkResponse.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(event.request, responseToCache);
          });
        }
        return networkResponse;
      })
      .catch(() => {
        // เน็ตพัง หรือหาไฟล์ไม่เจอ ให้พยายามดึงจากแคชแก้ขัด
        return caches.match(event.request);
      })
  );
});
