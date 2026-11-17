
// Appended by pages.yaml to the runtime's sw.js at the root of the site. Until now the root served
// the simulated lab, and this worker serves pages cache-first, so returning visitors would keep
// getting its cached page. On activation, drop what is cached for this scope, except simspace/
// (whose own worker manages it). Only this site's paths: other Pages sites share the origin.
self.addEventListener("activate", (e) => {
  const scope = new URL(self.registration.scope).pathname;
  const simspace = new URL("simspace/", self.registration.scope).pathname;
  e.waitUntil(
    caches.keys().then((names) =>
      Promise.all(
        names.map(async (name) => {
          const cache = await caches.open(name);
          for (const req of await cache.keys()) {
            const path = new URL(req.url).pathname;
            if (path.startsWith(scope) && !path.startsWith(simspace)) await cache.delete(req);
          }
        }),
      ),
    ),
  );
});
