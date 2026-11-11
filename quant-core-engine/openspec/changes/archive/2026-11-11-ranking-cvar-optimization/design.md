# Design: Optimización de Ranking Cuantitativo con CVaR y Rebalanceo de Pesos

## Context

El motor Rust/WASM (`@core/quant-engine`, `engine/src/risk.rs`) ya calcula internamente el $\text{CVaR}_{95\%}$ (`cvar95`, Expected Shortfall) en cada simulación Monte Carlo junto a la media y la varianza, empaquetándolo en el arreglo de salida de estadísticas. Sin embargo, en la capa de servicios Node.js (`api/src/lib/scoring.js` y `services/recommend.service.js`), la función `composite()` consumía únicamente `var95` para el divisor del valor esperado y aplicaba ponderaciones $0.40$ (probabilidad), $0.30$ (EV/VaR) y $0.30$ (fit). Ver `proposal.md` para la justificación empírica completa.

## Goals / Non-Goals

**Goals:**
- Actualizar la firma e implementación de `composite({ probProfit, expectedValue, cvar95, fit })` en `lib/scoring.js` para reemplazar `var95` por `cvar95`.
- Rebalancear las ponderaciones del score compuesto a: $20\%$ probabilidad, $40\%$ valor esperado relativo al $\text{CVaR}$, y $40\%$ encaje de mercado.
- Modificar `recommend.service.js` y `backtest.service.js` para extraer `mc.cvar95` y suministrarlo a `composite()`.
- Actualizar las pruebas unitarias en `pruebas/unitarias/recomendador.test.js` para validar la nueva calibración.

**Non-Goals:**
- Modificar el layout de memoria FFI o la firma WASM de `monteCarlo` en Rust (el valor `cvar95` ya se computa y expone en el índice correspondiente del buffer).
- Modificar la interfaz REST pública ni alterar contratos de entrada de los clientes (los payloads de salida siguen siendo idénticos en estructura camelCase).
- Alterar las 4 reglas del filtro de ejecución automática en `autoTrade.service.js` (mantienen sus umbrales de capital y riesgo).

## Decisions

### 1. Sustituir VaR95 por CVaR95 en la función tanh
* **Decisión:** $\text{evScore} = 0.5 + 0.5 \cdot \tanh\left(\frac{\text{expectedValue}}{\max(|\text{cvar95}|, 1)}\right)$.
* **Razón:** El $\text{VaR}_{95\%}$ solo indica la pérdida en el percentil 5, ignorando la severidad de las pérdidas en la cola izquierda extrema. El $\text{CVaR}_{95\%}$ calcula el promedio de las pérdidas cuando se supera el $\text{VaR}$, penalizando fuertemente a opciones descubiertas que pueden causar pérdidas catastróficas.
* **Alternativa descartada:** Usar $\text{VaR}_{99\%}$. Se descartó porque sigue siendo una medida puntual de percentil y no refleja la pérdida esperada condicional de cola como el $\text{CVaR}$.

### 2. Ponderación 20% Probabilidad / 40% EV-CVaR / 40% Fit
* **Decisión:** Asignar $20\%$ a `probProfit`, $40\%$ a `evScore` y $40\%$ a `fit`.
* **Razón:** En el benchmark empírico sobre 300 muestras de mercado (AAPL, SPY, NVDA, TSLA, MSFT), esta combinación generó un aumento neto del $+12.78\%$ en P&L frente al $40/30/30$ original, evitando la trampa de venta de volatilidad excesiva en activos de alta beta.
* **Alternativa descartada:** Eliminar completamente `probProfit`. Se descartó porque la probabilidad de éxito sigue siendo una señal intuitiva valiosa para los usuarios si está equilibrada con la magnitud del pago.

## Risks / Trade-offs

* **[Risk]** Disminución ligera de la tasa de aciertos superficial (Win Rate) en mercados extremadamente calmos.
  * **Mitigation:** El backtest demostró que la ligera baja en Win Rate ($59.6\%$ vs $61.6\%$) se compensa con creces con una ganancia monetaria acumulada significativamente superior (+12.78%), al evitar pérdidas desproporcionadas.
* **[Risk]** Inconsistencia en pruebas unitarias existentes con valores esperados hardcodeados.
  * **Mitigation:** Actualizar los tests unitarios en `pruebas/unitarias/recomendador.test.js` para asegurar que las aserciones validen la nueva fórmula y sus invariantes numéricos.
