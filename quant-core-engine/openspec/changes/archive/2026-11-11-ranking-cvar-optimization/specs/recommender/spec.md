# recommender

## Purpose

Permite evaluar, comparar y recomendar sistemáticamente estrategias cuantitativas de opciones financieras (Straddle, Strangle, Calendar y Diagonal) ordenadas por un puntaje multicriterio que balancea probabilidad, valor esperado ajustado al riesgo de cola (CVaR) y encaje con el régimen de mercado.

## ADDED Requirements

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
