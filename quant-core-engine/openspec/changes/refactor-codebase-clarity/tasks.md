# Tasks: Refactorización y Claridad del Código en Quant Core Engine

## 1. Capa Base y Motor Numérico (WASM / Libs)

- [x] 1.1 Declarar constantes de offset simbólico en `engine/src/lib.rs` (`OFFSET_KIND`, `OFFSET_SPOT`, `OFFSET_STRIKE`, `OFFSET_T`, `OFFSET_RATE`, `OFFSET_DIV`, `OFFSET_PARAM`) y verificar consistencia de firma FFI.
- [x] 1.2 Refactorizar `packages/quant-engine/index.js` para documentar la asignación en memoria lineal con JSDoc y renombrar identificadores genéricos (`p` -> `pointer`, `out` -> `outputPointer`, `outLen` -> `outputLength`, `last` -> `trailingMetricKey`). Verificar con `npm --prefix pruebas test -- unitarias/motor.test.js`.
- [x] 1.3 Refactorizar `api/src/lib/indicators.js` renombrando parámetros de una letra (`n` -> `period`, `d` -> `priceDifference`, `w` -> `windowSlice`, `sd` -> `standardDeviation`, `k` -> `smoothingMultiplier`) y documentando convenciones de calentamiento nulo. Verificar con `npm --prefix pruebas test -- unitarias/indicadores.test.js`.
- [x] 1.4 Documentar el regex OCC y grupos de captura en `api/src/lib/occ.js`. Verificar con `npm --prefix pruebas test -- unitarias/api.test.js`.

## 2. Enrutamiento y Capa de Microservicios

- [x] 2.1 Refactorizar `api/src/routes/index.js` reemplazando los enrutadores de un solo carácter (`w`, `o`, `c`, `s`, `m`, `a`) por nombres declarativos (`watchlistsRouter`, `ordersRouter`, `optionChainsRouter`, `strategiesRouter`, `marketRouter`, `accountRouter`) manteniendo intacto el objeto exportado `routers`. Verificar con `npm --prefix pruebas test -- unitarias/api.test.js`.
- [x] 2.2 Clarificar el proxy HTTP y manejo de errores de microservicios en `api/src/microservices/index.js` expandiendo nombres de variables locales (`r` -> `microserviceResponse`, etc.). Verificar con `npm --prefix pruebas test -- unitarias/api.test.js`.

## 3. Servicios de Negocio y Dominio

- [x] 3.1 Refactorizar `api/src/services/risk.service.js` expandiendo variables matemáticas y desestructuraciones anidadas (`c` -> `contract`, `s` -> `snapshot`, `q` -> `quote`, `t` -> `timeToExpiryYears`, `l` -> `leg`, `g` -> `legGreeks`, `k` -> `greekMetric`) y documentando la agregación de Monte Carlo y márgenes. Verificar con `npm --prefix pruebas test -- unitarias/motor.test.js`.
- [x] 3.2 Refactorizar `api/src/services/optionChains.service.js` clarificando parámetros de transformación DTO (`c` -> `chainRow`, `r` -> `quoteRow`) e iteración por lotes de 500 inserciones. Verificar con `npm --prefix pruebas test -- unitarias/api.test.js`.
- [x] 3.3 Refactorizar `api/src/services/orders.service.js` y `api/src/services/strategies.service.js` clarificando alias de variables en serialización (`o` -> `orderRow`, `s` -> `strategyRow`, `l` -> `legRow`) y validación de órdenes multi-leg. Verificar con `npm --prefix pruebas test -- unitarias/api.test.js`.
- [x] 3.4 Refactorizar funciones de selección en `web/templates.js` (`closest`, `byDelta`, `covers`) reemplazando nombres crípticos (`f` -> `metricSelector`, `e` -> `expirationDate`, `k` -> `strikesForExpiration`). Verificar con `npm --prefix pruebas test -- unitarias/plantillas.test.js`.

## 4. Verificación Integral y Suite de Regresión

- [x] 4.1 Ejecutar la suite completa de pruebas unitarias (`npm --prefix pruebas test`) y confirmar que los 27 tests continúan pasando al 100% sin advertencias ni regresiones de contrato.
