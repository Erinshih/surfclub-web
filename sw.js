// // const CACHE_NAME = "surfclub-cache-v4";

// // const APP_FILES = [
// //   "./",
// //   "./index.html",
// //   "./manifest.webmanifest",
// //   "./css/style.css"
// // ];

// const CACHE_NAME = "surfclub-cache-v10";

// const APP_FILES = [
//   "./",
//   "./index.html",
//   "./manifest.webmanifest",
//   "./css/style.css",

//   "./js/firebase-config.js",
//   "./js/auth-nav.js",
//   "./js/courses.js",
//   "./leaderboard.html",
//   "./member.html",
//   "./courses.html",
//   "./js/index.js",
//   "./pending.html",
//   "./register.html",
//   "./login.html",
//   "./js/login.js",

//   "./icons/icon-192-v2.png",
//   "./icons/icon-512-v2.png",
//   "./icons/apple-touch-icon.png"
// ];

// // const APP_FILES = [
// //   "./",
// //   "./index.html",
// //   "./login.html",
// //   "./member.html",
// //   "./leaderboard.html",
// //   "./css/style.css",
// //   "./js/firebase-config.js",
// //   "./js/leaderboard.js",
// //   "./manifest.webmanifest",
// //   "./icons/icon-192-v2.png",
// //   "./icons/icon-512-v2.png"
// // ];

// self.addEventListener("install", (event) => {
//   event.waitUntil(
//     caches.open(CACHE_NAME).then(async (cache) => {
//       for (const file of APP_FILES) {
//         try {
//           await cache.add(file);
//           console.log("快取成功：", file);
//         } catch (error) {
//           console.error("快取失敗：", file, error);
//           throw error;
//         }
//       }

//       await self.skipWaiting();
//     })
//   );
// });

// self.addEventListener("activate", (event) => {
//   event.waitUntil(
//     caches.keys().then((cacheNames) => {
//       return Promise.all(
//         cacheNames
//           .filter((name) => name !== CACHE_NAME)
//           .map((name) => caches.delete(name))
//       );
//     }).then(() => self.clients.claim())
//   );
// });

// self.addEventListener("fetch", (event) => {
//   if (event.request.method !== "GET") {
//     return;
//   }

//   event.respondWith(
//     fetch(event.request).catch(() => {
//       return caches.match(event.request);
//     })
//   );
// });

/* =========================================================
   Surf Club PWA Service Worker
   ========================================================= */

const CACHE_NAME = "surfclub-cache-v11";

/*
 * 這些檔案會在 Service Worker 安裝時預先快取。
 *
 * 即使其中一個檔案不存在，也不會讓整個
 * Service Worker 安裝失敗。
 */
const APP_FILES = [
  "./",
  "./index.html",
  "./manifest.webmanifest",
  "./css/style.css",

  "./leaderboard.html",
  "./member.html",
  "./courses.html",
  "./pending.html",
  "./register.html",
  "./login.html",

  "./js/firebase-config.js",
  "./js/auth-nav.js",
  "./js/courses.js",
  "./js/index.js",
  "./js/login.js",

  "./icons/icon-192-v2.png",
  "./icons/icon-512-v2.png",
  "./icons/apple-touch-icon.png"
];

/* =========================================================
   Install
   ========================================================= */

self.addEventListener("install", (event) => {
  console.log("[SW] 開始安裝：", CACHE_NAME);

  event.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE_NAME);

      /*
       * individually cache each file.
       *
       * 不使用 cache.addAll()，因為 addAll() 只要一個檔案
       * 失敗，就會讓整批安裝失敗。
       */
      const results = await Promise.allSettled(
        APP_FILES.map(async (file) => {
          try {
            await cache.add(file);
            console.log("[SW] 快取成功：", file);
          } catch (error) {
            console.warn("[SW] 快取失敗，略過：", file, error);
          }
        })
      );

      const successCount = results.filter(
        (result) => result.status === "fulfilled"
      ).length;

      const failedCount = results.filter(
        (result) => result.status === "rejected"
      ).length;

      console.log(
        `[SW] 預快取完成：成功 ${successCount}，失敗 ${failedCount}`
      );

      /*
       * 不等待舊 Service Worker 被所有頁面釋放，
       * 立即要求進入 activate 階段。
       */
      await self.skipWaiting();

      console.log("[SW] skipWaiting 已執行");
    })()
  );
});

/* =========================================================
   Activate
   ========================================================= */

self.addEventListener("activate", (event) => {
  console.log("[SW] 開始啟用：", CACHE_NAME);

  event.waitUntil(
    (async () => {
      const cacheNames = await caches.keys();

      /*
       * 刪除所有舊版 Surf Club Cache。
       */
      await Promise.all(
        cacheNames
          .filter((name) => {
            return (
              name.startsWith("surfclub-cache-") &&
              name !== CACHE_NAME
            );
          })
          .map(async (name) => {
            console.log("[SW] 刪除舊快取：", name);
            await caches.delete(name);
          })
      );

      /*
       * 新 Service Worker 啟用後，
       * 立即接管目前已開啟的頁面。
       */
      await self.clients.claim();

      console.log("[SW] 已啟用並接管頁面：", CACHE_NAME);
    })()
  );
});

