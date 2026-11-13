# Propuesta: Vista de Recomendación Multicriterio

## Por qué

Actualmente la interfaz de recomendación aglutina todos los análisis en un único puntaje compuesto global ($0\text{--}100$), ocultando qué técnica recomienda cada escuela analítica independiente (Análisis Técnico/Régimen, Asimetría Monte Carlo EV/CVaR, y Frecuencia de Probabilidad). El usuario no puede contrastar los resultados de cada método para decidir en cuál confiar al momento de seleccionar su estrategia.

## Qué Cambios

- **Enriquecimiento del Contrato de Recomendación (`categoryWinners`):**
  `GET /strategies/recommend` identificará y retornará explícitamente en su respuesta el objeto `categoryWinners` con la estrategia ganadora en cada una de las 3 dimensiones analíticas (`byFit`, `byRiskAdjustedReturn`, `byProbability`) además del ganador global (`byComposite`). Cada elemento del arreglo `ranking` incluirá un campo `badges` con las categorías que lidera.
- **Rediseño del Panel de Recomendación en Frontend (`web/index.html`):**
  - Incorporación de tarjetas interactivas de "Líder por Escuela de Análisis" que explican qué técnica recomienda cada método y por qué.
  - Desglose de columnas en la tabla de estrategias (`Fit %`, `EV/CVaR`, `PoP %`, `Insignias`) con ordenamiento dinámico por clic en encabezado.

## Capacidades

### Modified Capabilities
- `recommender`: Extiende el requerimiento de recomendación para estructurar líderes por categoría analítica (`categoryWinners`, `badges`) y brindar desglose matricial por método.

## Impacto

- **Código afectado:**
  - `api/src/services/recommend.service.js`: Lógica para derivar `categoryWinners` y asignar `badges` a cada fila de `ranking`.
  - `web/index.html`: Renderizado de tarjetas de líderes por escuela, tabla desglosada con insignias y ordenamiento dinámico por columnas.
  - `pruebas/unitarias/recomendador.test.js`: Pruebas de derivación de ganadoras por categoría e insignias.
- **Riesgo y compatibilidad:** Cambio puramente aditivo en la respuesta del recomendador y en el front; la IA permanece exactamente como estaba dedicada al filtro de riesgo en `/strategies/auto`.
