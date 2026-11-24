/* ARROZ EN CAJA ADMIN · service worker.
   Guarda solo la estructura de la app (HTML, CSS, JS, logo, iconos) para que abra rápido y avise de que no hay conexión.
   NUNCA guarda pedidos, inventario, disponibilidad ni mensajes: eso se pide siempre al servidor (cache: 'no-store'),
   así que una copia antigua no puede mostrarse como si fuera la actual. */
const VERSION = 'aec-admin-v8';
const SHELL = ['admin.html', 'styles.css', 'app.js', 'art.js', 'panel/panel.js', 'panel/panel.css', 'data/site.json', 'data/menu.json', 'img/logo.png', 'icons/icon-192.png', 'manifest.webmanifest'];
const LIVE = /\/(wp-json|administracion\/api|api|_blob)\//;

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(VERSION).then((c) => Promise.all(SHELL.map((u) => c.add(new Request(u, { cache: 'reload' })).catch(() => { /* un fallo no cancela la instalación */ })))));
});
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k.startsWith('aec-admin-') && k !== VERSION).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('message', (e) => { if (e.data === 'SKIP_WAITING') self.skipWaiting(); });

const withTimeout = (p, ms) => new Promise((res, rej) => { const t = setTimeout(() => rej(new Error('timeout')), ms); p.then((r) => { clearTimeout(t); res(r); }, (er) => { clearTimeout(t); rej(er); }); });
async function networkFirst(req) {
  const c = await caches.open(VERSION);
  try { const r = await withTimeout(fetch(req), 4000); if (r && r.ok) c.put(req, r.clone()); return r; }
  catch (err) { const hit = await c.match(req, { ignoreSearch: true }); if (hit) return hit; if (req.mode === 'navigate') { const shell = await c.match('admin.html'); if (shell) return shell; } throw err; }
}
async function staleWhileRevalidate(req) {
  const c = await caches.open(VERSION), hit = await c.match(req);
  const net = fetch(req).then((r) => { if (r && r.ok) c.put(req, r.clone()); return r; }).catch(() => hit);
  return hit || net;
}
self.addEventListener('fetch', (e) => {
  const req = e.request, u = new URL(req.url);
  if (req.method !== 'GET' || u.origin !== self.location.origin) return;
  if (LIVE.test(u.pathname)) { e.respondWith(fetch(req, { cache: 'no-store' })); return; }
  if (u.pathname.endsWith('/sw.js')) return;
  if (/\.(png|jpe?g|webp|avif|svg|gif|woff2?)$/i.test(u.pathname)) { e.respondWith(staleWhileRevalidate(req)); return; }
  e.respondWith(networkFirst(req));
});
