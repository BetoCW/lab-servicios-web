# 06 Tutorial: OpenSpec y Spec Driven Development

> Guía F0 · Quant Core Engine & Market Data. Carpeta: `quant-core-engine/openspec/`.

Objetivo: entender SDD, cómo está organizado OpenSpec en este proyecto, el flujo
proponer → aplicar → archivar, y cómo se aplicó al cambio `microservicios`.

---

## 06.01 Spec Driven Development (SDD)

### 06.01.1 Qué es
Desarrollar **a partir de una especificación escrita y versionada** antes del código. La spec dice
*qué* debe hacer el sistema (requisitos y escenarios verificables); el código es la
implementación de esa spec. Con asistentes de IA, la spec es además el **prompt estable**: la IA
implementa desde la spec y no desde una conversación que se pierde.

### 06.01.2 Por qué conviene
| Sin spec | Con spec |
|---|---|
| El contrato vive en la cabeza de quien programó | El contrato está en `openspec/specs/` y lo leen los otros equipos |
| La IA "adivina" el alcance | La IA recibe requisitos y escenarios concretos |
| Revisión de código sin referencia | Se revisa "¿cumple el escenario X?" |
| Cambios rompen consumidores sin aviso | Todo cambio de contrato pasa por una propuesta revisable |

### 06.01.3 Vocabulario
- **Requirement**: lo que el sistema SHALL (debe) hacer.
- **Scenario**: caso verificable `WHEN … THEN … AND …` (se convierte casi directo en prueba).
- **Capability**: una spec por área (`market-data-api`, `quant-engine`).
- **Delta**: lo que un cambio agrega, modifica o quita de una spec (`ADDED/MODIFIED/REMOVED`).

---

## 06.02 Estructura de OpenSpec

### 06.02.1 Árbol
```
quant-core-engine/openspec/
├── project.md                    # propósito, stack, convenciones, tabla de capacidades
├── config.yaml                   # configuración del proyecto (ver 06.04)
├── specs/                        # VERDAD ACTUAL: lo que el sistema hace hoy
│   ├── market-data-api/spec.md   # 4 APIs REST + GraphQL
│   └── quant-engine/spec.md      # motor Rust/WASM
└── changes/                      # PROPUESTAS en curso
    ├── microservicios/
    │   ├── proposal.md           # por qué, qué cambia, impacto
    │   ├── tasks.md              # checklist de implementación
    │   └── specs/<capability>/spec.md   # deltas
    └── archive/AAAA-MM-DD-<id>/  # cambios ya aplicados
```

### 06.02.2 `project.md`
Contexto que cualquier persona o IA lee primero. En F0 fija convenciones que luego se ven en el
código: "código y docs en español", "camelCase en respuestas, snake_case en bodies hacia Alpaca",
"Alpaca es fuente de verdad de watchlists y órdenes; Supabase guarda el espejo".

### 06.02.3 Formato de una spec
Fragmento real de `specs/market-data-api/spec.md`:
```markdown
### Requirement: Strategies CRUD
El sistema SHALL guardar estrategias de 1 a 4 piernas (`strategies` + `strategy_legs`) cuyos
símbolos OCC existan en Alpaca y pertenezcan al subyacente declarado; ...

#### Scenario: Editar una estrategia enviada
- **WHEN** se hace `PUT /strategies/{id}` y el estado es `submitted`
- **THEN** responde `409`
```
Y el código que lo cumple (`api/src/services/strategies.service.js`):
```js
if (current.status !== 'draft') throw conflict(`La estrategia ya está en estado ${current.status}; solo se edita en draft`);
```

### 06.02.4 Formato de un delta
```markdown
## ADDED Requirements
### Requirement: Health check por servicio
Cada microservicio SHALL exponer `GET /health` que responda `{ status, service }` ...

#### Scenario: Servicio sin configuración
- **WHEN** faltan llaves en `.env`
- **THEN** `/health` responde `503` con `status = "degraded"`

## MODIFIED Requirements
## REMOVED Requirements
```

---

## 06.03 Flujo proponer → aplicar → archivar

### 06.03.1 Proponer
1. Crear `openspec/changes/<id-kebab>/` con `proposal.md` (**Por qué / Qué cambia / Impacto**),
   `tasks.md` (checklist `- [ ]`) y los deltas en `specs/`.
2. Validar el formato: `openspec validate <id> --strict` (CLI `@fission-ai/openspec`).
3. Revisar en equipo (PR). Nadie programa hasta que la propuesta está aceptada.

En Claude Code: skill `openspec-change` del repo, o los comandos del CLI de OpenSpec para
asistentes (según versión: `/openspec:proposal` u `/opsx:propose`).

### 06.03.2 Aplicar
1. Implementar tarea por tarea marcando `- [x]` en `tasks.md`.
2. Cada escenario se vuelve prueba (`pruebas/`).
3. Verificar contrato: agente `api-contract-guardian` (REST ⇄ GraphQL ⇄ OpenAPI ⇄ spec) y
   `npm test` (incluye `contrato/openapi.test.js`).

Comandos: `/openspec:apply <id>` u `/opsx:apply`.

### 06.03.3 Archivar
1. Fusionar los deltas en `openspec/specs/<capability>/spec.md` (la verdad actual).
2. Mover la carpeta a `openspec/changes/archive/AAAA-MM-DD-<id>/`.
3. Actualizar la tabla de capacidades en `project.md` si cambió el estado.

Comandos: `openspec archive <id>` (hace 1 y 2) o `/openspec:archive` u `/opsx:archive`.

### 06.03.4 Comandos útiles del CLI
```bash
npm i -g @fission-ai/openspec
cd quant-core-engine
openspec list                 # cambios activos
openspec show microservicios  # propuesta + tareas + deltas
openspec validate microservicios --strict
openspec archive microservicios
```

