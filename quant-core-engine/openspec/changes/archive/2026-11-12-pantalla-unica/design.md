# Design: pantalla-unica

## Context

Ver `proposal.md` y `docs/arquitectura/UI-UNA-VISTA.md`. La arquitectura concentra la interacción en una sola vista con gráfica en vivo. El límite de Alpaca (200 peticiones/min) y las 32 peticiones iniciales del front original exigían consolidar llamadas en el backend y deduplicar consultas idénticas.

## Goals / Non-Goals

**Goals:**
- Reducir el consumo de peticiones a Alpaca en régimen estable a ~32 req/min.
- Consolidar endpoints agregados (`GET /market/overview`, `GET /strategies?priced=true`).
- Deduplicar peticiones simultáneas y cachear respuestas con TTL en memoria mediante `lib/cache.js` (`memo`).
- Proteger la ejecución automática (`POST /strategies/auto`) con candado de ejecución única y enfriamiento de 60 s por ticker.
- Diseñar carga parcial: degradación elegante con HTTP 200 y bloque `errors` si fallan indicadores o vencimientos.

**Non-Goals:**
- Implementar almacenamiento distribuido (Redis/Memcached); el alcance actual es en memoria por proceso Node.js.
- Reescribir la arquitectura de microservicios o mover agregaciones al gateway (el gateway permanece como proxy inverso desacoplado).

## Decisions

### 1. Agregación en servicios de dominio en lugar del Gateway
- **Decisión**: `overview` vive en el microservicio `option-chains` (puerto 3063) y `?priced=true` en `strategies` (puerto 3064).
- **Razón**: Mantiene el Gateway (`api/src/routes/index.js`) como un proxy transparente sin estado ni lógica de negocio, evitando latencias de salto entre servicios.
- **Alternativa descartada**: Implementar un BFF (Backend for Frontend) en el gateway que coordine peticiones internas (agregaba acoplamiento y sobrecarga de red).

### 2. Función `memo` con TTL y deduplicación de promesas en vuelo
- **Decisión**: Crear `lib/cache.js` con una utilidad genérica `memo(ttlMs, fn, keyOf)`.
- **Razón**: Permite compartir una única promesa en curso entre múltiples clientes concurrentes ("thundering herd") y respetar un TTL sin añadir dependencias externas de npm.
- **Alternativa descartada**: Instalar `node-cache` o `lru-cache` (descartado por la regla de cero dependencias innecesarias).

### 3. Carga parcial con `Promise.allSettled` en `overview`
- **Decisión**: Si falla la cotización, se rechaza la llamada (HTTP 404/500). Si fallan indicadores técnicos o vencimientos, se retorna HTTP 200 con `indicators: null` o `expirations: null` y el detalle en `errors`.
- **Razón**: La interfaz puede renderizar la gráfica y el precio aunque Alpaca tenga retrasos en contratos o velas diarias.

### 4. Bloqueo de concurrencia y cooldown en `autoTrade`
- **Decisión**: Bandera booleana en memoria (`running`) para ejecución simultánea y mapa `lastOrderAt` con TTL de 60 s por ticker. En caso de fallo en el envío, se elimina la clave de `lastOrderAt`.
- **Razón**: Evita sobre-operar o enviar órdenes duplicadas al mercado PAPER ante clics repetidos o disparos automáticos.

## Risks / Trade-offs

- **[Caché en memoria por réplica]** → Si se escala a múltiples instancias del microservicio, cada proceso mantendrá su propio caché. *Mitigación*: En ese escenario se migrará `lib/cache.js` a un backend compartido en Redis.
- **[Tope de memoria por entradas infinitas]** → *Mitigación*: `memo` implementa expulsión FIFO con límite de 500 entradas (`MAX_ENTRIES`).
- **[Tiempos de respuesta prolongados en IA durante `/auto`]** → *Mitigación*: Si la IA o Alpaca fallan, se libera el candado inmediatamente y el bloqueo de ticker se limpia para permitir reintentos.
