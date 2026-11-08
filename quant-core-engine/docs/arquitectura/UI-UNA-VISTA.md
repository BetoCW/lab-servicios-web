# Pantalla única: arquitectura (Quant Core F0)

Decisión: toda la app en una vista, gráfica en vivo como protagonista. Lo básico siempre visible, el detalle bajo demanda.
Este documento fija cómo se organiza el sistema para que sea rápida, simple y no rompa el límite de Alpaca (200 peticiones/min).

## 1. Arquitectura de información

```
+--------------------------------------------------------------------------------+
| [Buscador ticker]  AAPL  342.41  -0.64%   bid/ask   | Cuenta: equity · poder   |  <- SIEMPRE (overview + account)
+----------------------+---------------------------------------+-----------------+
| Watchlists           |                                       | Recomendador    |  <- SIEMPRE (resumen)
|  (lista corta,       |        GRAFICA EN VIVO                |  ganadora +     |
|   clic = cambia      |   velas + SMA/EMA/Bollinger           |  puntaje +      |
|   ticker)            |   (RSI/MACD debajo, opcional)         |  1 frase        |
+----------------------+---------------------------------------+-----------------+
| Indicadores (tarjetas: RSI, HV30, tendencia)  | Estrategias guardadas (neto) | Ordenes recientes |
+--------------------------------------------------------------------------------+
  BAJO DEMANDA (cajon/modal, se pide al abrir):
   - Detalle de una estrategia: riesgo extendido, Monte Carlo, histograma  (GET /strategies/:id/risk)
   - Detalle del recomendador: 4 estrategias, reporte completo, backtest    (GET /strategies/recommend[/backtest])
   - Cadena de opciones completa                                           (GET /option-chains/:id)
   - Constructor / enviar orden, ejecutar automatico (con aviso)           (POST ...)
```

| Basico visible (siempre cargado) | Detalle bajo demanda (cajon/modal) |
|---|---|
| Ticker, precio, % del dia, bid/ask | Riesgo extendido (VaR, beta, estres, IC 95 %) |
| Grafica + indicadores resumidos | Histograma Monte Carlo y matriz precio x vol |
| Vencimientos disponibles (selector) | Cadena de opciones con griegas |
| Ganadora del recomendador (nombre, puntaje) | Las 4 estrategias, explicacion larga, backtest |
| Lista de estrategias con costo neto, ordenes recientes | Editar/enviar/cancelar, boton automatico |

Regla: lo que cuesta mas de ~1 s o mas de 1 peticion a Alpaca NO se pide al cambiar de ticker; se pide al abrir el cajon.

## 2. Flujo de datos al cambiar de ticker

```
cambia ticker (AAPL)
   |
   |-- t=0 en paralelo -----------------------------------------------------------
   |   A. GET /market/overview?symbol=AAPL      (1 llamada del navegador)
   |        -> Alpaca: snapshot (1) + velas diarias AAPL (1) + SPY (0, compartido) + contratos (1)
   |   B. GET /market/AAPL/bars?timeframe=5Min  (grafica)
   |        -> Alpaca: velas (1) + snapshot (0, ya cacheado 2 s por A)
   |
   |-- t=A listo (cascada corta, no bloquea la grafica) -----------------------------
   |   C. GET /strategies/recommend?symbol=AAPL (resumen del recomendador; cache 20 s)
   |        -> ~8 llamadas a Alpaca la primera vez; historial ya cacheado por A
   |
   '-- bajo demanda: riesgo, cadena, backtest, ordenes nuevas
```

Por que A y B en paralelo y C despues: la grafica y el precio deben aparecer en <300 ms; el recomendador tarda (Monte Carlo)
y no debe frenar nada. Si el usuario cambia otra vez de ticker, la respuesta vieja se descarta (ver 3).

Que se cachea y cuanto vive (servidor, `api/src/lib/cache.js`):

