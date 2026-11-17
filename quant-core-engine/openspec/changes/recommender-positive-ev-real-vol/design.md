# Design

## Context

El flujo actual del recomendador (`api/src/services/recommend.service.js`) reutiliza `riskService.analyzeLegs()` (`api/src/services/risk.service.js`), que calcula la volatilidad del subyacente en Monte Carlo como el promedio de las volatilidades implícitas (`leg.vol`) de las piernas. Al simular con `drift = rate - div - 0.5 * vol^2` bajo la misma IV con la que se valora `base`, el motor opera bajo medida neutral al riesgo ($\mathbb{Q}$), produciendo `EV ≤ 0` sistemáticamente en estrategias cortas de crédito (`Short straddle/strangle`) y en calendarios con contango. Adicionalmente, `composite()` en `api/src/lib/scoring.js` pondera linealmente sin distinguir el signo del EV, permitiendo que una estrategia con `EV ≤ 0` gane el #1 aunque `autoTrade.service.js` la rechace en `riskFilter`.

Motivación completa en `proposal.md` y contrato de comportamiento en `specs/recommender/spec.md`.

## Goals / Non-Goals

**Goals:**
- Simular las trayectorias del subyacente en medida física ($\mathbb{P}$) usando `hv30` en el recomendador y en el backtest sin romper el ABI v100 del motor WASM (`@core/quant-engine`).
- Garantizar matemáticamente dentro de `composite()` que cualquier estrategia con `expectedValue > 0` obtenga un puntaje estrictamente superior a cualquiera con `expectedValue <= 0`, preservando la monotonicidad interna dentro de cada tramo.
- Exponer `actionable` y la fuente de volatilidad de simulación en la API REST (camelCase), alinear la presentación en `web/index.html` y mantener la consistencia con `autoTrade.service.js`.

**Non-Goals:**
- Modificar el ABI v100 de `qc_monte_carlo` en Rust/WASM (`engine/src/risk.rs`) ni recompilar `quant_core.wasm`.
- Estimar deriva histórica ($\mu$) del subyacente para el Monte Carlo (el drift de 30 días en series de 1 año introduce ruido direccional alto; se mantiene `RATE` en el motor).
- Alterar el comportamiento por defecto de `GET /strategies/{id}/risk` para estrategias guardadas cuando no se solicita volatilidad de simulación explícita.
- Introducir cambios en esquemas o migraciones de Supabase.

## Decisions

### 1. Inyección explícita de `simulationVol` en `riskService.analyzeLegs()` (sin tocar WASM ABI)
- **Decisión:** Extender `query` de `riskService.analyzeLegs(strategy, legs, query, prefetched)` con un parámetro opcional `simulationVol` (y metadato `simulationVolSource`: `'hv30' | 'iv-avg'`). Si `Number.isFinite(query.simulationVol) && query.simulationVol > 0`, se pasa ese valor como `vol` a `monteCarlo(...)`; de lo contrario conserva el promedio de `leg.vol`. `recommend.service.js` calcula `marketView.hv30` una sola vez y pasa `simulationVol: marketView.hv30` en las 4 llamadas paralelas por lote.
- **Alternativa descartada:** Cambiar `engine/src/risk.rs` para recibir un `base_cost` de mercado y un parámetro adicional de volatilidad. Requeriría incrementar `qc_abi_version`, modificar `packages/quant-engine/index.js` y recompilar el binario `.wasm`, cuando `monteCarlo()` ya recibe `vol` separado de `leg.vol` manteniendo un único cruce FFI por estrategia.
- **Composición y contratos:** `risk.service.js` expone `simulationVolSource` dentro de `inputs` (camelCase), manteniendo compatibilidad total con consumidores existentes como GraphQL (`api/src/graphql/index.js`) y `GET /strategies/{id}/risk`.

