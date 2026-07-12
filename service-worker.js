/** SERVICE WORKER DO PWA - cache atualizado */
const CACHE = 'valle-v35-user-menu-theme-20260711-iphone-safearea-v2';
const FILES=['./','./index.html','./css/style.css?v=20260711-4','./css/dark.css','./css/print.css','./js/app.js?v=20260711-session1','./js/pdf.js','./js/whatsapp.js','./js/clientes.js','./js/historico.js','./js/dashboard.js','./js/backup.js','./js/storage.js','./js/util.js','./manifest.json','./icons/icon-valle.png','./icons/favicon-32x32.png','./icons/favicon-16x16.png','./icons/android-chrome-192x192.png','./icons/android-chrome-512x512.png','./icons/apple-touch-icon.png','./favicon.ico'];
self.addEventListener('install',e=>{self.skipWaiting();e.waitUntil(caches.open(CACHE).then(c=>c.addAll(FILES).catch(()=>{})))});
self.addEventListener('activate',e=>{e.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k!==CACHE).map(k=>caches.delete(k)))).then(()=>self.clients.claim()))});
self.addEventListener('fetch',e=>{
  if(e.request.method!=='GET') return;
  e.respondWith(fetch(e.request).then(r=>{const copy=r.clone();caches.open(CACHE).then(c=>c.put(e.request,copy));return r;}).catch(()=>caches.match(e.request)));
});

// cache bump logo-fix
