# recommender Specification

## Purpose

Permite evaluar, comparar y recomendar sistemáticamente estrategias cuantitativas de opciones financieras (Straddle, Strangle, Calendar y Diagonal) ordenadas por un puntaje multicriterio que balancea probabilidad, valor esperado ajustado al riesgo de cola (CVaR) y encaje con el régimen de mercado.

## Requirements

### Requirement: Recomendación optimizada por puntaje multicriterio con CVaR
El sistema SHALL recomendar entre Straddle, Strangle, Calendar y Diagonal para un ticker usando datos reales de Alpaca y el motor Rust/WASM, ordenando por un puntaje 0–100 compuesto por 20 % probabilidad de ganancia, 40 % valor esperado ajustado al $\text{CVaR}_{95\%}$ y 40 % encaje con el régimen de mercado, explicando por qué gana la primera.

#### Scenario: Ponderación de riesgo de cola con CVaR
- **WHEN** se ejecuta el análisis Monte Carlo de una estrategia candidata
- **THEN** la métrica `cvar95` del motor se inyecta en el cálculo del puntaje de valor esperado normalizado mediante función tangente hiperbólica: `0.5 + 0.5 * tanh(expectedValue / cvar95)`

#### Scenario: Volatilidad cara frente a la histórica
- **WHEN** la volatilidad implícita ATM supera en más de 10 % a la volatilidad histórica de 30 días
- **THEN** las candidatas de Straddle y Strangle compiten en sus variantes cortas de venta de volatilidad

#### Scenario: Valor esperado no positivo
- **WHEN** la estrategia con mayor puntaje tiene un valor esperado menor o igual a cero
- **THEN** el campo `explanation` lo señala explícitamente y la etiqueta como la menos desfavorable entre las candidatas

### Requirement: Alineación de backtest y calibración histórica
El microservicio de estrategias SHALL evaluar la calibración histórica y el porcentaje de acierto del recomendador utilizando la función de puntaje rebalanceada con `cvar95` en intervalos de 5 días hábiles a lo largo del historial disponible.

#### Scenario: Evaluación de rendimiento histórico
- **WHEN** un cliente consulta `GET /strategies/recommend/backtest?symbol={symbol}`
- **THEN** el sistema evalúa cada punto temporal con las ponderaciones 20 % probabilidad, 40 % valor esperado/CVaR y 40 % encaje, reportando `winRatePct` y `avgPnl` de la opción ganadora

### Requirement: Recomendación ordenada por puntaje
El sistema SHALL recomendar entre Straddle, Strangle, Calendar y Diagonal para un ticker usando datos reales de Alpaca y el motor Rust/WASM, ordenando por un puntaje 0–100 (40 % probabilidad de ganancia, 30 % valor esperado frente al riesgo, 30 % encaje con el mercado) y explicando por qué gana la primera.

#### Scenario: Volatilidad cara
- **WHEN** la IV ATM supera en más de 10 % a la volatilidad histórica de 30 días
- **THEN** las candidatas de straddle y strangle son las versiones cortas (vender volatilidad)

#### Scenario: Valor esperado negativo
- **WHEN** la estrategia ganadora tiene valor esperado ≤ 0
- **THEN** la explicación lo dice y la presenta como "la menos mala", no como ventaja estadística

### Requirement: Riesgo extendido
El reporte de riesgo SHALL incluir VaR y CVaR al 95 % (histórico y Monte Carlo) en pérdida positiva, drawdown máximo, Sharpe y Sortino, beta contra SPY, escenarios de ±2σ con caída de IV e intervalos de confianza del 95 % para la media, el rango del P&L y la probabilidad de ganancia.

#### Scenario: Sin historial
- **WHEN** Alpaca no entrega velas diarias
- **THEN** el reporte base se devuelve igual y `extended` es `null`

### Requirement: Backtest y calibración
El sistema SHALL reportar el % de veces que la primera opción habría ganado a 30 días y comparar la probabilidad anunciada con la frecuencia real por tramos, declarando que la IV histórica se aproxima.

#### Scenario: Evaluación de calibración histórica
- **WHEN** un cliente consulta `GET /strategies/recommend/backtest?symbol={symbol}`
- **THEN** el sistema evalúa ventanas históricas cada 5 días hábiles, reporta `topPick` con `winRatePct` y `avgPnl`, la tabla de calibración por tramos y declara la aproximación de IV histórica en `limitation`

### Requirement: Validación de riesgo con IA
El sistema SHALL exponer `POST /ai/validate-risk` en el servicio `ai` (:3065) que devuelva `approved`, `caution` o `rejected` con justificación usando OpenRouter.

#### Scenario: IA no disponible
- **WHEN** falta la llave, falla la red o los modelos responden 429
- **THEN** responde `200` con `verdict = "unavailable"` y el resto del sistema no se bloquea

### Requirement: Ejecución automática segura
`POST /strategies/auto` SHALL enviar la orden a Alpaca PAPER únicamente si la ganadora cumple el filtro de riesgo (prob. ≥ 40 %, valor esperado > 0, VaR 95 % ≤ 5 % del capital, margen ≤ poder de compra) y la IA responde `approved`.

#### Scenario: IA no disponible
- **WHEN** la IA responde `unavailable`
- **THEN** no se envía ninguna orden

#### Scenario: Simulación
- **WHEN** `dryRun = true`
- **THEN** se calculan ambos filtros pero no se envía ninguna orden
