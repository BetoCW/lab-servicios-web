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
  - En `engine/src/lib.rs`, declarar constantes simbólicas de stride por contrato (`OFFSET_KIND`, `OFFSET_SPOT`, etc.).
  - En `engine/src/risk.rs`, declarar constantes simbólicas para la estructura `Leg` (`OFFSET_LEG_KIND` a `OFFSET_LEG_MULTIPLIER`), clarificar la prioridad de spreads en `reg_t` y desestructurar escenarios en `span`.
  - En `engine/src/binomial.rs`, documentar los niveles del árbol binomial (`v0`, `v1`, `v2`) y la deducción de griegas por diferencias finitas en la raíz.
  - En `engine/src/math.rs`, documentar la aproximación racional Chebyshev de Hart/West en `norm_cdf`.

## Capabilities

### New Capabilities
<!-- Ninguna nueva capacidad de comportamiento requerida: refactorización interna y mejora de documentación. -->

### Modified Capabilities
<!-- Ninguna especificación existente cambia sus requisitos funcionales o contratos públicos. -->

## Impact

- **Código afectado**:
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
  - `engine/src/risk.rs`
  - `engine/src/binomial.rs`
  - `engine/src/math.rs`
- **APIs y Contratos**: Cero cambios en contratos JSON REST, GraphQL SDL ni firmas de endpoints.
- **Base de datos**: Cero modificaciones de esquemas o migraciones en Supabase.
- **Dependencias**: Cero dependencias npm o cargo añadidas.
- **Compatibilidad**: 100% retrocompatible con la suite de pruebas unitarias (`npm --prefix pruebas test`).
