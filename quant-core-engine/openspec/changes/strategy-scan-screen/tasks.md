## 1. Servicio
- [ ] 1.1 `api/src/config/universe.js`: lista `liquid` de ~30 tickers.
- [ ] 1.2 `loadMarket(symbol, { horizonDays })`: ventana de vencimientos parametrizable (default actual).
- [ ] 1.3 `scan.service.js`: `scan({ horizonDays, universe, limit, cores })` con pool de concurrencia 4, `paths` 5 000, `skipped[]`.
- [ ] 1.4 `screen({ template, ... })` reutilizando el recorrido de `scan` y filtrando por plantilla.
- [ ] 1.5 Caché `memo` de 10 min por clave `(op, universe, horizonDays, cores, template)`.

## 2. Rutas y contrato
- [ ] 2.1 `GET /strategies/scan` y `GET /strategies/screen` en `strategies.routes.js` (validación: 400 si `template` no existe o `horizonDays` fuera de 30–120).
- [ ] 2.2 GraphQL: `strategyScan`, `strategyScreen` y tipos `ScanRow`, `ScanResult`.
- [ ] 2.3 OpenAPI (Swagger) con parámetros y esquema de respuesta.
- [ ] 2.4 Fusionar el delta en `openspec/specs/market-data-api/spec.md`.

## 3. Front
- [ ] 3.1 Panel "Explorar" con pestañas Oportunidades / Top 10 por estrategia (selector de plantilla y horizonte).
- [ ] 3.2 Clic en fila → `setTicker(symbol)` y abre el recomendador con esa estrategia resaltada.

## 4. Pruebas
- [ ] 4.1 Unitarias de `scan`/`screen` con `recommendService` simulado (orden, `limit`, `skipped`, plantilla inválida).
- [ ] 4.2 Smoke (`f0-smoke-test`) llamando ambos endpoints contra Alpaca paper.
- [ ] 4.3 `api-contract-guardian`: REST ⇄ GraphQL ⇄ OpenAPI ⇄ spec.
