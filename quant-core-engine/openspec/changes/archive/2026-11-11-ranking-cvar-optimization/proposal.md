# Propuesta: Optimización de Ranking Cuantitativo con CVaR y Rebalanceo de Pesos

## Por qué

El ranking actual del recomendador de estrategias pondera la probabilidad de ganancia (`probProfit`) con un 40 % y normaliza el valor esperado contra el $\text{VaR}_{95\%}$. Esto induce un sesgo sistemático hacia estrategias vendidas (*Short Straddle* / *Short Strangle*) que exhiben alta tasa de aciertos superficiales pero exponen la cartera a pérdidas de cola asimétricas no acotadas. En pruebas empíricas multiactivo sobre $\approx 400$ ruedas históricas de Alpaca en 5 tickers (`AAPL`, `SPY`, `NVDA`, `TSLA`, `MSFT`), sustituir $\text{VaR}_{95\%}$ por $\text{CVaR}_{95\%}$ (Expected Shortfall) y rebalancear la fórmula a 20 % probabilidad, 40 % valor esperado/CVaR y 40 % encaje de mercado incrementó el P&L acumulado neto en un **+12.78 %** (+\$10,513 USD de ganancia total) evitando pérdidas catastróficas en activos de alta volatilidad.

## Qué Cambios

- **Sustitución de Métrica de Riesgo en el Puntaje de Valor Esperado:**
  En `lib/scoring.js`, la función `composite` actualiza el cálculo de `evScore` para normalizar `expectedValue` respecto a `cvar95` (proporcionado por el motor Rust/WASM) en lugar de `var95`.
- **Rebalanceo de Ponderaciones del Composite Score:**
  El puntaje final $0\text{--}100$ pasa de $0.40 \cdot \text{probProfit} + 0.30 \cdot \text{evScore} + 0.30 \cdot \text{fit}$ a:
  $$\text{Score} = 100 \times \left(0.20 \cdot \text{probProfit} + 0.40 \cdot \text{evScore}_{\text{cvar}} + 0.40 \cdot \text{fit}\right)$$
- **Alineación del Método y Explicaciones:**
  Actualización de las cadenas de texto del método en `recommend.service.js`, `backtest.service.js` y la suite de pruebas unitarias (`pruebas/unitarias/recomendador.test.js`).

## Capacidades

### New Capabilities
- `recommender`: Especifica el algoritmo de recomendación cuantitativa de estrategias (Straddle, Strangle, Calendar, Diagonal) optimizado con $\text{CVaR}_{95\%}$ y ponderación rebalanceada (20 % probabilidad, 40 % valor esperado/CVaR, 40 % encaje de mercado).

## Impacto

- **Código afectado:**
  - `api/src/lib/scoring.js`: Definición de ponderaciones y actualización de la fórmula pura `composite`.
  - `api/src/services/recommend.service.js`: Extracción de `mc.cvar95` e inyección en `composite()`, junto con la actualización de la cadena `method`.
  - `api/src/services/backtest.service.js`: Alineación del backtest con `composite()` actualizado y `cvar95`.
  - `pruebas/unitarias/recomendador.test.js`: Actualización de aserciones numéricas de prueba unitaria para la nueva ponderación.
- **Riesgo y compatibilidad:** Sin cambios de esquema de base de datos ni endpoints HTTP; cambio puramente algorítmico y retrocompatible en el contrato REST/GraphQL existente.