---

## 06.04 El `config.yaml` del proyecto

### 06.04.1 Para qué sirve
Configura OpenSpec para este proyecto: esquema de flujo (`spec-driven`), contexto que se inyecta
a la IA y reglas por artefacto. En F0 además **registra cómo se hizo cada API**: cuáles se
generaron con IA vía SDD (desde la spec) y cuáles se optimizaron a mano. Es la evidencia que pide
la actividad.

### 06.04.2 El archivo real (`openspec/config.yaml`, resumido)
```yaml
schema: spec-driven
context: project.md
apis:
  watchlists:    { origen: ia-sdd }            # ruta -> servicio -> Alpaca -> upsert en Supabase
  orders:        { origen: ia-sdd }            # replace con fallback cancel+resubmit (escenario de la spec)
  option-chains: { origen: manual-optimizado } # snapshots por lotes, tope 300, rollback si falla la ingesta
  strategies:    { origen: manual-optimizado } # riesgo en Rust/WASM por lotes, Monte Carlo antitético
  microservicios: { origen: ia-sdd }           # gateway + 4 procesos sobre los mismos routers
```
> El equipo debe confirmar `origen` antes de entregar (el archivo lo marca con `CONFIRMAR`).

---

## 06.05 Caso real: el cambio `microservicios`

### 06.05.1 `proposal.md`
Archivo: `openspec/changes/microservicios/proposal.md`.
- **Por qué**: las 4 APIs corrían en un solo proceso; una caída o un Monte Carlo pesado en
  `strategies` afectaba a todas.
- **Qué cambia**: un proceso por API (watchlists :3061, orders :3062 con `/account`,
  option-chains :3063, strategies :3064) detrás de un gateway :3060 que conserva la URL pública
  y sigue sirviendo GraphQL, Swagger y el front; `/health` y `/metrics` en cada proceso;
  `docker-compose.yml` con Prometheus + Grafana. El monolito se retira: `npm run dev` levanta los microservicios.
- **Impacto**: nueva capacidad `microservices`; `market-data-api` no cambia. Riesgo: GraphQL
  sigue en proceso dentro del gateway.

### 06.05.2 `tasks.md`
Archivo: `openspec/changes/microservicios/tasks.md`. Tres bloques, todos marcados `[x]`:
1. Separación (routers por API, `serviceApp`, `gatewayApp`, `npm run dev` / compose).
2. Monitoreo (`/health` por servicio y agregado, `/metrics`, Prometheus + Grafana).
3. Pruebas (unitarias, integración, contrato, k6, smoke E2E, regresión en CI).

### 06.05.3 Delta de spec
Archivo: `openspec/changes/microservicios/specs/microservices/spec.md` (`## ADDED Requirements`):
- **Un proceso por API**: escenario *Falla aislada* (strategies caído → watchlists sigue en 200,
  strategies responde 503).
- **API Gateway**: escenario *Error de validación propagado* (`GET /watchlists/no-es-uuid` → 400).
- **Salud y métricas**: escenario *Salud agregada* (un servicio caído → gateway `/health` 503 y
  ese servicio como `down`).

Al archivar el cambio, este delta pasa a `openspec/specs/microservices/spec.md`.

### 06.05.4 Del escenario a la prueba
```markdown
#### Scenario: Microservicio caído
- **WHEN** el gateway recibe `GET /api/v1/orders` y el servicio orders no responde
- **THEN** responde `503` con "El microservicio orders no responde"
```
```js
// pruebas/integracion/gateway.test.js
test('gateway responde 503 si el microservicio está caído', async () => { /* ... */ });
```

---

## 06.06 API hecha con IA vs. API optimizada a mano

### 06.06.1 Hecha con IA desde la spec (SDD)
1. Se escribe/ajusta la spec (requisitos + escenarios).
2. Se le da a la IA `project.md` + la spec + el delta y se le pide implementar `tasks.md`.
3. La IA genera servicio, ruta, GraphQL y OpenAPI; las pruebas de contrato confirman que REST y
   OpenAPI coinciden.
4. Revisión humana: ¿cumple cada escenario?

Características típicas: rápida de obtener, sigue la spec al pie de la letra, tiende a ser
genérica (llamadas secuenciales, sin caché, validación repetida).

### 06.06.2 Optimizada a mano
Partiendo de la versión que ya cumple la spec, un integrante mide y mejora sin cambiar el
contrato. Ejemplos de optimizaciones que existen en el código:
- **Lotes**: snapshots de opciones pedidos de 100 en 100 con paginación
  (`alpaca.optionSnapshots`), en vez de uno por contrato.
- **Paralelismo**: validación de piernas con `Promise.all` y en riesgo
  `Promise.all([stockSnapshot, optionSnapshots])`.
- **Casos reales del broker**: PATCH con mercado cerrado → cancelar y reenviar
  (`replaceMode: cancel_resubmit`), descubierto probando contra Alpaca.
- **Cálculo pesado fuera de JS**: Monte Carlo en Rust/WASM, una sola cruzada JS↔WASM por lote.

### 06.06.3 Cómo se documenta la diferencia
| Aspecto | IA vía SDD | Optimizada a mano |
|---|---|---|
| Entrada | Spec + tasks | Código existente + mediciones |
| Contrato | Lo define la spec | **No cambia** (las pruebas de contrato lo garantizan) |
| Evidencia | `tasks.md` marcado, commits | k6 antes/después (p95), commits con el porqué |
| Registro | `config.yaml` → `origen: ia-sdd` | `config.yaml` → `origen: manual-optimizada` |

Comparar con `npm run carga` (k6) contra cada versión y anotar p95 y tasa de error en la nota.
