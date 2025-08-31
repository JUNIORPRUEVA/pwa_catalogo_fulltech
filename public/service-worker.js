// Define el nombre de la caché. Cambiar esta versión invalida la caché anterior.
const CACHE_NAME = 'fulltech-catalogo-v1';

// Lista de archivos esenciales para que la aplicación funcione sin conexión.
const CORE_ASSETS = [
  './',
  './index.html',
  './styles.css',
  './app.js',
  './manifest.webmanifest'
];

// Evento 'install': Se dispara cuando el Service Worker se instala por primera vez.
self.addEventListener('install', (event) => {
  console.log('Service Worker: Instalando...');
  // Espera a que la promesa se resuelva antes de continuar.
  event.waitUntil(
    // Abre la caché con el nombre definido.
    caches.open(CACHE_NAME)
      .then((cache) => {
        console.log('Service Worker: Guardando archivos base en caché');
        // Agrega todos los archivos esenciales a la caché.
        return cache.addAll(CORE_ASSETS);
      })
      .then(() => self.skipWaiting()) // Activa el nuevo SW inmediatamente.
  );
});

// Evento 'activate': Se dispara cuando el Service Worker se activa.
self.addEventListener('activate', (event) => {
  console.log('Service Worker: Activando...');
  event.waitUntil(
    // Obtiene todos los nombres de las cachés existentes.
    caches.keys().then((cacheNames) => {
      return Promise.all(
        // Mapea sobre los nombres de caché.
        cacheNames.map((cacheName) => {
          // Si una caché no coincide con la actual, se elimina.
          if (cacheName !== CACHE_NAME) {
            console.log('Service Worker: Limpiando caché antigua:', cacheName);
            return caches.delete(cacheName);
          }
        })
      );
    }).then(() => self.clients.claim()) // Toma el control de las páginas abiertas.
  );
});

// Evento 'fetch': Se dispara cada vez que la página realiza una petición de red (ej. CSS, JS, imágenes, API).
self.addEventListener('fetch', (event) => {
  const req = event.request;
  const url = new URL(req.url);

  // No interceptar peticiones que no sean GET.
  if (req.method !== 'GET') {
    return;
  }
  
  // Estrategia: Network First para las llamadas a la API de Google Apps Script.
  // Esto asegura que los datos de productos y configuración siempre estén actualizados.
  if (url.hostname.includes('script.google.com')) {
    event.respondWith(
      fetch(req).catch(() => {
        // Opcional: Podrías devolver una respuesta genérica de error si falla la red.
        console.error('Fallo al contactar la API y sin caché disponible.');
      })
    );
    return;
  }

  // Estrategia: Cache First para todos los demás recursos.
  // Busca en la caché primero, y si no lo encuentra, va a la red.
  event.respondWith(
    caches.match(req).then((cachedResponse) => {
      if (cachedResponse) {
        // Si está en caché, lo devuelve directamente.
        return cachedResponse;
      }
      // Si no está en caché, lo busca en la red.
      return fetch(req).then((networkResponse) => {
          // Opcional: podrías clonar y guardar la respuesta en caché para futuras peticiones.
          return networkResponse;
      });
    })
  );
});

