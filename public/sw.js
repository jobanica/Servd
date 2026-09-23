/* Servd offline shell (Phase 0).
 *
 * Conservative on purpose:
 *  - Navigations (GET documents): NETWORK-FIRST, fall back to a cached copy so a
 *    previously-opened /cashier or /kitchen still loads during a dropout. A page
 *    that was never cached gets /offline.html — never a different cached page,
 *    which made a sign-in attempt look like it had worked.
 *  - Static assets (/_next/static, images): stale-while-revalidate.
 *  - Everything else (POST / server actions / API): passthrough, never cached —
 *    the app's own offline queue handles writes.
 */
// Bumped to v6 to drop any page cached before the checks below existed — a
// till or Orders screen whose stored copy is really a login page.
const VERSION = "servd-v6";
const PAGES = `${VERSION}-pages`;
const ASSETS = `${VERSION}-assets`;
const OFFLINE_PAGE = "/offline.html";

// Precached at install, because it is the one page that has to be there when
// the network isn't. Everything else gets cached by being visited.
self.addEventListener("install", (event) => {
  event.waitUntil(
    (async () => {
      try {
        const cache = await caches.open(PAGES);
        await cache.add(new Request(OFFLINE_PAGE, { cache: "reload" }));
      } catch {
        /* an install must not fail over this; the fetch handler copes without it */
      }
      await self.skipWaiting();
    })(),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(keys.filter((k) => !k.startsWith(VERSION)).map((k) => caches.delete(k)));
      await self.clients.claim();
      await warmOpenPages();
    })(),
  );
});

/**
 * Cache the screens that are already open the moment we take control.
 *
 * A worker is registered BY the page it protects, so that first load was
 * fetched before this worker existed and never went through the fetch handler
 * — the till a cashier opened at the start of their shift was not in the cache
 * at all. The connection would then drop and there was nothing to fall back
 * to, which looked like "Back to the till does nothing".
 *
 * Keyed by pathname, because a later plain /cashier navigation must match what
 * was stored even if the open tab carried a query string.
 */
async function warmOpenPages() {
  try {
    const cache = await caches.open(PAGES);
    const windows = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
    const paths = new Set();
    for (const c of windows) {
      try {
        const u = new URL(c.url);
        if (u.origin === self.location.origin) paths.add(u.pathname);
      } catch {
        /* skip anything unparseable */
      }
    }
    await Promise.all(
      [...paths].map(async (path) => {
        try {
          const req = new Request(path, { cache: "reload" });
          const res = await fetch(req);
          // Same rule as the fetch handler: never store the login screen under
          // the till's or the Orders screen's own address.
          if (res.ok && !res.redirected) await cache.put(req, res);
        } catch {
          /* one page failing to warm must not stop the others */
        }
      }),
    );
  } catch {
    /* warming is an optimisation; never fail activation over it */
  }
}

self.addEventListener("message", (event) => {
  if (event.data === "skipWaiting") self.skipWaiting();
});

// --- Web Push. Two audiences now: merchants being told about a new online
//     order, and a diner being told their rider is at the door. Payload:
//     { title, body, url, tag }. The tag is what keeps a talkative rider from
//     stacking up five notifications instead of replacing one. ---
self.addEventListener("push", (event) => {
  let data = {};
  try { data = event.data ? event.data.json() : {}; } catch { data = {}; }
  const title = data.title || "New online order 🛎️";
  event.waitUntil(
    self.registration.showNotification(title, {
      body: data.body || "You have a new order.",
      icon: "/brand/icon-192.png",
      badge: "/brand/icon-192.png",
      tag: data.tag || "servd-order", // collapse duplicates
      renotify: true,
      requireInteraction: true, // stays until tapped
      vibrate: [200, 100, 200, 100, 200],
      data: { url: data.url || "/merchant" },
    }),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = (event.notification.data && event.notification.data.url) || "/merchant";
  event.waitUntil(
    (async () => {
      // Focus the tab that is already showing this page rather than opening a
      // second one — a diner tapping "your rider is outside" wants the tracker
      // they left open, not a fresh copy of it.
      const path = (() => { try { return new URL(url, self.location.origin).pathname; } catch { return url; } })();
      const all = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
      const existing = all.find((c) => c.url.includes(path));
      if (existing) return existing.focus();
      return self.clients.openWindow(url);
    })(),
  );
});

function isAsset(url) {
  return url.pathname.startsWith("/_next/static/") || url.pathname.startsWith("/brand/") || /\.(?:png|svg|jpg|jpeg|webp|ico|woff2?)$/.test(url.pathname);
}

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return; // never touch writes / server actions
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  // App-shell navigations: network-first, cache fallback.
  if (req.mode === "navigate") {
    event.respondWith(
      (async () => {
        try {
          const fresh = await fetch(req);
          // Only store a page that IS the page. A request made with a lapsed
          // session is answered with the login screen, and storing that under
          // /merchant means the next time the tablet opens its Orders app
          // offline it is handed a sign-in form — the app looking signed out
          // when the session is fine. A redirected response can't be replayed
          // for a navigation anyway: returning one later throws and the
          // navigation fails outright.
          if (fresh.ok && !fresh.redirected) {
            const cache = await caches.open(PAGES);
            cache.put(req, fresh.clone());
          }
          return fresh;
        } catch {
          // The page itself if it was opened while online — that is what
          // offline mode is for.
          const cached = await caches.match(req);
          if (cached) return cached;
          // Otherwise say so. This used to serve the cached till for ANY
          // uncached page, so asking to sign in handed back a screen that
          // looked live, wasn't, and would never save anything.
          const offline = await caches.match(OFFLINE_PAGE);
          return offline || Response.error();
        }
      })(),
    );
    return;
  }

  // Static assets: stale-while-revalidate.
  if (isAsset(url)) {
    event.respondWith(
      (async () => {
        const cache = await caches.open(ASSETS);
        const cached = await cache.match(req);
        const network = fetch(req)
          .then((res) => {
            if (res.ok) cache.put(req, res.clone());
            return res;
          })
          .catch(() => cached);
        return cached || network;
      })(),
    );
  }
});
