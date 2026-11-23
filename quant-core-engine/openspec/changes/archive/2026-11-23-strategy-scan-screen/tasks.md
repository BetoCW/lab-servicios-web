## 1. Servicio
- [x] 1.1 Lista `liquid` de 24 tickers (`LIQUID_UNIVERSE` en `scan.service.js`).
- [x] 1.2 `loadMarket(symbol, { horizonDays })`: ventana de vencimientos parametrizable (default actual).
- [x] 1.3 `scan.service.js`: `scan({ horizonDays, universe, limit, cores })` con pool de concurrencia 4, `paths` 4 000, `skipped[]`.
- [x] 1.4 `screen({ template, ... })` reutilizando el recorrido de `scan` y filtrando por plantilla.
- [x] 1.5 Caché `memo` de 10 min por clave `(op, universe, horizonDays, cores, template)`.

## 2. Rutas y contrato
- [x] 2.1 `GET /strategies/scan` y `GET /strategies/screen` en `strategies.routes.js` (validación: 400 si `template` no existe o `horizonDays` fuera de 30–120).
- [x] 2.2 GraphQL: `strategyScan`, `strategyScreen` y tipos `ScanRow`, `ScanResult`.
- [x] 2.3 OpenAPI (Swagger) con parámetros y esquema de respuesta.
- [x] 2.4 Fusionar el delta en `openspec/specs/market-data-api/spec.md`.

## 3. Front
- [x] 3.1 Ventana "Explorar" (botón en el Recomendador) con pestañas Oportunidades / Top 10 por estrategia (selector de plantilla y horizonte).
- [x] 3.2 Clic/Enter en fila → `setTicker(symbol)`, cierra la ventana y lleva el flujo al paso 3.

## 4. Pruebas
- [x] 4.1 Unitarias de `scan`/`screen` con `recommendService` simulado (orden, `limit`, `skipped`, plantilla inválida).
- [x] 4.2 Llamada en vivo a ambos endpoints (REST y GraphQL) contra Alpaca paper.
- [x] 4.3 Contrato REST ⇄ OpenAPI verificado por `pruebas/contrato/openapi.test.js`; GraphQL probado en vivo.