| Dato | TTL | Clave | Llamadas Alpaca |
|---|---|---|---|
| Snapshot de la accion | 2 s | ticker | 1 |
| Velas diarias (indicadores, VaR) | 5 min | ticker (SPY compartido) | 1 por ticker nuevo |
| Vencimientos de opciones | 10 min | ticker | 1 |
| Recomendacion (GET) | 20 s | ticker+paths | ~8 |
| Catalogo de activos (buscador) | 6 h | global | 1 |
| Velas de la grafica | sin cache (se refrescan) | - | 1 |

Que se refresca y cada cuanto (navegador, UN solo temporizador):

| Que | Cada | Notas |
|---|---|---|
| Ultima vela / precio (`/bars`) | 5 s | se pausa con `document.hidden` |
| `overview` (indicadores, vencimientos) | 60 s | cambian lento; el servidor casi no llama a Alpaca |
| Estrategias `?priced=true` y ordenes | 30 s / 15 s | una consulta, no una por estrategia |
| Cuenta | 60 s | |
| Recomendador | solo al cambiar ticker o con boton | nunca por polling |

## 3. Estado en el front sin framework

Un objeto `state` plano y una funcion `set(parche)` que actualiza y llama a `render(zona)` solo de la zona afectada.

```js
const state = { symbol:'SPY', tf:'5Min', overview:null, bars:null, reco:null,
                strategies:[], orders:[], drawer:null,
                status:{ overview:'idle', bars:'idle', reco:'idle' } };  // idle|loading|ok|error
let ticket = 0;                                   // anti-carrera
async function load(symbol){
  const my = ++ticket; state.symbol = symbol;
  const ok = (k) => (v) => { if (my === ticket) set({[k]: v, status:{...state.status,[k]:'ok'}}); };
  const ko = (k) => (e) => { if (my === ticket) set({status:{...state.status,[k]:'error:'+e.message}}); };
  get(`/market/overview?symbol=${symbol}`).then(ok('overview')).catch(ko('overview'));
  get(`/market/${symbol}/bars?timeframe=${state.tf}`).then(ok('bars')).catch(ko('bars'));
}
```

Reglas: (1) `ticket` descarta respuestas de un ticker anterior (evita que llegue tarde AAPL y pise a TSLA);
(2) cada bloque tiene su propio `status`; (3) un `AbortController` por peticion de `bars`/`reco` al cambiar de ticker;
(4) un solo `setInterval` maestro con ticks de 5 s que decide que refrescar (no un timer por tarjeta);
(5) el front nunca llama a `GET /strategies/:id` en bucle: usa `?priced=true`.

## 4. Presupuesto de 200 peticiones/min a Alpaca

Con una pestana, un ticker, estado estable (por minuto):

| Fuente | Calculo | Llamadas/min |
|---|---|---|
| bars cada 5 s (velas; snapshot cacheado 2 s) | 12 x (1 velas + 1 snapshot) | 24 |
| overview cada 60 s (snapshot compartido) | 1 x 0-1 | ~1 |
| ordenes cada 15 s | 4 | 4 |
| estrategias priced cada 30 s | 2 x 1 | 2 |
| cuenta cada 60 s | 1 | 1 |
| **Total estable** | | **~32** |
| Cambio de ticker (una vez) | 1+1+1+1+~8 | ~12 |

Margen: ~170/min libres. Con 5 pestanas el servidor sigue en ~32/min porque `memo` comparte snapshot y velas (la deduplicacion
es por servidor, no por pestana); solo `bars` de distinto ticker o timeframe suma.
Tecnicas: (a) cache TTL; (b) deduplicacion de peticiones en vuelo (`memo`); (c) polling inteligente: pausar con pestana oculta,
bajar a 30 s fuera de horario de mercado, subir el intervalo si llega un 429; (d) endpoints agregados (`overview`, `?priced=true`).
Antes de la mejora, medido en la pantalla real: carga = 32 peticiones del navegador (20 de ellas N+1 de estrategias, `bars` x5).

## 5. Errores y carga parcial

Principio: cada bloque falla solo. Nada de pantalla en blanco por un error.

