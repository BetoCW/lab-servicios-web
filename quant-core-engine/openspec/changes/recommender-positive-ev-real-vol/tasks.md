# Tasks

## 1. Contrato OpenAPI y especificación de puntaje

- [x] 1.1 Actualizar la documentación OpenAPI de `/strategies/recommend` y `/strategies/recommend/backtest` en `api/src/docs/openapi.js` describiendo la simulación con volatilidad histórica de 30 días, la compuerta de valor esperado positivo y la bandera `actionable`. Verificar ejecutando `node pruebas/contrato/openapi.test.js`.

## 2. Núcleo de puntaje y compuerta de valor esperado (`scoring.js`)

- [x] 2.1 Definir las constantes declarativas (`SCORE_WEIGHTS`, `POSITIVE_EV_BASE`, `POSITIVE_EV_SPAN`, `NON_POSITIVE_EV_MAX_SCALE`) e implementar la escala segmentada monotónica en `composite()` dentro de `api/src/lib/scoring.js` para garantizar que toda estrategia con `expectedValue > 0` supere en puntaje a cualquiera con `expectedValue <= 0`. Verificar actualizando y ejecutando `node --test pruebas/unitarias/recomendador.test.js`.

## 3. Simulación en medida física ($\mathbb{P}$) y servicios de recomendación/backtest

- [x] 3.1 Extender `riskService.analyzeLegs()` en `api/src/services/risk.service.js` para aceptar `query.simulationVol` (usando `hv30` o el promedio de IV de las piernas como respaldo) y exponer `inputs.simulationVolSource` (`'hv30'` o `'iv-avg'`) sin modificar el ABI v100 del motor WASM. Verificar con prueba unitaria en `pruebas/unitarias/recomendador.test.js` ejecutando `npm --prefix pruebas test`.
- [x] 3.2 Actualizar `recommendService.recommend()` y `explain()` en `api/src/services/recommend.service.js` para pasar `simulationVol: marketView.hv30` a `riskService.analyzeLegs()`, exponer `actionable` en la respuesta raíz y en `winner`, y señalar explícitamente cuando ninguna candidata alcanza `EV > 0`. Verificar con prueba unitaria con mocks de Alpaca en `pruebas/unitarias/recomendador.test.js` ejecutando `npm --prefix pruebas test`.
- [x] 3.3 Actualizar `backtestService.run()` en `api/src/services/backtest.service.js` para simular el Monte Carlo de cada ventana usando `vol: signals.hv30` (manteniendo `legs` valuadas con `iv = signals.hvLongRun`) y verificar que las calibraciones/aserciones pasen ejecutando `npm --prefix pruebas test`.

## 4. Interfaz web (`web/index.html`)

- [x] 4.1 Corregir la columna de la tabla de ranking en `web/index.html` para etiquetar explícitamente `EV ($)` (con relación `EV / CVaR95` en tooltip o subtítulo) y mostrar un aviso claro cuando `actionable === false`. Verificar inspeccionando el renderizado del recomendador y ejecutando `npm --prefix pruebas test`.

## 5. Verificación integral del slice

- [x] 5.1 Ejecutar la suite completa de pruebas unitarias, contrato y validación OpenSpec (`npm --prefix pruebas test`, `node pruebas/contrato/openapi.test.js`, `openspec validate recommender-positive-ev-real-vol`) asegurando 0 fallos.
