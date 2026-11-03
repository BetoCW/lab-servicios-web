# 05 Desarrollo de la PWA

> Guía F0 · Quant Core Engine & Market Data. Esta nota es **solo guía**: el front
> (`web/index.html`) todavía no es PWA; aquí está el código de ejemplo para convertirlo.

---

## 05.01 Qué es una PWA

### 05.01.1 Definición
Una *Progressive Web App* es un sitio web que el navegador puede **instalar** como app (ícono,
ventana propia, sin barra de direcciones) y que **funciona sin red** gracias a un *service worker*.
Sigue siendo HTML/CSS/JS servido por HTTPS: no hay tienda de apps ni otro código.

### 05.01.2 Las tres piezas
| Pieza | Para qué |
|---|---|
| **HTTPS** | Obligatorio para registrar service workers (excepto `localhost`) |
| **Web App Manifest** (`manifest.webmanifest`) | Nombre, íconos, colores, modo de pantalla: lo que hace "instalable" la app |
| **Service Worker** (`sw.js`) | Script en segundo plano que intercepta las peticiones: caché, offline, push |

### 05.01.3 Criterios de instalación (Chrome)
Servida por HTTPS, manifest con `name`/`short_name`, `start_url`, `display` (`standalone` o
`fullscreen`), íconos de 192 y 512 px, y un service worker registrado. Firefox de escritorio no
ofrece instalar; Safari en iOS instala desde *Compartir → Agregar a inicio*.

### 05.01.4 Ventajas y límites
- **Ventajas**: una sola base de código, actualizaciones instantáneas, carga rápida desde caché,
  funciona con red inestable.
- **Límites**: acceso a hardware menor que una app nativa; en iOS las notificaciones push solo
  funcionan instalada; el caché tiene cuota.

---

## 05.02 Estado actual del front F0

### 05.02.1 Qué tenemos
- `web/index.html`: un solo archivo, sin dependencias, con CSS y JS en línea; tema claro/oscuro
  con `prefers-color-scheme`; guarda la URL de la API en `localStorage`.
- Se sirve en GitHub Pages (`.github/workflows/pages.yml`) y localmente en
  `http://localhost:3060/app` (`express.static` en `api/src/app.js`).
- Llama a la API con `fetch(`${base()}/api/v1${path}`)`.

### 05.02.2 Qué falta para ser PWA
1. `manifest.webmanifest` + íconos.
2. `<link rel="manifest">` y `theme-color` en el `<head>`.
3. `sw.js` y su registro.
4. Estrategia de caché: el *shell* (HTML) offline; los datos de mercado **no** se deben servir
   viejos sin avisar.

---

## 05.03 Paso a paso

### 05.03.1 Paso 1 — Íconos
Crea `web/icons/icon-192.png` y `web/icons/icon-512.png` (cuadrados, PNG). Agrega una versión
`maskable` (el logo dentro del 80 % central) para Android.

### 05.03.2 Paso 2 — Manifest
`web/manifest.webmanifest`:
```json
{
  "name": "Quant Core F0",
  "short_name": "Quant F0",
  "description": "Watchlists, cadenas de opciones con IV/griegas, estrategias y riesgo",
  "start_url": "./",
  "scope": "./",
  "display": "standalone",
  "background_color": "#f6f7f9",
  "theme_color": "#2457d6",
  "lang": "es",
  "icons": [
    { "src": "icons/icon-192.png", "sizes": "192x192", "type": "image/png" },
    { "src": "icons/icon-512.png", "sizes": "512x512", "type": "image/png" },
    { "src": "icons/icon-512-maskable.png", "sizes": "512x512", "type": "image/png", "purpose": "maskable" }
  ]
}
```
Rutas **relativas** (`./`): el mismo front vive en `/lab-servicios-web/` (Pages) y en `/app/`
(Express); una ruta absoluta rompería uno de los dos.

### 05.03.3 Paso 3 — Enlazarlo en `index.html`
Dentro del `<head>`, junto al `<meta name="viewport">` que ya existe:
```html
<link rel="manifest" href="manifest.webmanifest">
<meta name="theme-color" content="#2457d6" media="(prefers-color-scheme: light)">
<meta name="theme-color" content="#171a20" media="(prefers-color-scheme: dark)">
<link rel="apple-touch-icon" href="icons/icon-192.png">
```