| Falla | Efecto en el servidor | Efecto en pantalla |
|---|---|---|
| Sin cotizacion / ticker invalido | `overview` 404/400 | Mensaje en el buscador, se conserva el ticker anterior |
| Sin historial diario | `overview` 200 con `indicators:null` + `errors.indicators` | Tarjetas de indicadores "no disponible"; grafica sigue |
| Sin contratos de opciones | `expirations:null` + `errors.expirations` | Selector de vencimientos deshabilitado |
| Servicio `ai` caido / sin llave / 429 | `verdict:'unavailable'` (nunca 500) | "Sin validacion de IA"; recomendador y grafica siguen; `/auto` NO opera (falla cerrado) |
| Microservicio caido | gateway 503 con el nombre del servicio | Solo la zona de ese servicio muestra reintentar |
| Alpaca 429 | llega como 429 | Subir intervalo de polling y mostrar "reintentando" |
| Recomendador lento (>30 s) | gateway corta a los 30 s (503) | Mostrar "tarda mas de lo normal", boton reintentar; no bloquear |

## 6. Responsabilidades

```
navegador (web/index.html)  --- un solo origen: gateway :3060 --->  gateway
   state + 1 timer maestro                                         |-- option-chains :3063  /market/overview, /market/:s/bars, /market/search
                                                                   |-- strategies    :3064  /strategies (?priced), /recommend, /auto
                                                                   |-- orders        :3062  /orders, /account
                                                                   |-- watchlists    :3061
                                                                   '-- ai            :3065  (solo lo llama strategies para /auto)
```

El gateway no cachea ni agrega (proxy tonto, 30 s de tope). El agregado vive en el servicio dueno de los datos (`overview` en
`option-chains`, junto a `/market`), asi no hay llamadas entre servicios en la ruta caliente.

## 7. Auditoria (hallazgos y estado)

Alta
- `POST /strategies/auto` sin autenticacion y con CORS abierto + Private Network Access permitido: cualquier pagina web abierta
  en el navegador del usuario puede mandar un POST a localhost y colocar ordenes (paper). Mitigado hoy: candado de una
  ejecucion a la vez y bloqueo de 60 s por ticker (corregido). Pendiente: token compartido (`X-Api-Key`) o `confirm:true` +
  CORS restringido al origen del front; requiere cambio en el front.
- El gateway tiene tope de 30 s y `/auto` tardo 26 s en la prueba real (IA hasta 25 s): al limite. Pendiente: subir el tope
  de `/strategies/auto` o hacerlo asincrono (202 + consulta de estado).

Media
- N+1 en el front: `GET /strategies` + un `GET /strategies/:id` por estrategia (20 peticiones, 20 consultas a Alpaca). Corregido en
  backend con `?priced=true`; falta adoptarlo en el front.
- `bars` se pedia 5 veces en una carga (tres cargas en paralelo desde el front). Falta unificar en el front (el cache de 2 s del
  snapshot ya evita el doble costo en Alpaca, pero no los viajes de red).
- Historial y snapshot se pedian sin deduplicar; `getHistory` descargaba SPY por cada ticker nuevo. Corregido (`memo`, SPY compartido).
- `GET /recommend` repetido (doble clic, dos pestanas) pagaba ~10 llamadas y 80 000 simulaciones cada vez. Corregido (cache 20 s).

Baja
- Duplicacion: regex de ticker en 2 servicios y `round` en 3 archivos. Ticker unificado en `lib/symbol.js`; `round` pendiente.
- `gatewayApp` no reenvia cabeceras (solo `content-type`) y la salud agregada dice "4 microservicios" siendo 5.
- Fuera de horario IEX manda `ask:0`; `overview` lo convierte en `null`. `bars` aun lo expone tal cual.
- Cachés y candado en memoria de un proceso: con varias replicas, pasar a Redis.
- `web/templates.js` se importa desde `api/` (acoplamiento backend -> front para compartir plantillas); mejor moverlo a `packages/`.
