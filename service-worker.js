// 配信ファイルを更新したときは、このバージョンも更新する。
const CACHE_NAME = "cit-attendance-2026-fall-v6";
const APP_FILES = ["./", "./index.html", "./styles.css", "./timetable.js", "./app.js", "./manifest.webmanifest",
    "./icon-192.png", "./icon-512.png", "./icon-512-maskable.png", "./apple-touch-icon.png", "./app-icon.png",
    "./assets/autumn-campus-768.webp", "./assets/autumn-campus-1536.webp"];
const APP_URLS = new Set(APP_FILES.map(path => new URL(path, self.location).href));

self.addEventListener("install", event => {
    event.waitUntil(caches.open(CACHE_NAME).then(cache => cache.addAll(APP_FILES)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", event => {
    event.waitUntil(caches.keys().then(keys => Promise.all(keys
        .filter(key => key.startsWith("cit-attendance-") && key !== CACHE_NAME)
        .map(key => caches.delete(key)))).then(() => self.clients.claim()));
});

self.addEventListener("fetch", event => {
    const url = new URL(event.request.url);
    // 画面切り替えの #home / #timetable / #settings は同じHTMLを使う。
    url.hash = "";
    const cacheKey = url.href;
    if (event.request.method !== "GET" || !APP_URLS.has(cacheKey)) return;
    // オンラインでは最新ファイルを優先し、オフライン時だけキャッシュを使う。
    event.respondWith(fetch(event.request).then(response => {
        if (response.ok) {
            const copy = response.clone();
            event.waitUntil(caches.open(CACHE_NAME).then(cache => cache.put(cacheKey, copy)));
        }
        return response;
    }).catch(() => caches.match(cacheKey)));
});

self.addEventListener("notificationclick", event => {
    event.notification.close();
    const appUrl = new URL("./index.html", self.location).href;
    event.waitUntil(self.clients.matchAll({ type: "window", includeUncontrolled: true }).then(clients => {
        const app = clients.find(client => {
            const url = new URL(client.url);
            url.hash = "";
            return url.href === appUrl || url.href === new URL("./", self.location).href;
        });
        return app ? app.focus() : self.clients.openWindow(appUrl);
    }));
});
