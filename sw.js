/* Service Worker pour La Colline Gambetta — Mise en cache intelligente et performances instantanées */
const CACHE_NAME = 'lcg-cache-v2026092401';

const STATIC_ASSETS = [
  './',
  './index.html',
  './reservation.html',
  './assets/css/main.css?v=2026092401',
  './assets/css/reservation.css?v=2026092401',
  './assets/js/i18n.js?v=202609231200',
  './assets/js/reservation-config.js?v=202609231700',
  './assets/js/firebase-config.js?v=202609231700',
  './assets/js/reservation-firebase.js?v=202609231700',
  './Logo_LaColline_Gambetta.webp',
  './medallion-facade.webp',
  './favicon.png',
  './assets/menus/icon-complete.png',
  './assets/menus/icon-duo.png',
  './assets/menus/icon-enfant.png',
  './assets/menus/icon-pdj.png',
  './assets/menus/medal-dessert.png',
  './assets/menus/medal-entree.png',
  './assets/menus/medal-plat.png',
  './assets/menus/motif-80a.png',
  './assets/menus/star.png'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(STATIC_ASSETS);
    }).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))
      );
    }).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // Ne pas intercepter les requêtes API / Webhooks (Google Apps Script, Firebase, FormSubmit)
  if (
    url.hostname.includes('script.google.com') ||
    url.hostname.includes('firestore.googleapis.com') ||
    url.hostname.includes('identitytoolkit.googleapis.com') ||
    url.hostname.includes('formsubmit.co') ||
    event.request.method !== 'GET'
  ) {
    return;
  }

  // Pour les pages HTML : Network first, fallback to Cache
  if (event.request.mode === 'navigate' || event.request.headers.get('accept')?.includes('text/html')) {
    event.respondWith(
      fetch(event.request)
        .then((response) => {
          if (response && response.status === 200) {
            const copy = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copy));
          }
          return response;
        })
        .catch(() => caches.match(event.request).then((cached) => cached || caches.match('./index.html')))
    );
    return;
  }

  // Pour les ressources statiques : Cache first avec mise à jour en arrière-plan (Stale-While-Revalidate)
  event.respondWith(
    caches.match(event.request).then((cachedResponse) => {
      if (cachedResponse) {
        // Revalider en arrière-plan sans bloquer
        fetch(event.request).then((networkResponse) => {
          if (networkResponse && networkResponse.status === 200) {
            caches.open(CACHE_NAME).then((cache) => cache.put(event.request, networkResponse));
          }
        }).catch(() => {});
        return cachedResponse;
      }

      return fetch(event.request).then((networkResponse) => {
        if (networkResponse && networkResponse.status === 200 && (url.origin === self.location.origin || url.hostname.includes('fonts.gstatic.com'))) {
          const copy = networkResponse.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copy));
        }
        return networkResponse;
      });
    })
  );
});
