/** VALLE PWA — atualização automática no celular + suporte offline */
const CACHE = 'valle-auto-update-20260722-v46-theme-harmonized';
const APP_SHELL = [
  './', './index.html', './manifest.json', './favicon.ico',
  './vendor/bootstrap/bootstrap.min.css', './vendor/bootstrap/bootstrap.bundle.min.js',
  './vendor/bootstrap-icons/bootstrap-icons.min.css', './css/app.css',
  './js/app.js', './js/auth-ui.js', './js/bootstrap-enhance.js',
  './js/supabase-config.js', './js/supabase-client.js',
  './js/pdf.js', './js/whatsapp.js', './js/clientes.js', './js/historico.js',
  './js/dashboard.js', './js/backup.js', './js/storage.js', './js/util.js', './js/push-notifications.js',
  './icons/icon-valle.png', './icons/dashboard-icon.png', './icons/favicon-48x48.png', './icons/favicon-32x32.png', './icons/favicon-16x16.png',
  './icons/android-chrome-192x192.png', './icons/android-chrome-512x512.png',
  './icons/apple-touch-icon.png'
];

self.addEventListener('install', event => {
  self.skipWaiting();
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    await Promise.all(APP_SHELL.map(async url => {
      try {
        // Ignora o cache HTTP para gravar no PWA a versão publicada mais recente.
        const response = await fetch(url, { cache: 'reload' });
        if (response.ok || response.type === 'opaque') {
          await cache.put(url, response);
        }
      } catch (_) {
        // Um arquivo opcional não deve impedir a instalação do restante do app.
      }
    }));
  })());
});

self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter(key => key !== CACHE).map(key => caches.delete(key)));
    await self.clients.claim();
  })());
});

self.addEventListener('message', event => {
  if (event.data && event.data.type === 'SKIP_WAITING') self.skipWaiting();
});

self.addEventListener('fetch', event => {
  const request = event.request;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  const sameOrigin = url.origin === self.location.origin;

  // HTML/navegação: internet primeiro, cache apenas quando estiver offline.
  if (request.mode === 'navigate') {
    event.respondWith((async () => {
      try {
        const response = await fetch(request, { cache: 'no-store' });
        const cache = await caches.open(CACHE);
        await cache.put('./index.html', response.clone());
        return response;
      } catch (_) {
        return (await caches.match(request)) ||
               (await caches.match('./index.html')) ||
               new Response('Aplicativo indisponível offline.', { status: 503 });
      }
    })());
    return;
  }

  // Arquivos locais estáticos: abre imediatamente pelo cache e atualiza em
  // segundo plano. A troca de versão do Service Worker continua garantindo
  // que CSS, JavaScript e imagens novos substituam os antigos.
  if (sameOrigin) {
    event.respondWith((async () => {
      const cached = await caches.match(request, { ignoreSearch: true });
      const network = fetch(request, { cache: 'no-cache' }).then(async response => {
        if (response && response.ok) {
          const cache = await caches.open(CACHE);
          await cache.put(request, response.clone());
        }
        return response;
      }).catch(() => null);
      return cached || (await network) ||
             new Response('', { status: 504, statusText: 'Offline' });
    })());
    return;
  }

  // Recursos externos: cache primeiro e atualização em segundo plano.
  event.respondWith((async () => {
    const cached = await caches.match(request);
    const network = fetch(request).then(async response => {
      if (response && (response.ok || response.type === 'opaque')) {
        const cache = await caches.open(CACHE);
        await cache.put(request, response.clone());
      }
      return response;
    }).catch(() => null);
    return cached || (await network) || new Response('', { status: 504, statusText: 'Offline' });
  })());
});


// Recebe mensagens Web Push mesmo quando o VALLE está fechado.
self.addEventListener('push', event => {
  let payload = {};
  try { payload = event.data ? event.data.json() : {}; } catch (_) { payload = { body: event.data?.text?.() || '' }; }
  const title = payload.title || 'VALLE — vale vencido';
  const options = {
    body: payload.body || 'Existe um vale que precisa da sua atenção.',
    icon: payload.icon || './icons/android-chrome-192x192.png',
    badge: payload.badge || './icons/favicon-48x48.png',
    tag: payload.tag || 'valle-vencimento',
    renotify: true,
    requireInteraction: true,
    vibrate: [250, 100, 250],
    data: { url: payload.url || './index.html#notificacoes', ...(payload.data || {}) }
  };
  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener('notificationclick', event => {
  event.notification.close();
  const target = new URL(event.notification.data?.url || './index.html#notificacoes', self.location.origin).href;
  event.waitUntil((async () => {
    const windows = await clients.matchAll({ type: 'window', includeUncontrolled: true });
    for (const client of windows) {
      if (new URL(client.url).origin === self.location.origin) {
        await client.focus();
        if ('navigate' in client) await client.navigate(target);
        return;
      }
    }
    if (clients.openWindow) await clients.openWindow(target);
  })());
});
