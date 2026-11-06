# Design: Refactorización Estructural y Claridad Documental

## Context

El sistema está compuesto por un Gateway Express 5, cuatro microservicios (`watchlists`, `orders`, `option-chains`, `strategies`), un cliente Alpaca REST nativo, una librería de indicadores técnicos y un motor matemático en Rust compilado a WebAssembly (`@core/quant-engine`). Ver motivación en `proposal.md`.

El codebase actual utiliza variables crípticas en bucles de cálculo y desestructuración, enrutadores de un solo carácter en `api/src/routes/index.js`, y firmas de memoria lineal en `@core/quant-engine` sin documentación formal de offsets.

## Goals / Non-Goals

**Goals:**
- Sustituir identificadores crípticos por términos de dominio explícitos (`contract`, `snapshot`, `quote`, `timeToExpiryYears`, `leg`, `legGreeks`, `period`, etc.).
- Renombrar enrutadores en `routes/index.js` a nombres semánticos de microservicio.
- Documentar las convenciones matemáticas y periodos de calentamiento (`null`) en `lib/indicators.js`.
- Documentar con precisión la frontera de memoria WASM (`withBuffers`, `CONTRACT_STRIDE = 7`, `LEG_STRIDE = 6`) en `packages/quant-engine/index.js` y `engine/src/lib.rs`.
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
- **Alternativa descartada**: Mantener `w`, `o`, `c`, `s`, `m`, `a`. Aunque ahorra bytes locales, rompe la navegabilidad estática y dificulta el rastreo de middleware.
- **Razón**: `routers` exportado al final mantiene la misma clave de objeto (`{ account, watchlists, orders, ... }`), garantizando cero impacto en `microservices/index.js` o `app.js`.

### 2. Expansión de variables en `risk.service.js` y `optionChains.service.js`
- **Decisión**: Reemplazar iteradores de una sola letra dentro de funciones de orden superior (`.map`, `.reduce`) por sustantivos concretos.
  - `c` -> `contract`
  - `s` -> `snapshot`
  - `q` -> `quote`
  - `t` -> `timeToExpiryYears`
  - `l` -> `leg`
  - `g` -> `legGreeks`
  - `k` -> `greekMetric`
- **Alternativa descartada**: Desestructuración profunda en la firma de callbacks. Puede ofuscar los fallbacks condicionales (`snapshot?.latestTrade?.p ?? null`).

### 3. Documentación y nomenclatura del adaptador WASM (`packages/quant-engine/index.js`)
- **Decisión**: Anotar `withBuffers` con JSDoc indicando el ciclo de vida de la memoria lineal (`qc_alloc` -> copia a `Float64Array` -> ejecución -> `qc_free`). Renombrar `p` a `pointer`, `out` a `outputPointer`, y `last` a `trailingMetricKey`.
- **Alternativa descartada**: Reemplazar la asignación manual por emscripten o wasm-bindgen. Innecesario, aumentaría el peso del bundle y rompería el build minimalista actual.

### 4. Nombres descriptivos en `lib/indicators.js`
- **Decisión**: Estandarizar `values` como serie de precios de entrada, `period` como tamaño de ventana, y `windowSlice` para las rebanadas de ventana rodante.
- **Alternativa descartada**: Retener variables matemáticas breves (`n`, `d`, `w`, `sd`). Son confusas para ingenieros sin contexto previo de análisis técnico.

### 5. Constantes de stride en `engine/src/lib.rs`
- **Decisión**: Declarar constantes privadas para los índices de desempaquetado FFI (`OFFSET_KIND = 0`, `OFFSET_SPOT = 1`, `OFFSET_STRIKE = 2`, `OFFSET_T = 3`, `OFFSET_RATE = 4`, `OFFSET_DIV = 5`, `OFFSET_VOL_OR_PRICE = 6`).
- **Alternativa descartada**: Modificar la firma FFI para recibir structs de Rust. WebAssembly plano (C ABI) requiere tipos escalares `*const f64` y `f64`.

## Risks / Trade-offs

- **[Riesgo de error tipográfico en variables renombradas]** → Mitigación: Ejecutar la suite completa de 27 pruebas unitarias (`npm --prefix pruebas test`) tras cada archivo modificado para atrapar inmediatamente cualquier `ReferenceError`.
- **[Riesgo de sobrecomentar y generar ruido visual]** → Mitigación: Limitar comentarios a 1-2 líneas que expliquen únicamente invariantes matemáticas, precondiciones de FFI y justificación de límites.
- **[Riesgo de rotura en el contrato exportado de `routes/index.js`]** → Mitigación: El objeto exportado `routers` conserva exactamente las mismas propiedades exportadas (`account`, `watchlists`, `orders`, `option-chains`, `strategies`, `market`).
