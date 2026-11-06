# Design: Refactorización Estructural y Claridad Documental

## Context

El sistema está compuesto por un Gateway Express 5, cuatro microservicios (`watchlists`, `orders`, `option-chains`, `strategies`), un cliente Alpaca REST nativo, una librería de indicadores técnicos y un motor matemático en Rust compilado a WebAssembly (`@core/quant-engine`). Ver motivación en `proposal.md`.

El codebase inicial presentaba variables crípticas en bucles de cálculo y desestructuración, enrutadores de un solo carácter en `api/src/routes/index.js`, y firmas de memoria lineal en `@core/quant-engine` sin documentación formal de offsets. La segunda pasada identificó oportunidades análogas de clarificación en `market.service.js`, `watchlists.service.js`, `graphql/index.js`, utilerías del cliente de persistencia/red, y las capas numéricas de Rust (`risk.rs`, `binomial.rs`, `math.rs`).

## Goals / Non-Goals

**Goals:**
- Sustituir identificadores crípticos por términos de dominio explícitos (`contract`, `snapshot`, `quote`, `timeToExpiryYears`, `leg`, `legGreeks`, `period`, `watchlist`, `asset`, etc.).
- Renombrar enrutadores en `routes/index.js` a nombres semánticos de microservicio.
- Documentar las convenciones matemáticas y periodos de calentamiento (`null`) en `lib/indicators.js`.
- Documentar con precisión la frontera de memoria WASM (`withBuffers`, `CONTRACT_STRIDE = 7`, `LEG_STRIDE = 6`) en `packages/quant-engine/index.js` y `engine/src/lib.rs`.
- Proveer `unwrapQuery` en `api/src/lib/supabase.js` conservando el alias `export const q = unwrapQuery` para garantizar retrocompatibilidad absoluta.
- Documentar los campos del feed OHLCV de Alpaca (`rawBar.t` a `rawBar.v`) en `market.service.js`.
- Declarar constantes de stride `OFFSET_LEG_*` en `engine/src/risk.rs` y documentar la recursión del árbol binomial en `engine/src/binomial.rs`.
- Proteger la integridad de los 27 tests unitarios automatizados (`npm --prefix pruebas test`).

**Non-Goals:**
- No alterar las firmas ni nombres de campos de las respuestas JSON públicas (mantener camelCase en REST/GraphQL).
- No modificar endpoints, métodos HTTP ni rutas (`/api/v1/*`, `/graphql`, `/health`, `/metrics`).
- No agregar dependencias de terceros (como lodash, ramda o librerías de validación adicionales).
- No alterar esquemas ni migraciones de Supabase PostgreSQL.
- No sobrecomentar el código: mantener comentarios concisos enfocados en invariantes de dominio y precondiciones.

## Decisions

### 1. Renombrado de Routers en `routes/index.js`
- **Decisión**: Declarar `watchlistsRouter`, `ordersRouter`, `optionChainsRouter`, `strategiesRouter`, `marketRouter`, y `accountRouter` explícitamente.
- **Razón**: `routers` exportado al final mantiene la misma clave de objeto (`{ account, watchlists, orders, ... }`), garantizando cero impacto en `microservices/index.js` o `app.js`.

### 2. Expansión de variables en servicios (`risk.service.js`, `optionChains.service.js`, `market.service.js`, `watchlists.service.js`)
- **Decisión**: Reemplazar iteradores de una sola letra dentro de funciones de orden superior (`.map`, `.reduce`) por sustantivos concretos.
  - `c` -> `contract`
  - `s` -> `snapshot`
  - `q` -> `quote`
  - `w` -> `watchlist`
  - `a` -> `asset`
  - `b` -> `rawBar`
  - `bb` -> `bollingerBands`
  - `m` -> `macdMetrics`

### 3. Alias retrocompatible en `api/src/lib/supabase.js`
- **Decisión**: Exportar `unwrapQuery(queryPromise)` como nombre canónico y asignar `export const q = unwrapQuery`.
- **Razón**: Permite código expresivo en nuevos servicios sin romper importaciones preexistentes en la base de código.

### 4. Limpieza del envoltorio GraphQL (`api/src/graphql/index.js`)
- **Decisión**: Sustituir el truco de operador coma `(...a) => (await fn(...a), true)` por una función asíncrona con cuerpo de bloque explícito. Reemplazar `r` por `riskAnalysisResult` y `qt` por `quote`.

### 5. Documentación y constantes en el motor Rust
- **Decisión**:
  - Declarar `OFFSET_LEG_KIND = 0` hasta `OFFSET_LEG_MULTIPLIER = 5` en `engine/src/risk.rs` para desempaquetar la memoria compartida FFI sin números mágicos.
  - En `engine/src/lib.rs`, renombrar parámetros de dimensión FFI (`num_spot_shocks`, `num_vol_shocks`) y reemplazar tamaños mágicos por `risk::SPAN_SCENARIOS.len()`.
  - En `engine/src/bs.rs`, documentar que `df_q` y `df_r` representan los factores de descuento continuo ($e^{-q \cdot t}$ y $e^{-r \cdot t}$) y la aproximación de semilla de Brenner-Subrahmanyam para la volatilidad implícita.
  - En `engine/src/binomial.rs`, documentar que `v0` es la raíz, `v1` son los dos nodos del paso 1 (down, up) y `v2[1]` es el nodo central del paso 2 con el mismo spot de la raíz.
  - En `engine/src/math.rs`, documentar la aproximación racional Chebyshev minimax de Hart/West (2005) para `norm_cdf`.

### 6. Refactorización declarativa en bootstrap de procesos y diagnóstico
- **Decisión**: En `api/src/app.js`, `api/src/config.js` y `api/src/microservices/start.js`, expandir nombres en variables de proceso e iteradores de diagnóstico (`serviceMonitoring`, `routePath`, `envValue`, `configKey`, `serviceName`).
- **Razón**: Mejora la claridad del ciclo de vida del servidor y reduce ambigüedad en terminales al levantar microservicios.

### 7. Clarificación en infraestructura de pruebas y servidor MCP
- **Decisión**: Renombrar servidores y responses en `pruebas/integracion/gateway.test.js`, utilerías en `pruebas/mcp/f0-api-mcp.js`, `pruebas/colecciones/build.js` y `pruebas/carga/k6.js`.
- **Razón**: Permite que cualquier integrante del equipo ejecute, diagnostique y amplíe las pruebas sin descifrar abreviaturas locales.

## Risks / Trade-offs

- **[Riesgo de error tipográfico en variables renombradas]** → Mitigación: Ejecutar la suite completa de 27 pruebas unitarias (`npm --prefix pruebas test`) tras cada archivo modificado para atrapar inmediatamente cualquier `ReferenceError`.
- **[Riesgo de sobrecomentar y generar ruido visual]** → Mitigación: Limitar comentarios a 1-2 líneas que expliquen únicamente invariantes matemáticas, precondiciones de FFI y justificación de límites.
- **[Riesgo de rotura en el contrato exportado de `routes/index.js` o `supabase.js`]** → Mitigación: Se exportan alias exactos (`routers` y `q`) conservando la firma de consumo existente.