### 05.03.4 Paso 4 — Service worker
`web/sw.js` con dos estrategias:
- **App shell** (HTML, manifest, íconos): *cache first* — abre offline.
- **API** (`/api/v1/...`, `/graphql`): *network only* — precios y órdenes nunca de caché; si no hay
  red, responde un JSON de error que el front ya sabe mostrar.

```js
// web/sw.js
const VERSION = 'f0-v1';                       // súbela en cada despliegue para invalidar el caché
const SHELL = ['./', './index.html', './manifest.webmanifest', './icons/icon-192.png', './icons/icon-512.png'];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(VERSION).then((c) => c.addAll(SHELL)));
  self.skipWaiting();
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k)))),
  );
  self.clients.claim();
});

self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  const esApi = url.pathname.includes('/api/v1/') || url.pathname.endsWith('/graphql');

  if (esApi) {
    // Datos de mercado y órdenes: siempre de la red. Nunca precios viejos.
    e.respondWith(
      fetch(e.request).catch(() =>
        new Response(JSON.stringify({ status: 503, message: 'Sin conexión: la API no está disponible' }), {
          status: 503,
          headers: { 'content-type': 'application/json' },
        }),
      ),
    );
    return;
  }

  if (e.request.method !== 'GET' || url.origin !== self.location.origin) return;

  // App shell: caché primero, y actualiza en segundo plano (stale-while-revalidate).
  e.respondWith(
    caches.match(e.request).then((hit) => {
      const red = fetch(e.request)
        .then((res) => {
          if (res.ok) caches.open(VERSION).then((c) => c.put(e.request, res.clone()));
          return res;
        })
        .catch(() => hit);
      return hit || red;
    }),
  );
});
```

Nota: la API corre en otro origen (`http://localhost:3060`) cuando el front está en GitHub Pages;
la condición `url.origin !== self.location.origin` deja pasar esas peticiones sin tocarlas salvo
el `catch` de la rama API.

### 05.03.5 Paso 5 — Registrar el service worker
Al final del `<script>` de `index.html`:
```js
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('sw.js').catch((err) => console.warn('SW no registrado:', err));
  });
}
```

### 05.03.6 Paso 6 — Botón "Instalar" (opcional)
```js
let promptInstalar;
window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();          // evita el banner automático
  promptInstalar = e;
  document.querySelector('#instalar').hidden = false;
});
document.querySelector('#instalar').addEventListener('click', async () => {
  promptInstalar.prompt();
  await promptInstalar.userChoice;
  promptInstalar = null;
  document.querySelector('#instalar').hidden = true;
});
```
```html
<button id="instalar" hidden>Instalar app</button>
```

### 05.03.7 Paso 7 — Aviso de "sin conexión"
```js
const aviso = () => document.body.classList.toggle('offline', !navigator.onLine);
window.addEventListener('online', aviso);
window.addEventListener('offline', aviso);
aviso();
```
```css
body.offline header::after { content: 'Sin conexión: los datos mostrados pueden estar desactualizados'; display: block; color: var(--warn); }
```

### 05.03.8 Paso 8 — Servirlo
- **GitHub Pages**: el workflow ya publica `quant-core-engine/web/`; los archivos nuevos
  (`manifest.webmanifest`, `sw.js`, `icons/`) se publican solos. Pages es HTTPS.
- **Express**: `app.use('/app', express.static(...))` ya los sirve; `localhost` cuenta como
  contexto seguro.

---

## 05.04 Verificación

### 05.04.1 DevTools
Chrome → F12 → **Application**:
- *Manifest*: sin errores, íconos visibles, "Installable".
- *Service Workers*: estado `activated and is running`.
- *Cache Storage*: `f0-v1` con el shell.
- Marca *Offline* en *Network* y recarga: la interfaz abre; las llamadas a la API muestran el
  mensaje de sin conexión.

### 05.04.2 Lighthouse
DevTools → *Lighthouse* → categoría *Progressive Web App* (en versiones recientes, revisa
*Best practices* + el panel *Application*). Corrige lo que marque.

### 05.04.3 Errores comunes
| Síntoma | Causa |
|---|---|
| No aparece "Instalar" | Falta ícono 512, `display` o el SW no está activo |
| Cambios no se ven | Caché viejo: sube `VERSION` en `sw.js` |
| SW no se registra en Pages | Ruta absoluta (`/sw.js`) fuera del `scope` del repo |
| Datos de mercado viejos | La API se cacheó: debe ser *network only* |
