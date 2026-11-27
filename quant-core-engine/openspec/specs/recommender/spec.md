# recommender Specification

## Purpose

Permite evaluar, comparar y recomendar sistemáticamente estrategias cuantitativas de opciones financieras (Straddle, Strangle, Calendar y Diagonal) ordenadas por un puntaje multicriterio que balancea probabilidad, valor esperado ajustado al riesgo de cola (CVaR) y encaje con el régimen de mercado.

## Requirements

### Requirement: Recomendación optimizada por puntaje multicriterio con CVaR
El sistema SHALL recomendar entre Straddle, Strangle, Calendar y Diagonal para un ticker usando datos reales de Alpaca y el motor Rust/WASM, retornando un ranking 0–100 (40 % probabilidad, 30 % EV/CVaR, 30 % fit), un desglose explícito de líderes por metodología (`categoryWinners: { byFit, byRiskAdjustedReturn, byProbability, byComposite }`) e insignias (`badges`) en cada fila del ranking con las categorías que lidera.

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

### Requirement: Alineación de backtest y calibración histórica
El microservicio de estrategias SHALL evaluar la calibración histórica y el porcentaje de acierto del recomendador utilizando la función de puntaje con `cvar95` en intervalos de 5 días hábiles a lo largo del historial disponible.

#### Scenario: Evaluación de rendimiento histórico
- **WHEN** un cliente consulta `GET /strategies/recommend/backtest?symbol={symbol}`
- **THEN** el sistema evalúa cada punto temporal con las ponderaciones 40 % probabilidad, 30 % valor esperado/CVaR y 30 % encaje, reportando `winRatePct` y `avgPnl` de la opción ganadora

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
# Cores seleccionables

El recomendador admite `cores` en REST (lista separada por comas), GraphQL
(arreglo) y ejecución automática (arreglo). Valores: `technical`, `probability`,
`risk`, `ai`, `news`, `liquidity`. Por defecto usa los tres primeros, conservando el
puntaje anterior. Los pesos 30/40/30/30/20/20 se normalizan entre los seleccionados;
la compuerta de EV positivo solo participa con `risk`. Las métricas cuantitativas son
insumos compartidos, incluso al usar únicamente IA.

- Dado un conjunto vacío o desconocido, cuando se solicita análisis, entonces
  devuelve 400 antes de consultar proveedores.
- Dado solo IA, cuando se analizan estrategias, entonces se consideran las seis
  variantes (compra/venta de straddle y strangle, calendar y diagonal), sin filtro
  técnico; approved/caution/rejected aportan 1/0.5/0 al puntaje y cada resultado
  conserva motivo y modelo. Si IA está indisponible, no se sustituye por otro core.
- Dados cores sin IA, cuando se recomienda, entonces no se consulta OpenRouter.
- Dados conjuntos distintos, cuando se consultan con caché, entonces no comparten
  resultados. El orden o duplicación de cores no cambia la clave.
- Dada una selección modificada mientras hay una petición en curso, cuando llega
  la respuesta anterior, entonces la pantalla la descarta.
- Dado backtest con IA, entonces devuelve 400 indicando que no hay veredictos
  históricos; con cores cuantitativos respeta sus votos y candidatos.
- Dada ejecución automática, entonces usa los cores elegidos para el ranking,
  manteniendo obligatorios los filtros de seguridad de riesgo e IA al operar.

### Requirement: Core Liquidez y ejecución

Con `liquidity`, cada estrategia incluye `execution` calculado con los snapshots ya
consultados (bid/ask, tamaños y antigüedad por pierna), sin llamadas adicionales.
El costo de entrada vs. mid es `Σ (ask-bid)/2 × ratio × 100`; el escenario de cierre
supone el mismo spread. Comisiones (`EXECUTION_COMMISSION_PER_CONTRACT`), antigüedad
máxima (`EXECUTION_MAX_QUOTE_AGE_SECONDS`) y deslizamiento (`EXECUTION_SLIPPAGE_BPS`)
son configurables. `expectedAfterCosts` = EV del modelo − costo estimado.

- Dado `liquidity`, cuando se rankea, entonces el componente de riesgo y su compuerta
  usan `expectedAfterCosts`; `metrics.expectedValue`, probabilidad y VaR permanecen
  antes de costos.
- Dado bid/ask ausente, cruzado o con bid cero, entonces `status = unavailable`,
  costos nulos y puntaje 0.
- Dadas cotizaciones antiguas, tamaños insuficientes, comisiones sin configurar o feed
  distinto de `opra`, entonces el puntaje de liquidez se limita a 0.5, `ready = false`
  y la estrategia no es `actionable`.
- Dada ejecución automática con `liquidity`, entonces se vuelven a consultar snapshots
  después de IA y no se envía la orden si `ready` es falso o el escenario deja de ser positivo.
- Dado backtest con `liquidity`, entonces devuelve 400: no hay bid/ask históricos.
