# quant-engine (`@core/quant-engine`)

## Purpose

Proveer un motor matemático de alto rendimiento compilado de Rust a WebAssembly con interfaz síncrona para valoración de derivados financieros, cálculo de griegas analíticas, volatilidad implícita, simulación Monte Carlo y márgenes regulatorios Reg T y SPAN.

## Requirements

### Requirement: Carga síncrona
`import { blackScholes } from '@core/quant-engine'` SHALL dejar el motor listo sin `await`: el
`.wasm` no tiene imports y se instancia con `new WebAssembly.Instance`. El módulo SHALL fallar al
cargar si `qc_abi_version()` no es `100`.

#### Scenario: Carga exitosa
- **WHEN** se importa cualquier función de `@core/quant-engine`
- **THEN** el módulo se expone de forma síncrona y utilizable de inmediato

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
El motor SHALL calcular métricas de riesgo para piernas `{ type: 'call'|'put'|'stock', strike, t, qty, vol, multiplier }`:
matriz de P&L spot x vol, simulación Monte Carlo determinista por semilla, y márgenes regulatorios Reg T y SPAN.

#### Scenario: Simulación Monte Carlo determinista
- **WHEN** se ejecuta `monteCarlo` con una semilla dada
- **THEN** regresa resultados deterministas de media, desviación, VaR y CVaR

### Requirement: Verificación
La suite de pruebas SHALL verificar la exactitud matemática y compatibilidad ABI del motor.

#### Scenario: Ejecución de suite de pruebas
- **WHEN** se ejecutan las pruebas de unidad y contrato
- **THEN** todas las pruebas numéricas pasan satisfactoriamente