/* =========================================================
   Fetch
   ========================================================= */

self.addEventListener("fetch", (event) => {
  const request = event.request;

  /*
   * 不攔截 POST、PUT、DELETE 等請求，
   * 避免干擾 Firebase Authentication / Firestore。
   */
  if (request.method !== "GET") {
    return;
  }

  const requestURL = new URL(request.url);

  /*
   * 只處理自己網站的資源。
   * Firebase、Google API、CDN 等跨網域請求交給瀏覽器處理。
   */
  if (requestURL.origin !== self.location.origin) {
    return;
  }

  /*
   * HTML 頁面使用 Network First。
   */
  if (request.mode === "navigate") {
    event.respondWith(handleNavigationRequest(request));
    return;
  }

  /*
   * manifest 和 icon 優先從網路取得，
   * 避免圖示更新後仍讀到舊快取。
   */
  if (
    requestURL.pathname.endsWith("manifest.webmanifest") ||
    requestURL.pathname.includes("/icons/")
  ) {
    event.respondWith(networkFirst(request));
    return;
  }

  /*
   * CSS、JavaScript 和其他同網域資源：
   * 優先使用網路，失敗時才使用快取。
   */
  event.respondWith(networkFirst(request));
});

/* =========================================================
   處理 HTML 導覽
   ========================================================= */

async function handleNavigationRequest(request) {
  try {
    const networkResponse = await fetch(request);

    if (isCacheable(networkResponse)) {
      const cache = await caches.open(CACHE_NAME);
      await cache.put(request, networkResponse.clone());
    }

    return networkResponse;
  } catch (error) {
    console.warn("[SW] 網頁連線失敗，嘗試讀取快取：", request.url);

    /*
     * 先找完全相同的頁面。
     */
    const cachedPage = await caches.match(request);

    if (cachedPage) {
      return cachedPage;
    }

    /*
     * 若指定頁面沒有快取，則使用首頁作為 fallback。
     */
    const fallbackPage =
      (await caches.match("./index.html")) ||
      (await caches.match("./"));

    if (fallbackPage) {
      return fallbackPage;
    }

    return new Response(
      `
      <!DOCTYPE html>
      <html lang="zh-Hant">
        <head>
          <meta charset="UTF-8">
          <meta
            name="viewport"
            content="width=device-width, initial-scale=1.0"
          >
          <title>無法連線</title>
        </head>

        <body>
          <main>
            <h1>目前無法連線</h1>
            <p>請確認網路連線後重新整理頁面。</p>
          </main>
        </body>
      </html>
      `,
      {
        status: 503,
        statusText: "Service Unavailable",
        headers: {
          "Content-Type": "text/html; charset=utf-8"
        }
      }
    );
  }
}

/* =========================================================
   Network First
   ========================================================= */

async function networkFirst(request) {
  try {
    /*
     * cache: "no-store"
     * 對 manifest 和 icon 特別有幫助，
     * 避免瀏覽器 HTTP Cache 回傳舊檔案。
     */
    const requestURL = new URL(request.url);

    const shouldBypassHttpCache =
      requestURL.pathname.endsWith("manifest.webmanifest") ||
      requestURL.pathname.includes("/icons/");

    const networkResponse = await fetch(
      request,
      shouldBypassHttpCache
        ? {
            cache: "no-store"
          }
        : undefined
    );

    if (isCacheable(networkResponse)) {
      const cache = await caches.open(CACHE_NAME);
      await cache.put(request, networkResponse.clone());
    }

    return networkResponse;
  } catch (error) {
    console.warn("[SW] 網路讀取失敗：", request.url);

    const cachedResponse = await caches.match(request);

    if (cachedResponse) {
      return cachedResponse;
    }

    return new Response("", {
      status: 504,
      statusText: "Gateway Timeout"
    });
  }
}

/* =========================================================
   判斷回應是否可以快取
   ========================================================= */

function isCacheable(response) {
  return (
    response &&
    response.ok &&
    (
      response.type === "basic" ||
      response.type === "cors"
    )
  );
}

/* =========================================================
   接收網頁傳來的更新指令
   ========================================================= */

self.addEventListener("message", (event) => {
  if (!event.data) {
    return;
  }

  /*
   * 網頁可以傳送：
   *
   * registration.waiting.postMessage({
   *   type: "SKIP_WAITING"
   * });
   */
  if (event.data.type === "SKIP_WAITING") {
    console.log("[SW] 收到 SKIP_WAITING 指令");

    event.waitUntil(self.skipWaiting());
  }

  /*
   * 用於開發測試：
   *
   * navigator.serviceWorker.controller.postMessage({
   *   type: "CLEAR_CACHE"
   * });
   */
  if (event.data.type === "CLEAR_CACHE") {
    console.log("[SW] 收到 CLEAR_CACHE 指令");

    event.waitUntil(
      caches.keys().then((cacheNames) => {
        return Promise.all(
          cacheNames
            .filter((name) => name.startsWith("surfclub-cache-"))
            .map((name) => caches.delete(name))
        );
      })
    );
  }
});