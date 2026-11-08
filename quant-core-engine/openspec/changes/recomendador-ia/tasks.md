# Tareas: recomendador-ia

- [x] 1. Fórmulas de riesgo puras (`lib/stats.js`) con pruebas de valores conocidos
- [x] 2. Señales de mercado y puntaje (`lib/scoring.js`)
- [x] 3. Riesgo extendido: VaR/CVaR, drawdown, Sharpe/Sortino, beta, estrés, intervalos (`riskExtended.service.js`)
- [x] 4. Refactor de `riskService`: `analyzeLegs` sin base de datos para evaluar plantillas
- [x] 5. Recomendador `GET /strategies/recommend` con explicación
- [x] 6. Backtest histórico y calibración
- [x] 7. Microservicio `ai` con OpenRouter, modelo de respaldo y modo "sin validación"
- [x] 8. `POST /strategies/auto` con filtro de riesgo + IA, solo Alpaca paper
- [x] 9. Front: pestaña Recomendador, riesgo extendido, intervalo del 95 % y botón con aviso
- [x] 10. OpenAPI/Swagger y GraphQL actualizados; compose y Prometheus con el servicio `ai`
- [x] 11. Pruebas: stats, recomendador, filtro de riesgo, IA con y sin red
