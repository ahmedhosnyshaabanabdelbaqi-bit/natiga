/* The build replaces these two values using only approved public shell files. */
const BUILD_VERSION = "__OFFLINE_VERSION__";
const PRECACHE_URLS = /* __OFFLINE_PRECACHE__ */ [];
const CACHE_PREFIX = "qasr-nicu-shell-";
const CACHE_NAME = CACHE_PREFIX + BUILD_VERSION;
const SHELL_URL = "/index.html";
const ALLOWED_URLS = new Set(PRECACHE_URLS);
const PRIVATE_PATH = /^\/(?:api|auth|login|logout|print|attachments|uploads|downloads|iclock)(?:\/|$)/i;

function validStaticResponse(url, response) {
  if (!response.ok || response.redirected || response.type === "opaque") return false;
  const type = response.headers.get("content-type") || "";
  if (url === SHELL_URL) return type.includes("text/html");
  if (url.endsWith(".js")) return /(?:java|ecma)script/i.test(type);
  if (url.endsWith(".css")) return type.includes("text/css");
  if (url.endsWith(".webmanifest")) return /json/i.test(type);
  if (url.endsWith(".svg")) return type.includes("image/svg+xml");
  return /^(?:image\/|font\/|application\/(?:font|octet-stream))/i.test(type);
}

self.addEventListener("install", (event) => {
  if (BUILD_VERSION === "__OFFLINE_VERSION__" || !PRECACHE_URLS.length) return;
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE_NAME);
    try {
      await Promise.all(PRECACHE_URLS.map(async (url) => {
        const response = await fetch(new Request(url, {cache: "reload", credentials: "omit"}));
        if (!validStaticResponse(url, response)) throw new Error("Offline shell asset unavailable: " + url);
        await cache.put(url, response);
      }));
      await self.skipWaiting();
    } catch (error) {
      await caches.delete(CACHE_NAME);
      throw error;
    }
  })());
});

self.addEventListener("activate", (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter((key) => key.startsWith(CACHE_PREFIX) && key !== CACHE_NAME).map((key) => caches.delete(key)));
    await self.clients.claim();
  })());
});

async function shellNavigation(request) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 3000);
  try {
    const response = await fetch(request, {signal: controller.signal, cache: "no-store"});
    if (!response.ok) throw new Error("Application server unavailable");
    // Never persist navigation responses: only the cookie-free build shell is cached.
    return response;
  } catch {
    const cache = await caches.open(CACHE_NAME);
    const shell = await cache.match(SHELL_URL);
    if (shell) return shell;
    return new Response("<!doctype html><html lang=ar dir=rtl><meta charset=utf-8><meta name=viewport content='width=device-width,initial-scale=1'><title>قصر المعادي | Offline</title><body style='font-family:system-ui;padding:2rem;line-height:2'><h1>تعذّر الاتصال بالخادم</h1><p>افتح النظام مرة واحدة أثناء الاتصال لتنزيل واجهة المساعدة. لا تتوفر سجلات المرضى دون الخادم.</p><p lang=en dir=ltr>The server is unavailable. Open the application online once to download the help interface. Patient records are not available offline.</p><button onclick='location.reload()'>إعادة المحاولة / Retry</button></body></html>", {status: 503, headers: {"Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store"}});
  } finally {
    clearTimeout(timeout);
  }
}

async function staticAsset(request, url) {
  const cache = await caches.open(CACHE_NAME);
  const cached = await cache.match(url);
  if (cached) return cached;
  const response = await fetch(request);
  if (validStaticResponse(url, response)) await cache.put(url, response.clone());
  return response;
}

self.addEventListener("fetch", (event) => {
  const request = event.request;
  const url = new URL(request.url);
  // API, authentication, clinical documents, writes, cross-origin URLs and all
  // unlisted resources pass straight through. They can never receive a shell fallback.
  if (request.method !== "GET" || url.origin !== self.location.origin || PRIVATE_PATH.test(url.pathname)) return;
  if (request.mode === "navigate" && ["/", SHELL_URL].includes(url.pathname)) {
    event.respondWith(shellNavigation(request));
    return;
  }
  if (!url.search && ALLOWED_URLS.has(url.pathname) && url.pathname !== SHELL_URL) {
    event.respondWith(staticAsset(request, url.pathname));
  }
});
