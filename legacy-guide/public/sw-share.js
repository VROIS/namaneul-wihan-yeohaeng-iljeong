// sw-share.js - 공유 페이지용 Service Worker
// v11 - Network First 전략 + 캐시 삭제 범위 수정
const CACHE_NAME = 'share-cache-v11';

self.addEventListener('install', event => {
  self.skipWaiting();
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys => {
      return Promise.all(
        keys.filter(key => key !== CACHE_NAME && key.startsWith('share-cache-'))
          .map(key => {
            return caches.delete(key);
          })
      );
    })
  );
  return self.clients.claim();
});

self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);
  
  // 공유 페이지 (/s/*) - Network First 전략
  // 온라인: 항상 서버에서 최신 가져옴
  // 오프라인: 캐시된 버전 사용
  if (url.pathname.startsWith('/s/')) {
    event.respondWith(
      fetch(event.request)
        .then(response => {
          // 성공하면 캐시 업데이트
          if (response && response.status === 200) {
            const responseClone = response.clone();
            caches.open(CACHE_NAME).then(cache => {
              cache.put(event.request, responseClone);
            });
          }
          return response;
        })
        .catch(() => {
          return caches.match(event.request);
        })
    );
    return;
  }
  
  // 기타 요청은 네트워크 우선
  event.respondWith(fetch(event.request));
});