### 2. Escala segmentada y monotónica en `composite()` (`api/src/lib/scoring.js`)
- **Decisión:** Definir constantes declarativas en `api/src/lib/scoring.js` para las ponderaciones y bandas de puntaje:
  - `SCORE_WEIGHTS = { probProfit: 0.4, expectedValue: 0.3, fit: 0.3 }`
  - `POSITIVE_EV_BASE = 30`, `POSITIVE_EV_SPAN = 70` (rango teórico `(40.5, 100]` cuando `expectedValue > 0`, pues `evScore > 0.5` implica `raw > 0.15` y `30 + 70 * 0.15 = 40.5`).
  - `NON_POSITIVE_EV_MAX_SCALE = 30` (rango `[0, 25.5]` cuando `expectedValue <= 0`, pues `evScore <= 0.5` implica `raw <= 0.85` y `30 * 0.85 = 25.5`).
  - Fórmula:
    - `raw = SCORE_WEIGHTS.probProfit * probProfit + SCORE_WEIGHTS.expectedValue * evScore + SCORE_WEIGHTS.fit * fit`
    - `score = expectedValue > 0 ? POSITIVE_EV_BASE + POSITIVE_EV_SPAN * raw : NON_POSITIVE_EV_MAX_SCALE * raw`
- **Alternativa descartada:** Ordenar primero por `expectedValue > 0` y luego por `score` en `recommend.service.js` sin cambiar `composite()`. Eso produciría inconsistencias visuales en la UI (una estrategia #1 con `score = 52` sobre una #2 con `score = 74`), además de desalinear `backtest.service.js` si no duplicara la misma lógica de ordenamiento.
- **Ventaja:** Al resolver la separación dentro de `composite()` (función pura compartida por `recommend.service.js` y `backtest.service.js`), el ranking numérico `score` y la barra visual de `0–100` permanecen estrictamente monotónicos y libres de empates artificiales.

### 3. Señalización de `actionable` y consistencia con `backtest.service.js`
- **Decisión:**
  - En `recommend.service.js`, calcular `const actionable = winner.metrics.expectedValue > 0` y exponerlo en la raíz de la respuesta (`actionable`) y en `winner` (`winner.actionable`).
  - Actualizar `explain()` para diferenciar claramente los casos: si `actionable` es `true`, explicar la ventaja; si `actionable` es `false` (todas las candidatas tuvieron `EV <= 0`), señalar explícitamente que no hay ventaja estadística positiva y que la ganadora es solo la menos desfavorable.
  - En `backtest.service.js`, pasar `vol: signals.hv30` a `monteCarlo(...)` manteniendo `legs` con `vol: iv` (`signals.hvLongRun`), de modo que el backtest evalúe el mismo diferencial `IV vs HV30` que el recomendador en vivo.

### 4. Claridad métrica en UI (`web/index.html`) y documentación OpenAPI (`api/src/docs/openapi.js`)
- **Decisión:** En `web/index.html`, separar o rotular con precisión la columna de valor esperado: mostrar `EV ($)` (`signed(x.metrics.expectedValue)`) y como subdato o tooltip la razón `EV / CVaR95`, manteniendo el ordenamiento por `scoreParts.expectedValue` (que es monotónico en `EV / |CVaR95|`). Mostrar un banner/etiqueta de advertencia cuando `d.actionable === false`. Actualizar la descripción de `/strategies/recommend` y `/strategies/recommend/backtest` en `api/src/docs/openapi.js`.

## Risks / Trade-offs

- **[Ruido en `hv30` ante eventos recientes extremos o `hv30` muy baja]** → Mitigación: si `hv30` no es finita (historial insuficiente), `recommend.service.js` cae al promedio de IV de las piernas y lo reporta en `inputs.simulationVolSource`; en `backtest.service.js` se conserva el chequeo `Number.isFinite(signals.hv30) && signals.hv30 > 0`.
- **[Diferencia entre `base` Black-Scholes y `marketCost` (`mid`/spread)]** → Mitigación: documentar como limitación conocida en `recommend.service.js` / `design.md`; al obtener `leg.vol` desde Alpaca (`impliedVolatility`) o invertida desde `mid`, `modelCost` ya aproxima `marketCost` salvo spreads amplios o prima americana temprana.
- **[Cambio en escala numérica de `score` respecto a pruebas unitarias previas]** → Mitigación: actualizar explícitamente las aserciones de `pruebas/unitarias/recomendador.test.js` junto con el cambio en `scoring.js` para verificar la nueva invariante de separación entre `EV > 0` y `EV <= 0`.
