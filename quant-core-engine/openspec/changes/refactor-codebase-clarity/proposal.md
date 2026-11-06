# Propuesta: Refactorización y Claridad del Código en Quant Core Engine

## Why

Diversos módulos del motor cuantitativo, los servicios de mercado y las utilerías de persistencia y FFI presentan variables crípticas de una sola letra (`w`, `o`, `c`, `s`, `m`, `a`, `l`, `g`, `q`, `qt`, `sn`, `k`, `b`, `p`, `n`, `d`), bucles matemáticos densos sin anotaciones de dominio y desestructuraciones posicionales de memoria FFI sin constantes declarativas. Esta deuda técnica dificulta la incorporación de nuevos desarrolladores y eleva el riesgo de regresiones accidentales en mantenimiento. Esta refactorización integral incrementa la legibilidad, coherencia y documentación esencial del código preservando con exactitud la compatibilidad funcional de la API y el rendimiento numérico.

## What Changes

- **Enrutamiento HTTP explícito**: Renombrar enrutadores Express en `api/src/routes/index.js` de identificadores de un carácter (`w`, `o`, `c`, `s`, `m`, `a`) a nombres declarativos de servicio (`watchlistsRouter`, `ordersRouter`, `optionChainsRouter`, `strategiesRouter`, `marketRouter`, `accountRouter`).
- **Nomenclatura y tipado documental en servicios**:
  - En `api/src/services/risk.service.js`, renombrar iteradores y alias crípticos (`c` -> `contract`, `s` -> `snapshot`, `q` -> `quote`, `t` -> `timeToExpiryYears`, `l` -> `leg`, `g` -> `legGreeks`, `k` -> `greekMetric`).
  - En `api/src/services/optionChains.service.js` y `orders.service.js`, clarificar funciones transformadoras DTO (`toChainDto`, `toQuoteDto`, `toOrderDto`) e iteración por lotes de 500 inserciones.
  - En `api/src/services/market.service.js`, documentar las claves OHLCV crípticas del feed de Alpaca (`rawBar.t` a `rawBar.v`), expandir variables de indicadores técnicos (`bollingerBands`, `macdMetrics`) y centralizar el cálculo temporal (`DAY_IN_MS = 86_400_000`).
  - En `api/src/services/watchlists.service.js`, reemplazar identificadores de una sola letra (`w` -> `watchlist`, `a` -> `asset`) y documentar la sincronización entre Alpaca y Supabase.
- **Transparencia en GraphQL y capa de red**:
  - En `api/src/graphql/index.js`, sustituir el operador coma en `done` por bloques async estándar, y expandir resolutores (`r` -> `riskAnalysisResult`, `qt` -> `quote`).
  - En `api/src/lib/alpaca.js`, clarificar el serializador de consultas `toQuery` con variables descriptivas (`searchParams`, `paramKey`, `paramValue`).
  - En `api/src/lib/supabase.js`, proveer `unwrapQuery` manteniendo `export const q = unwrapQuery` para garantizar retrocompatibilidad.
  - En `api/src/lib/metrics.js` y `errors.js`, expandir variables de temporización y acumulación en memoria (`startTimeNs`, `metricStat`, `fieldValue`).
- **Transparencia en puente WASM/FFI**:
  - En `packages/quant-engine/index.js`, documentar la disposición de buffers lineales (strides 7 y 6) y renombrar argumentos genéricos (`p` -> `pointer`, `out` -> `outputPointer`, `outLen` -> `outputLength`, `last` -> `trailingMetricKey`).
- **Claridad algorítmica en indicadores y utilerías**:
  - En `api/src/lib/indicators.js`, renombrar parámetros crípticos (`n` -> `period`, `d` -> `priceDifference`, `w` -> `windowSlice`, `sd` -> `standardDeviation`, `k` -> `smoothingMultiplier`) y documentar el periodo de calentamiento (`null`).
  - En `api/src/lib/occ.js`, documentar las partes de la expresión regular OCC.
  - En `web/templates.js`, renombrar parámetros abstractos en selectores funcionales (`closest`, `byDelta`, `covers`).
- **Constantes de offset y precisión nodal en motor Rust**:
  - En `engine/src/lib.rs`, declarar constantes simbólicas de stride por contrato (`OFFSET_KIND`, `OFFSET_SPOT`, etc.), renombrar variables de dimensión FFI (`n_s`, `n_v` -> `num_spot_shocks`, `num_vol_shocks`) y sustituir literales por `risk::SPAN_SCENARIOS.len()`.
  - En `engine/src/bs.rs`, documentar factores analíticos de descuento continuo (`df_q`, `df_r`) y el algoritmo híbrido Newton-Raphson/bisección con semilla de Brenner-Subrahmanyam.
  - En `engine/src/risk.rs`, declarar constantes simbólicas para la estructura `Leg` (`OFFSET_LEG_KIND` a `OFFSET_LEG_MULTIPLIER`), clarificar la prioridad de spreads en `reg_t` y desestructurar escenarios en `span`.
  - En `engine/src/binomial.rs`, documentar los niveles del árbol binomial (`v0`, `v1`, `v2`) y la deducción de griegas por diferencias finitas en la raíz.
  - En `engine/src/math.rs`, documentar la aproximación racional Chebyshev de Hart/West en `norm_cdf`.
