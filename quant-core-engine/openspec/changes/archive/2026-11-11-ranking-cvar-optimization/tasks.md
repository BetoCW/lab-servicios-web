# Tasks

## 1. Actualización de Lógica de Scoring

- [x] 1.1 Actualizar la función pura `composite` en `api/src/lib/scoring.js` para reemplazar `var95` por `cvar95` en el divisor del valor esperado y rebalancear las ponderaciones a 20 % probabilidad, 40 % valor esperado y 40 % fit. Verificar con `node --test pruebas/unitarias/recomendador.test.js`.
- [x] 1.2 Actualizar las pruebas unitarias en `pruebas/unitarias/recomendador.test.js` con las nuevas expectativas matemáticas del composite score y verificar pasando todas las pruebas con `node --test pruebas/unitarias/recomendador.test.js`.

## 2. Inyección de CVaR en Servicios de Recomendación y Backtest

- [x] 2.1 Modificar `api/src/services/recommend.service.js` para extraer `mc.cvar95` e inyectarlo en `composite()`, actualizando la cadena explicativa `method` con las nuevas ponderaciones. Verificar ejecutando la suite unitaria con `npm --prefix pruebas test`.
- [x] 2.2 Modificar `api/src/services/backtest.service.js` para pasar `mc.cvar95` a `composite()` manteniendo consistencia entre recomendación en vivo y backtest histórico. Verificar ejecutando `node --test pruebas/unitarias/recomendador.test.js`.

## 3. Verificación de Integración y Regresión

- [x] 3.1 Ejecutar la suite completa de pruebas unitarias y de integración del proyecto para garantizar cero regresiones con `npm --prefix pruebas test`.
