// The simulated lab used to be served from the root of the site, with this service worker
// scoped to the whole site (it serves pages cache-first). The lab now lives in simspace/, with
// its own worker. This replacement unregisters the old one for returning visitors and reloads
// their open pages from the network.
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (e) => {
  e.waitUntil(
    self.registration
      .unregister()
      .then(() => self.clients.matchAll({ type: "window" }))
      .then((clients) => clients.forEach((c) => c.navigate(c.url)))
  );
});
