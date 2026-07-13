/** VALLE PWA — funcionamento offline + sincronização ao reconectar */
const CACHE = 'valle-receive-mobile-footer-20260713-v1';
const APP_SHELL = [
  './','./index.html','./manifest.json','./favicon.ico',
  './vendor/bootstrap/bootstrap.min.css','./vendor/bootstrap/bootstrap.bundle.min.js',
  './vendor/bootstrap-icons/bootstrap-icons.min.css','./css/app.css?v=20260713-receive-mobile-footer-v1',
  './js/app.js?v=20260713-taxas-cliente-v1','./js/auth-ui.js?v=20260713-taxas-cliente-v1','./js/bootstrap-enhance.js?v=20260712-standard-v4',
  './js/supabase-config.js','./js/supabase-client.js?v=20260712-offline2',
  './js/pdf.js','./js/whatsapp.js','./js/clientes.js','./js/historico.js',
  './js/dashboard.js','./js/backup.js','./js/storage.js','./js/util.js',
  './icons/icon-valle.png','./icons/favicon-32x32.png','./icons/favicon-16x16.png',
  './icons/android-chrome-192x192.png','./icons/android-chrome-512x512.png','./icons/apple-touch-icon.png'
];

self.addEventListener('install', event => {
  self.skipWaiting();
  event.waitUntil((async()=>{
    const cache = await caches.open(CACHE);
    // addAll é atômico; usamos chamadas individuais para um arquivo opcional não
    // impedir o cache dos demais.
    await Promise.all(APP_SHELL.map(async url=>{
      try { await cache.add(url); } catch (_) {}
    }));
  })());
});

self.addEventListener('activate', event => {
  event.waitUntil((async()=>{
    const keys = await caches.keys();
    await Promise.all(keys.filter(k=>k!==CACHE).map(k=>caches.delete(k)));
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', event => {
  const request = event.request;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);

  // Navegações: tenta internet e usa index.html quando offline.
  if (request.mode === 'navigate') {
    event.respondWith((async()=>{
      try {
        const response = await fetch(request);
        const cache = await caches.open(CACHE);
        cache.put('./index.html', response.clone()).catch(()=>{});
        return response;
      } catch (_) {
        return (await caches.match(request)) || (await caches.match('./index.html'));
      }
    })());
    return;
  }

  // Arquivos do app e bibliotecas CDN: cache primeiro para abertura imediata;
  // em paralelo, atualiza o cache quando houver internet.
  event.respondWith((async()=>{
    const cached = await caches.match(request);
    const networkPromise = fetch(request).then(async response=>{
      if (response && (response.ok || response.type === 'opaque')) {
        const cache = await caches.open(CACHE);
        cache.put(request, response.clone()).catch(()=>{});
      }
      return response;
    }).catch(()=>null);
    return cached || (await networkPromise) || new Response('', {status:504, statusText:'Offline'});
  })());
});
