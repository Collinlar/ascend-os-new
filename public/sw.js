// Ascend POS service worker. Without this the terminal only survives a
// network drop while the tab stays open; with it, a cashier can cold-start
// the till on a dead network and keep selling (POS PRD §17.2).

// Bumped deliberately: the activate handler deletes every cache that is not
// this one, so raising the version is what evicts the bad caches described
// below from browsers already carrying them.
const SHELL_CACHE = "ascend-pos-shell-v3";

// This worker registers from the till, but a worker served from /sw.js
// controls the whole origin. So visiting the till once puts it in charge of
// the dashboard too, and its rules have to be safe for both.
//
// In development Next reuses chunk paths across rebuilds, so caching them
// first pins stale JavaScript in the browser forever: the dashboard then
// runs old client code against a new server and every action fails with a
// message about the network. Production chunk names carry a content hash,
// where cache-first is both safe and the point.
const IS_DEV =
  self.location.hostname === "localhost" ||
  self.location.hostname === "127.0.0.1" ||
  self.location.hostname.endsWith(".local");
const SHELL_URLS = ["/pos", "/offline"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(SHELL_CACHE)
      .then((cache) => cache.addAll(SHELL_URLS))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(keys.filter((k) => k !== SHELL_CACHE).map((k) => caches.delete(k)))
      )
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  // Never cache the sync endpoint or any API call: stale business data on a
  // till is worse than no data.
  if (url.pathname.startsWith("/api/")) return;

  // Navigations.
  //
  // This worker exists so a till cold-starts on a dead network. It has no
  // business governing the dashboard, which it nonetheless controls because
  // a worker served from /sw.js claims the whole origin. So it handles the
  // till and the offline page and gets out of the way everywhere else.
  //
  // The previous fallback chain ended at /pos for every failed navigation,
  // which meant a merchant tapping Products on a weak connection was
  // silently dropped into the till with no explanation.
  if (request.mode === "navigate") {
    const isTill = url.pathname === "/pos" || url.pathname.startsWith("/pos/");

    if (!isTill) {
      // Let the browser do what it always does, including showing its own
      // error, which is at least honest about what happened.
      return;
    }

    event.respondWith(
      fetch(request)
        .then((response) => {
          const copy = response.clone();
          caches.open(SHELL_CACHE).then((cache) => cache.put(request, copy));
          return response;
        })
        .catch(() =>
          caches
            .match(request)
            .then((cached) => cached || caches.match("/pos") || caches.match("/offline"))
        )
    );
    return;
  }

  // Build assets are content-hashed, so cache-first is safe and fast. Never
  // in development, where the names are reused.
  if (!IS_DEV && url.pathname.startsWith("/_next/static/")) {
    event.respondWith(
      caches.match(request).then(
        (cached) =>
          cached ||
          fetch(request).then((response) => {
            const copy = response.clone();
            caches.open(SHELL_CACHE).then((cache) => cache.put(request, copy));
            return response;
          })
      )
    );
  }
});
