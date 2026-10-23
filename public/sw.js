const CACHE = "torob-shell-v1";
self.addEventListener("install", (e) => {
  e.waitUntil(
    fetch("/sw-assets.json")
      .then((r) => r.json())
      .then((files) =>
        caches
          .open(CACHE)
          .then((c) =>
            c.addAll(["/", "/index.html", ...files.map((f) => "/" + f)]),
          ),
      ),
  );
  self.skipWaiting();
});
self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)),
        ),
      )
      .then(() => self.clients.claim()),
  );
});
self.addEventListener("fetch", (e) => {
  const u = new URL(e.request.url);
  if (
    e.request.method !== "GET" ||
    u.origin !== location.origin ||
    u.pathname.startsWith("/api/")
  )
    return;
  e.respondWith(
    fetch(e.request)
      .then((r) => {
        if (r.ok) {
          const copy = r.clone();
          caches.open(CACHE).then((c) => c.put(e.request, copy));
        }
        return r;
      })
      .catch(async () => {
        const c = await caches.open(CACHE);
        return (
          (await c.match(e.request, { ignoreVary: true })) ||
          (e.request.mode === "navigate" ? await c.match("/") : null) ||
          Response.error()
        );
      }),
  );
});
