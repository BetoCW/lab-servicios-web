# Propuesta: Refactorización y Claridad del Código en Quant Core Engine

## Why

Diversos módulos del motor cuantitativo y los servicios API presentan variables crípticas de una sola letra (`w`, `o`, `c`, `s`, `m`, `a`, `l`, `g`, `q`, `qt`, `sn`, `k`), bucles matemáticos densos sin anotaciones de dominio y desestructuraciones posicionales de memoria FFI sin constantes declarativas. Esta deuda técnica dificulta la incorporación de nuevos desarrolladores y eleva el riesgo de regresiones accidentales en mantenimiento. Esta refactorización incrementa la legibilidad, coherencia y documentación esencial del código preservando con exactitud la compatibilidad funcional de la API y el rendimiento numérico.

## What Changes

- **Enrutamiento HTTP explícito**: Renombrar enrutadores Express en `api/src/routes/index.js` de identificadores de un carácter (`w`, `o`, `c`, `s`, `m`, `a`) a nombres declarativos de servicio (`watchlistsRouter`, `ordersRouter`, `optionChainsRouter`, `strategiesRouter`, `marketRouter`, `accountRouter`).
- **Nomenclatura y tipado documental en servicios**:
  - En `api/src/services/risk.service.js`, renombrar iteradores y alias crípticos (`c` -> `contract`, `s` -> `snapshot`, `q` -> `quote`, `t` -> `timeToExpiryYears`, `l` -> `leg`, `g` -> `legGreeks`, `k` -> `greekMetric`).
  - En `api/src/services/optionChains.service.js` y `orders.service.js`, clarificar funciones transformadoras DTO (`toChainDto`, `toQuoteDto`, `toOrderDto`) y desestructuraciones en lotes.
- **Transparencia en puente WASM/FFI**:
  - En `packages/quant-engine/index.js`, documentar la disposición de buffers lineales (strides 7 y 6) y renombrar argumentos genéricos (`p` -> `pointer`, `out` -> `outputPointer`, `outLen` -> `outputLength`, `last` -> `trailingMetricKey`).
- **Claridad algorítmica en indicadores y utilerías**:
  - En `api/src/lib/indicators.js`, renombrar parámetros crípticos (`n` -> `period`, `d` -> `priceDifference`, `w` -> `windowSlice`, `sd` -> `standardDeviation`, `k` -> `smoothingMultiplier`) y documentar el periodo de calentamiento (`null`).
  - En `api/src/lib/occ.js`, documentar las partes de la expresión regular OCC.
  - En `web/templates.js`, renombrar parámetros abstractos en selectores funcionales (`closest`, `byDelta`, `covers`).
- **Constantes de offset en FFI Rust**:
  - En `engine/src/lib.rs`, sustituir accesos por índice numérico directo (`row[0]`, `row[1]`, etc.) por constantes simbólicas de stride (`OFFSET_KIND`, `OFFSET_SPOT`, etc.).

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
  - `api/src/lib/indicators.js`
  - `api/src/lib/occ.js`
  - `packages/quant-engine/index.js`
  - `web/templates.js`
  - `engine/src/lib.rs`
- **APIs y Contratos**: Cero cambios en contratos JSON REST, GraphQL SDL ni firmas de endpoints.
- **Base de datos**: Cero modificaciones de esquemas o migraciones en Supabase.
- **Dependencias**: Cero dependencias npm o cargo añadidas.
- **Compatibilidad**: 100% retrocompatible con la suite de pruebas unitarias (`npm --prefix pruebas test`).
