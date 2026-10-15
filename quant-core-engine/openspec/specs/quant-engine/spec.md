# quant-engine (`@core/quant-engine`)

Estado: **preparado**. Compila (Rust → WASM), tiene pruebas y API estable, pero ninguna API lo
consume todavía. Se publica para consumo **síncrono** del resto de los equipos.

## Requirements

### Requirement: Carga síncrona
`import { blackScholes } from '@core/quant-engine'` SHALL dejar el motor listo sin `await`: el
`.wasm` no tiene imports y se instancia con `new WebAssembly.Instance`. El módulo SHALL fallar al
cargar si `qc_abi_version()` no es `100`.

### Requirement: Pricing vectorizado
- `blackScholes(contracts[])` → `{ price, delta, gamma, vega, theta, rho }[]` (BSM con dividendo continuo).
- `binomial(contracts[], { steps, american })` → `{ price, delta, gamma, theta, earlyExercisePremium }[]` (CRR).
- `impliedVol(quotes[])` → `number[]` (Newton protegido por bisección; `NaN` si viola no-arbitraje).

Cada función SHALL cruzar la frontera JS↔WASM una sola vez por lote.
Convenciones: `vega` y `rho` por 1 punto (0.01); `theta` por día calendario (365).

#### Scenario: Ejemplo de Hull
- **WHEN** `blackScholes([{ type: 'call', spot: 42, strike: 40, t: 0.5, rate: 0.1, vol: 0.2 }])`
- **THEN** `price ≈ 4.7594` (±1e-4)

#### Scenario: Put americana
- **WHEN** `binomial` con S=50, K=50, r=10%, σ=40%, T=5/12, 2000 pasos
- **THEN** `price ≈ 4.28` y `earlyExercisePremium > 0`

### Requirement: Riesgo de portafolio
Piernas `{ type: 'call'|'put'|'stock', strike, t, qty (con signo), vol, multiplier }`:
- `pnlMatrix(legs, { spot, spotShocks, volShocks, horizonDays })` → matriz filas × columnas.
- `monteCarlo(legs, { spot, vol, horizonDays, paths, seed, bins })` → media, desviación, VaR95/99,
  CVaR95, probabilidad de ganancia e histograma. Determinista por `seed`.
- `regTMargin(legs, { spot })` → reglas CBOE para descubiertas, por pierna (no compensa spreads).
- `spanMargin(legs, { spot, priceScan, volScan, shortOptionMinimum })` → 16 escenarios SPAN
  (los extremos ±2× ponderan 35%) y margen = max(peor pérdida, mínimo por opción corta).

### Requirement: Verificación
`cargo test` (14 pruebas: Hull, paridad put-call, griegas vs. diferencias finitas, IV ida y vuelta,
convergencia binomial → BS) y `npm test` en `packages/quant-engine` SHALL pasar antes de publicar.
