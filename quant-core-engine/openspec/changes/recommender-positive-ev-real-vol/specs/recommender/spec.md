# Spec Delta

## MODIFIED Requirements

### Requirement: Recomendación optimizada por puntaje multicriterio con CVaR
El sistema SHALL recomendar entre Straddle, Strangle, Calendar y Diagonal para un ticker usando datos reales de Alpaca y el motor cuantitativo, retornando un ranking 0–100 (40 % probabilidad, 30 % EV/CVaR, 30 % fit) donde toda estrategia con valor esperado positivo supere en puntaje a cualquiera con valor esperado no positivo, junto con `categoryWinners` (`byFit`, `byRiskAdjustedReturn`, `byProbability`, `byComposite`) e insignias (`badges`).

#### Scenario: Ponderación de riesgo de cola con CVaR
- **WHEN** se ejecuta el análisis Monte Carlo de una estrategia candidata
- **THEN** la métrica `cvar95` se inyecta en `0.5 + 0.5 * tanh(expectedValue / |cvar95|)` y el puntaje final separa monotónicamente a las candidatas con valor esperado positivo por encima de cualquier candidata con valor esperado menor o igual a cero

#### Scenario: Desglose de líderes por categoría analítica
- **WHEN** un cliente consulta `GET /strategies/recommend?symbol={symbol}`
- **THEN** la respuesta incluye `categoryWinners` identificando la estrategia con mayor `scoreParts.fit`, la de mayor relación EV/CVaR, la de mayor probabilidad de éxito y la ganadora global

#### Scenario: Volatilidad cara frente a la histórica
- **WHEN** la volatilidad implícita ATM supera en más de 10 % a la volatilidad histórica de 30 días
- **THEN** las candidatas de Straddle y Strangle compiten en sus variantes cortas de venta de volatilidad

#### Scenario: Valor esperado no positivo
- **WHEN** ninguna estrategia candidata alcanza un valor esperado mayor a cero
- **THEN** la respuesta marca `actionable: false` y `explanation` señala explícitamente que ninguna candidata tiene ventaja estadística positiva, presentando la primera como la menos desfavorable

### Requirement: Alineación de backtest y calibración histórica
El microservicio de estrategias SHALL evaluar la calibración histórica y el porcentaje de acierto del recomendador simulando las trayectorias Monte Carlo con la volatilidad histórica de 30 días del punto temporal y aplicando el puntaje con `cvar95` y compuerta de valor esperado en intervalos de 5 días hábiles.

#### Scenario: Evaluación de rendimiento histórico
- **WHEN** un cliente consulta `GET /strategies/recommend/backtest?symbol={symbol}`
- **THEN** el sistema aproxima la volatilidad implícita con la volatilidad histórica de largo plazo para valuar las piernas, simula Monte Carlo con la volatilidad histórica de 30 días del punto temporal y reporta `winRatePct` y `avgPnl` de la opción ganadora

### Requirement: Recomendación ordenada por puntaje
El sistema SHALL recomendar entre Straddle, Strangle, Calendar y Diagonal para un ticker usando datos reales de Alpaca y el motor cuantitativo, ordenando de forma monotónica por puntaje 0–100 de modo que ninguna estrategia con valor esperado no positivo venza a otra con valor esperado positivo, y explicando por qué gana la primera.

#### Scenario: Volatilidad cara
- **WHEN** la IV ATM supera en más de 10 % a la volatilidad histórica de 30 días
- **THEN** las candidatas de straddle y strangle son las versiones cortas (vender volatilidad)

#### Scenario: Estrategia con EV positivo frente a otra con EV negativo y mayor probabilidad
- **WHEN** coexisten una candidata con valor esperado positivo y otra con valor esperado menor o igual a cero aunque esta última tenga mayor probabilidad de ganancia o encaje
- **THEN** la candidata con valor esperado positivo obtiene mayor puntaje y ocupa una posición superior en el ranking

#### Scenario: Valor esperado negativo
- **WHEN** todas las candidatas evaluadas obtienen valor esperado menor o igual a cero
- **THEN** la explicación lo declara explícitamente, presenta a la líder como la menos desfavorable (no como ventaja estadística) y marca la recomendación como no operable (`actionable: false`)

## ADDED Requirements

### Requirement: Simulación predictiva con volatilidad realizada
El recomendador SHALL simular las trayectorias futuras del subyacente en Monte Carlo usando la volatilidad histórica realizada de 30 días cuando haya historial suficiente, manteniendo la volatilidad implícita de mercado de cada contrato para su valuación inicial y al horizonte.

#### Scenario: Simulación con historial disponible
- **WHEN** el ticker cuenta con al menos 30 retornos históricos válidos al recomendar
- **THEN** las trayectorias Monte Carlo usan esa volatilidad histórica realizada y el reporte indica que la fuente de volatilidad de simulación fue la volatilidad histórica de 30 días

#### Scenario: Respaldo sin historial suficiente
- **WHEN** no es posible calcular una volatilidad histórica finita para el ticker
- **THEN** la simulación usa como respaldo el promedio de las volatilidades implícitas de las piernas y declara el respaldo utilizado en la metadata de la simulación

### Requirement: Señalización de ventaja operativa y claridad de métricas
La API de recomendación y la interfaz web SHALL distinguir claramente entre recomendaciones con expectativa positiva (`actionable: true`) y escenarios sin ventaja estadística (`actionable: false`), mostrando el valor esperado monetario sin etiquetarlo ambiguamente como cociente `EV/CVaR`.

#### Scenario: Respuesta operable en API
- **WHEN** la estrategia ganadora tiene valor esperado mayor a cero
- **THEN** la respuesta de `GET /strategies/recommend?symbol={symbol}` incluye `actionable: true` en camelCase

#### Scenario: Etiquetado claro en la tabla de ranking
- **WHEN** el usuario visualiza el ranking del recomendador en la interfaz
- **THEN** la columna muestra el encabezado acorde al dato desplegado en dólares (`EV`) o ambos valores explícitos, y destaca una alerta visible cuando `actionable` es falso
