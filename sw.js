const CACHE_NAME = "member-system-v1";

const APP_FILES = [
  "./",
  "./index.html",
  ".css/style.css",
  "./script.js",
  "./manifest.webmanifest",
  "./icons/icon-192.png",
  "./icons/icon-512.png",
  "./icons/icon-512-maskable.png"
];

/*
 * 安裝 Service Worker
 * 將網站的核心檔案加入快取
 */
self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => cache.addAll(APP_FILES))
      .then(() => self.skipWaiting())
  );
});

/*
 * 啟用新版 Service Worker
 * 刪除舊版本快取
 */
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys()
      .then((cacheNames) => {
        return Promise.all(
          cacheNames
            .filter((name) => name !== CACHE_NAME)
            .map((name) => caches.delete(name))
        );
      })
      .then(() => self.clients.claim())
  );
});

/*
 * 優先從網路取得最新版；
 * 網路失敗時使用快取
 */
self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") {
    return;
  }

  event.respondWith(
    fetch(event.request)
      .then((response) => {
        const responseCopy = response.clone();

        caches.open(CACHE_NAME)
          .then((cache) => {
            cache.put(event.request, responseCopy);
          });

        return response;
      })
      .catch(() => {
        return caches.match(event.request);
      })
  );
});