const CACHE_NAME = "surfclub-cache-v4";

// const APP_FILES = [
//   "./",
//   "./index.html",
//   ".css/style.css",
// //   "./script.js",
//   "./manifest.webmanifest",
//   "./icons/icon-192.png",
//   "./icons/icon-512.png",
//   "./icons/icon-512-maskable.png"
// ];
const APP_FILES = [
  "./",
  "./index.html",
  "./manifest.webmanifest",

  "./css/style.css",
  "./js/main.js",

  "./icons/icon-192.png",
  "./icons/icon-512.png"
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(async (cache) => {
      for (const file of APP_FILES) {
        try {
          await cache.add(file);
          console.log("快取成功：", file);
        } catch (error) {
          console.error("快取失敗：", file, error);
          throw error;
        }
      }

      await self.skipWaiting();
    })
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames
          .filter((name) => name !== CACHE_NAME)
          .map((name) => caches.delete(name))
      );
    }).then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") {
    return;
  }

  event.respondWith(
    fetch(event.request).catch(() => {
      return caches.match(event.request);
    })
  );
});