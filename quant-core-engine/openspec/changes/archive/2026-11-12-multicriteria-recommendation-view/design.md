# Design: Vista de Recomendación Multicriterio

## Context

Actualmente, `recommend.service.js` calcula para cada una de las 4 estrategias candidatas las partes de puntuación `scoreParts: { probability, expectedValue, fit }` y sus métricas Monte Carlo, pero colapsa todo en un único ordenamiento. El frontend (`web/index.html`) solo muestra la tabla compacta con el puntaje total.

Ver `proposal.md` para la motivación y objetivos de negocio.

## Goals / Non-Goals

**Goals:**
- Estructurar en `recommend.service.js` el cálculo determinista de `categoryWinners: { byFit, byRiskAdjustedReturn, byProbability, byComposite }` e insertar en cada fila del ranking el campo `badges` indicando qué áreas lidera.
- Rediseñar en `web/index.html` el panel de recomendación:
  - Renderizar 3 tarjetas superiores para los líderes de cada escuela metodológica ("Régimen/Técnica", "Retorno/CVaR", "Probabilidad").
  - Desglosar las columnas en `#recTable` para mostrar `Fit %`, `EV/CVaR`, `PoP %`, `Insignias` y permitir ordenamiento interactivo al hacer clic en los encabezados.
- Mantener el microservicio de IA exactamente como estaba, dedicado a la validación de riesgo del botón de ejecución automática.

**Non-Goals:**
- Alterar el cálculo matemático del puntaje ni la simulación Monte Carlo en el motor Rust/WASM.
- Modificar el microservicio de IA ni añadir endpoints adicionales a OpenRouter.
- Modificar esquemas de bases de datos o persistencia en Supabase.

## Decisions

### 1. Derivación Sincrónica y Determinista de Category Winners
* **Decisión:** `recommend.service.js` identifica a las ganadoras por categoría en memoria inmediatamente tras evaluar las 4 candidatas:
  - `byFit`: Mayor `scoreParts.fit` (Top en régimen de mercado/volatilidad).
  - `byRiskAdjustedReturn`: Mayor `scoreParts.expectedValue` (Top en valor esperado relativo al CVaR).
  - `byProbability`: Mayor `metrics.probProfit` (Top en probabilidad pura de ganancia).
  - `byComposite`: Estrategia con mayor `score` global.
* **Razón:** Costo computacional nulo ($O(1)$ sobre 4 elementos) y respuesta inmediata a clientes REST/GraphQL sin dependencias externas.

### 2. Ordenamiento Interactivo en Tabla de Frontend
* **Decisión:** Almacenar `window.recRanking` en memoria del cliente y permitir alternar el orden de la tabla según la columna seleccionada (`Global`, `Fit`, `EV/CVaR`, `PoP`), re-renderizando la selección activa (`recDetail`).
* **Razón:** Otorga autonomía al usuario para privilegiar la metodología en la que decida confiar sin necesidad de re-consultar al servidor.

## Risks / Trade-offs

* **[Risk]** Sobrecarga de información en la interfaz móvil o paneles laterales angostos.
  * **Mitigation:** Diseñar las tarjetas de escuelas de análisis de forma compacta y apilada, y usar insignias discretas (`chip` o `badge`) en la tabla.
