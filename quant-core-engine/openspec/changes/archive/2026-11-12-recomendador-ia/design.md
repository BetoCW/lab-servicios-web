# Design: recomendador-ia

## Context

Ver `proposal.md`. El sistema busca proveer recomendaciones cuantitativas entre 4 plantillas de opciones (Straddle, Strangle, Calendar, Diagonal), cálculo de riesgo extendido (VaR, CVaR, drawdown, Sharpe, Sortino, beta, estrés e intervalos de confianza), calibración mediante backtest histórico y validación de riesgo asistida por IA mediante OpenRouter antes de emitir órdenes en Alpaca Paper.

## Goals / Non-Goals

**Goals:**
- Evaluar plantillas de opciones sistemáticamente con el motor Rust/WASM (`@core/quant-engine`).
- Exponer métricas de riesgo extendido calculadas sobre cierres históricos y simulaciones Monte Carlo.
- Aislar el servicio de IA en un microservicio desacoplado (`ai` en puerto 3065) con tolerancia a fallos.
- Establecer un filtro estricto de riesgo y validación previa en `POST /strategies/auto`.
- Proveer un endpoint de backtest (`GET /strategies/recommend/backtest`) con tabla de calibración por tramos de probabilidad.

**Non-Goals:**
- Ejecutar órdenes en cuentas reales (restringido estrictamente a Alpaca Paper Trading).
- Contratar feeds de volatilidad implícita histórica de pago (se aproxima con la volatilidad histórica de 30 días, declarada en la respuesta).

## Decisions

### 1. Fórmulas estadísticas puras desacopladas en `lib/stats.js`
- **Decisión**: Implementar retorno logarítmico, volatilidad anualizada ($\times \sqrt{252}$), VaR/CVaR históricos, drawdown máximo, Sharpe, Sortino, beta e intervalos de confianza del 95 % en funciones puras sin dependencias de I/O o base de datos.
- **Razón**: Facilita pruebas unitarias deterministas contra valores numéricos conocidos y permite su reutilización tanto en `riskExtended.service.js` como en `backtest.service.js`.

### 2. Microservicio independiente `ai` (:3065) con fallback de modelos
- **Decisión**: Crear un microservicio Express 5 dedicado (`api/src/services/ai.service.js`) expuesto en el puerto 3065, registrado en `microservices/index.js` y `docker-compose.yml`.
- **Razón**: Aísla la latencia y fallos potenciales de la API de OpenRouter del resto de los microservicios críticos (market data, órdenes).
- **Estrategia de respaldo**: Modelo principal (`openrouter/free` o configurado) con fallback automático ante errores 429 o timeouts. Si no hay API key o la red está caída, responde `{ verdict: 'unavailable' }` con HTTP 200, evitando caídas del sistema.

### 3. Pipeline de doble filtro en `autoTrade`
- **Decisión**: El flujo de `POST /strategies/auto` ejecuta secuencialmente:
  1. Recomendación cuantitativa (selección de ganadora).
  2. Filtro estricto de riesgo: prob $\ge 40\%$, valor esperado $> 0$, VaR $95\% \le 5\%$ del equity, margen requerido $\le$ poder de compra.
  3. Validación de IA: llamada a `/ai/validate-risk` (requiere veredicto `approved`).
  4. Envío de orden a Alpaca PAPER (con bypass seguro en caso de `dryRun: true`).
- **Razón**: Previene la toma de posiciones de alto riesgo o ejecuciones no intencionales.

## Risks / Trade-offs

- **[Latencia y límites de tasa en OpenRouter]** → *Mitigación*: Modelo secundario de respaldo y degradación elegante a `verdict: 'unavailable'`.
- **[Falta de IV histórica en Alpaca gratuito]** → *Mitigación*: El servicio de backtest utiliza la volatilidad histórica de largo plazo como estimador de la IV pasada y lo declara explícitamente en el campo `limitation`.
- **[Sobrecarga computacional en Monte Carlo]** → *Mitigación*: Las simulaciones se procesan en lotes en memoria Rust/WASM sin cruces individuales de FFI por pierna.
