# Tasks

## 1. Backend: Desglose Multicriterio

- [x] 1.1 Extender `api/src/services/recommend.service.js` para calcular `categoryWinners` (`byFit`, `byRiskAdjustedReturn`, `byProbability`, `byComposite`) y asignar `badges` a cada fila de `ranking`. Verificar con `node --test pruebas/unitarias/recomendador.test.js`.

## 2. Frontend: Matriz Multicriterio e Interactividad

- [x] 2.1 Rediseñar el panel `#recOut` en `web/index.html` para desplegar las 3 tarjetas de líderes por escuela metodológica (`categoryWinners`) con su filosofía de análisis explicada.
- [x] 2.2 Desglosar las columnas en `#recTable` (`Fit %`, `EV/CVaR`, `PoP %`, `Insignias`) e implementar la lógica de ordenamiento dinámico por clic en encabezado de columna.

## 3. Verificación de Integración y Regresión

- [x] 3.1 Ejecutar la suite completa de pruebas unitarias, de contrato y de integración para asegurar cero regresiones con `npm --prefix pruebas test`.
