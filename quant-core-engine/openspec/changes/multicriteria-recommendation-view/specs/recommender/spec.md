# recommender

## MODIFIED Requirements

### Requirement: Recomendación optimizada por puntaje multicriterio con CVaR
El sistema SHALL recomendar entre Straddle, Strangle, Calendar y Diagonal para un ticker usando datos reales de Alpaca y el motor Rust/WASM, retornando un ranking 0–100 (20 % probabilidad, 40 % EV/CVaR, 40 % fit), un desglose explícito de líderes por metodología (`categoryWinners: { byFit, byRiskAdjustedReturn, byProbability, byComposite }`) e insignias (`badges`) en cada fila del ranking con las categorías que lidera.

#### Scenario: Ponderación de riesgo de cola con CVaR
- **WHEN** se ejecuta el análisis Monte Carlo de una estrategia candidata
- **THEN** la métrica `cvar95` del motor se inyecta en el cálculo del puntaje de valor esperado normalizado mediante función tangente hiperbólica: `0.5 + 0.5 * tanh(expectedValue / cvar95)`

#### Scenario: Desglose de líderes por categoría analítica
- **WHEN** un cliente consulta `GET /strategies/recommend?symbol={symbol}`
- **THEN** la respuesta incluye `categoryWinners` identificando la estrategia con mayor `scoreParts.fit`, la de mayor relación EV/CVaR, la de mayor probabilidad de éxito y la ganadora global

#### Scenario: Volatilidad cara frente a la histórica
- **WHEN** la volatilidad implícita ATM supera en más de 10 % a la volatilidad histórica de 30 días
- **THEN** las candidatas de Straddle y Strangle compiten en sus variantes cortas de venta de volatilidad

#### Scenario: Valor esperado no positivo
- **WHEN** la estrategia con mayor puntaje tiene un valor esperado menor o igual a cero
- **THEN** el campo `explanation` lo señala explícitamente y la etiqueta como la menos desfavorable entre las candidatas
