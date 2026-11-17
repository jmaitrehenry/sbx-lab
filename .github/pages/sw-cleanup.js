
// Appended by pages.yaml to the Simspace runtime's sw.js, at the root of the site and in simspace/,
// followed by a line with the deployed commit, so every deploy installs a new worker.
// The runtime's worker serves pages, scripts and stylesheets cache-first and never refreshes them,
// so without this, returning visitors would keep the version of the site they first saw (and, at
// the root, the simulated lab that was served there before). On activation, drop what is cached
// for this worker's scope, except simspace/ when this is the root's worker (simspace/ has its own).
// Only this site's paths: other Pages sites share the origin and its caches.
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
