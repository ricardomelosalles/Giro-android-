/* GIRO – service worker (funcionamento offline).
   Estratégia: tudo do próprio app é guardado no aparelho; abre mesmo sem internet.
   Ao publicar uma nova versão, mude VERSAO aqui e em js/app.js. */
const VERSAO = '0.2.0';
const CACHE = 'giro-v' + VERSAO;
const ARQUIVOS = [
  './',
  'index.html',
  'manifest.webmanifest',
  'css/giro.css',
  'js/app.js',
  'img/logo-giro.png',
  'icons/favicon.png',
  'icons/apple-touch-icon.png',
  'icons/icon-192.png',
  'icons/icon-512.png',
  'icons/icon-maskable-512.png'
];

self.addEventListener('install', evento => {
  evento.waitUntil(
    caches.open(CACHE).then(c => c.addAll(ARQUIVOS.map(u => new Request(u, { cache: 'reload' }))))
  );
});

self.addEventListener('activate', evento => {
  evento.waitUntil((async () => {
    const nomes = await caches.keys();
    await Promise.all(nomes.filter(n => n.startsWith('giro-') && n !== CACHE).map(n => caches.delete(n)));
    await self.clients.claim();
  })());
});

self.addEventListener('message', evento => {
  if (evento.data === 'PULAR_ESPERA') self.skipWaiting();
});

self.addEventListener('fetch', evento => {
  const req = evento.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  evento.respondWith((async () => {
    const cache = await caches.open(CACHE);
    const guardado = await cache.match(req, { ignoreSearch: true });
    // Atualiza em segundo plano quando houver internet; o usuário sempre recebe a cópia local primeiro.
    const rede = fetch(req).then(resp => {
      if (resp && resp.ok) cache.put(req, resp.clone());
      return resp;
    }).catch(() => null);

    if (guardado) { evento.waitUntil(rede); return guardado; }
    const resp = await rede;
    if (resp) return resp;
    if (req.mode === 'navigate') {
      const inicio = await cache.match('index.html');
      if (inicio) return inicio;
    }
    return new Response('Sem conexão e arquivo não guardado.', { status: 503, headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
  })());
});
