# Propuesta: recomendador de estrategias con riesgo extendido e IA

## Por qué
El profe pidió que el sistema recomiende la mejor estrategia (Straddle, Strangle, Calendar o Diagonal),
mida mejor el riesgo, diga qué tan confiable es la probabilidad que anuncia y valide el riesgo con una IA
de código abierto, con un botón que opere en automático solo cuando todo está en orden.

## Qué cambia
- `GET /strategies/recommend?symbol=` evalúa las 4 plantillas con datos reales de Alpaca y el motor Rust,
  las ordena por puntaje y explica por qué gana la primera. El modo manual (elegir una plantilla) se conserva.
- `GET /strategies/{id}/risk` y la recomendación incluyen el bloque `extended`: VaR y CVaR (histórico y
  Monte Carlo), drawdown máximo, Sharpe/Sortino, beta contra SPY, estrés de ±2σ y caída de IV, e
  intervalos de confianza del 95 %.
- `GET /strategies/recommend/backtest?symbol=` mide el % de acierto histórico y la calibración.
- Microservicio nuevo `ai` (:3065): `POST /ai/validate-risk` con OpenRouter (modelos gratuitos de código
  abierto con respaldo). Sin llave o sin red responde `unavailable` y no bloquea al resto.
- `POST /strategies/auto` y el botón **Ejecutar automático**: recomienda → filtro de riesgo → IA → orden
  en Alpaca PAPER solo si pasan ambos. Siempre muestra el aviso de que no garantiza ganancias.

## Impacto
- Specs: nueva capacidad `recommender`.
- Código: `api/src/lib/stats.js`, `lib/scoring.js`, `services/{recommend,riskExtended,backtest,ai,autoTrade}.service.js`,
  `routes/index.js`, `microservices/index.js`, `web/index.html` (pestaña Recomendador), `docker-compose.yml`.
- Riesgos: la IV histórica no existe en el plan gratuito de Alpaca, por eso el backtest la aproxima con la
  volatilidad histórica de largo plazo (se declara en la respuesta). La IA gratuita puede devolver 429.
