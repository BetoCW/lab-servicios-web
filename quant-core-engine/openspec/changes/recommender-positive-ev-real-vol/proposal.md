# Proposal

## Why

El recomendador actual evalúa las estrategias candidatas simulando el precio futuro del subyacente bajo medida neutral al riesgo ($\mathbb{Q}$) con el promedio de la volatilidad implícita (IV) de las piernas, en lugar de usar la volatilidad histórica realizada (`hv30`). Por construcción de Black-Scholes, eso borra la ventaja estadística cuando `IV > HV` (estrategias cortas de crédito terminan con valor esperado negativo por carry) y permite que `composite()` corone como #1 a estrategias con `EV ≤ 0` gracias a su alta probabilidad de ganancia o encaje, contradiciendo el filtro de `autoTrade` que exige `expectedValue > 0`.

## What Changes

- **Simulación en medida física ($\mathbb{P}$) para predicción de P&L**: En el flujo del recomendador (`recommend.service.js`) y en el backtest (`backtest.service.js`), pasar la volatilidad histórica realizada (`hv30`, con respaldo al promedio de IV si falta historial) como parámetro `vol` de la simulación Monte Carlo manteniendo la IV de mercado por pierna para la valuación inicial y al horizonte; esto permite que la brecha `IV vs HV` se refleje en `expectedValue`, `probProfit` y `cvar95` sin alterar el ABI v100 del motor WASM.
- **Compuerta de valor esperado positivo en el puntaje (`scoring.js`)**: Modificar `composite()` para comprimir monotónicamente el puntaje de estrategias con `expectedValue <= 0` en un tramo inferior estricto (`[0, 30)`) respecto a cualquier estrategia con `expectedValue > 0` (`(40, 100]`), garantizando que ninguna técnica con expectativa negativa gane cuando exista al menos una con `EV > 0`.
- **Señalización explícita de ausencia de ventaja (`actionable`)**: Exponer en `GET /strategies/recommend` si la estrategia líder tiene expectativa positiva (`actionable: boolean`, propagado en el bloque del ganador/ranking) y actualizar `explanation` y la UI (`web/index.html`) para advertir cuando ninguna candidata alcanza `EV > 0`.
- **Alineación de encabezado y métricas en la interfaz (`web/index.html`)**: Corregir la columna hoy rotulada `EV/CVaR` (que imprime `expectedValue` en dólares) para mostrar claramente el valor esperado en dólares y/o el cociente `EV / CVaR95`, evitando lecturas ambiguas.
- **Calibración consistente en `backtest.service.js`**: Simular el Monte Carlo de cada ventana histórica usando `signals.hv30` (en lugar de `signals.hvLongRun`, que representa la IV aproximada) para evaluar el poder predictivo real del recomendador.

## Capabilities

### New Capabilities
<!-- Sin capacidades nuevas: los cambios amplían y corrigen requisitos existentes de recomendación y calibración. -->

### Modified Capabilities
- `recommender`: Actualiza los requisitos de simulación predictiva con volatilidad realizada (`hv30`), priorización estricta de `expectedValue > 0` sobre `expectedValue <= 0` en el puntaje `0–100`, bandera `actionable` cuando ninguna estrategia tiene ventaja positiva y alineación del backtest con `hv30`.

## Impact

- **Contratos y API (`GET /strategies/recommend`, `GET /strategies/recommend/backtest`, OpenAPI)**: Campos aditivos compatibles hacia atrás (`actionable` y origen de volatilidad de simulación en la respuesta; descripción actualizada en `api/src/docs/openapi.js`).
- **Core / Servicios (`api/src/lib/scoring.js`, `api/src/services/risk.service.js`, `api/src/services/recommend.service.js`, `api/src/services/backtest.service.js`)**: Composición de funciones puras sin cambios en el binario Rust/WASM ni migraciones en Supabase.
- **Interfaz (`web/index.html`)**: Claridad en la columna `EV` / `EV/CVaR` y aviso visible cuando `actionable === false`.
- **Pruebas (`pruebas/unitarias/recomendador.test.js`)**: Actualización de aserciones unitarias sobre `composite()` para reflejar la separación de tramos `EV > 0` vs `EV <= 0`, la propagación de `simulationVol` y el estado `actionable`.