- **Gateway, arranque y configuración (Tercera Pasada)**:
  - En `api/src/app.js`, clarificar variables de monitoreo y rutas (`serviceMonitoring`, `routePath`).
  - En `api/src/config.js`, clarificar desestructuraciones en diagnóstico (`missingConfig`: `envValue`, `configKey`).
  - En `api/src/microservices/start.js`, expandir variables de proceso y rutas (`serviceName`, `routePath`).
- **Nomenclatura uniforme en servicios de negocio (Tercera Pasada)**:
  - En `api/src/services/orders.service.js`, renombrar instancias de orden (`fetchedOrder`, `createdOrder`, `paramKey`, `cancelResult`).
  - En `api/src/services/strategies.service.js`, renombrar iteradores (`leg`), extraer la constante de multiplicador `CONTRACT_SIZE = 100` y documentar redondeos.
  - En `api/src/services/optionChains.service.js`, documentar claves de feed Alpaca (`bp`, `ap`, `p`, `c`) y expandir nombres en lambdas.
- **Estandarización en infraestructura de pruebas y servidor MCP (Tercera Pasada)**:
  - En `pruebas/integracion/gateway.test.js`, expandir variables de servidor y respuestas (`app`, `server`, `gatewayUrl`, `response`).
  - En `pruebas/mcp/f0-api-mcp.js`, clarificar peticiones y variables de entorno (`targetRequest`, `httpResponse`, `envKey`, `reqItem`).
  - En `pruebas/colecciones/build.js`, usar constantes declarativas (`WORKSPACE_ID`, `BASE_ENVIRONMENT_ID`) y nombres legibles de carpetas.
  - En `pruebas/carga/k6.js`, renombrar respuestas en verificaciones (`response`).
- **JSDoc exhaustivo y documentación técnica en inglés (Cuarta Pasada)**:
  - Documentar exhaustivamente cada método público y transformador DTO en los 6 servicios de negocio (`watchlists`, `orders`, `optionChains`, `strategies`, `risk`, `market`) con anotaciones `@param`, `@returns` y descripción técnica en inglés.
  - Dotar a la envoltura WebAssembly (`packages/quant-engine/index.js`) de tipado formal JSDoc para las 7 funciones matemáticas y de riesgo, renombrando variables de iteración (`c` -> `contract`, `l` -> `leg`).
  - Traducir a inglés técnico todos los comentarios y docstrings existentes en la base de código (`indicators.js`, `occ.js`, `errors.js`, `alpaca.js`, `supabase.js`, `metrics.js`, `app.js`, `config.js`, `microservices/index.js`, `web/templates.js`, `engine/src/lib.rs`), en estricto cumplimiento de la Regla 8 de desarrollo, preservando las cadenas de error requeridas por las pruebas.

## Capabilities

### New Capabilities
<!-- Ninguna nueva capacidad de comportamiento requerida: refactorización interna y mejora de documentación. -->

### Modified Capabilities
<!-- Ninguna especificación existente cambia sus requisitos funcionales o contratos públicos. -->

## Impact

- **Código afectado**:
  - `api/src/app.js`
  - `api/src/config.js`
  - `api/src/microservices/start.js`
  - `api/src/routes/index.js`
  - `api/src/services/risk.service.js`
  - `api/src/services/optionChains.service.js`
  - `api/src/services/orders.service.js`
  - `api/src/services/strategies.service.js`
  - `api/src/services/market.service.js`
  - `api/src/services/watchlists.service.js`
  - `api/src/graphql/index.js`
  - `api/src/lib/indicators.js`
  - `api/src/lib/occ.js`
  - `api/src/lib/supabase.js`
  - `api/src/lib/alpaca.js`
  - `api/src/lib/metrics.js`
  - `api/src/lib/errors.js`
  - `packages/quant-engine/index.js`
  - `web/templates.js`
  - `engine/src/lib.rs`
  - `engine/src/bs.rs`
  - `engine/src/risk.rs`
  - `engine/src/binomial.rs`
  - `engine/src/math.rs`
  - `pruebas/integracion/gateway.test.js`
  - `pruebas/mcp/f0-api-mcp.js`
  - `pruebas/colecciones/build.js`
  - `pruebas/carga/k6.js`
- **APIs y Contratos**: Cero cambios en contratos JSON REST, GraphQL SDL ni firmas de endpoints.
- **Base de datos**: Cero modificaciones de esquemas o migraciones en Supabase.
- **Dependencias**: Cero dependencias npm o cargo añadidas.
- **Compatibilidad**: 100% retrocompatible con la suite de pruebas unitarias (`npm --prefix pruebas test`).
