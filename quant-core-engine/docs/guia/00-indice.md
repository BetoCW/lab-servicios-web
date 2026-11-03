# 00 Índice de la guía F0

> Guía paso a paso del equipo F0 · Quant Core Engine & Market Data · Laboratorio de Servicios Web,
> ITTepic (T3-Actividad 2, inciso A). Cada archivo es una nota de la libreta de Evernote del
> equipo; cada encabezado numerado (`04`, `04.01`, `04.01.1`) puede copiarse como nota
> independiente. Los ceros a la izquierda mantienen el orden alfabético en Evernote.

## 00.01 Mapa de la guía

| # | Nota | Archivo | De qué trata |
|---|---|---|---|
| 00 | Índice | `00-indice.md` | Este mapa y la bitácora de push |
| 01 | Introducción a las inversiones | [`01-introduccion-inversiones.md`](01-introduccion-inversiones.md) | Mercado de EU, acciones, ETFs, órdenes, bid/ask, liquidez, riesgo, diversificación, papel de las opciones |
| 02 | Inversión con opciones | [`02-inversion-con-opciones.md`](02-inversion-con-opciones.md) | Calls/puts, griegas, IV, estrategias (la escribe otro integrante) |
| 03 | Operativa en brokers | [`03-operativa-en-brokers.md`](03-operativa-en-brokers.md) | IBKR vs Alpaca vs Webull, paper, niveles de opciones, mleg, paso a paso con Alpaca |
| 04 | APIs, cores y confluencia | [`04-apis-cores-confluencia.md`](04-apis-cores-confluencia.md) | 5 cores, motor de confluencia, 3 modos de selección, aporte de F0, microservicios |
| 05 | Desarrollo de la PWA | [`05-desarrollo-pwa.md`](05-desarrollo-pwa.md) | Manifest, service worker, offline; cómo convertir `web/index.html` |
| 06 | Tutorial OpenSpec / SDD | [`06-tutorial-openspec-sdd.md`](06-tutorial-openspec-sdd.md) | Spec Driven Development, flujo OpenSpec, cambio `microservicios`, IA vs. a mano |
| — | Estudio de estrategias | [`../ESTUDIO-ESTRATEGIAS.md`](../ESTUDIO-ESTRATEGIAS.md) | Estudio de estrategias de opciones (complementa 02 y 04.02.3) |
| — | Guía del Examen Tema 3 | [`../examen-tema3.md`](../examen-tema3.md) | Microservicios: teoría + simulacro con respuestas |

Orden de lectura sugerido: 01 → 02 → 03 → 04 → 06 → 05.

## 00.02 Numeración de todas las notas

Tabla nota → archivo (una fila por nota de segundo nivel; sus subnotas `NN.NN.N` viven en el
mismo archivo, debajo de ella).

| Nota | Título | Subnotas | Archivo |
|---|---|---|---|
| 01.01 | El mercado de valores de EU | 01.01.1, 01.01.2, 01.01.3 | `01-introduccion-inversiones.md` |
| 01.02 | Instrumentos | 01.02.1, 01.02.2, 01.02.3 | `01-introduccion-inversiones.md` |
| 01.03 | Cotización: bid, ask y spread | 01.03.1, 01.03.2 | `01-introduccion-inversiones.md` |
| 01.04 | Liquidez | 01.04.1, 01.04.2 | `01-introduccion-inversiones.md` |
| 01.05 | Tipos de orden | 01.05.1, 01.05.2, 01.05.3, 01.05.4, 01.05.5 | `01-introduccion-inversiones.md` |
| 01.06 | Riesgo y rendimiento | 01.06.1, 01.06.2 | `01-introduccion-inversiones.md` |
| 01.07 | Diversificación | 01.07.1, 01.07.2 | `01-introduccion-inversiones.md` |
| 01.08 | Papel de las opciones | 01.08.1, 01.08.2 | `01-introduccion-inversiones.md` |
| 02.xx | (según la nota de opciones) | — | `02-inversion-con-opciones.md` |
| 03.01 | Comparación de brokers | 03.01.1, 03.01.2 | `03-operativa-en-brokers.md` |
| 03.02 | Cuentas paper | 03.02.1, 03.02.2 | `03-operativa-en-brokers.md` |
| 03.03 | Niveles de opciones | 03.03.1, 03.03.2 | `03-operativa-en-brokers.md` |
| 03.04 | Órdenes multi-pierna (mleg) | 03.04.1, 03.04.2, 03.04.3 | `03-operativa-en-brokers.md` |
| 03.05 | Paso a paso con Alpaca paper (como lo usa el proyecto) | 03.05.1, 03.05.2, 03.05.3, 03.05.4, 03.05.5, 03.05.6, 03.05.7, 03.05.8, 03.05.9, 03.05.10, 03.05.11 | `03-operativa-en-brokers.md` |
| 03.06 | Lo mismo en IBKR y Webull (referencia) | 03.06.1, 03.06.2 | `03-operativa-en-brokers.md` |
| 04.01 | Los 5 cores de análisis | 04.01.1, 04.01.2, 04.01.3, 04.01.4, 04.01.5, 04.01.6 | `04-apis-cores-confluencia.md` |
| 04.02 | Motor de confluencia | 04.02.1, 04.02.2, 04.02.3 | `04-apis-cores-confluencia.md` |
| 04.03 | Tres modos de selección estrategia ↔ empresa | 04.03.1, 04.03.2, 04.03.3 | `04-apis-cores-confluencia.md` |
| 04.04 | Qué aporta F0 | 04.04.1, 04.04.2, 04.04.3, 04.04.4 | `04-apis-cores-confluencia.md` |
| 04.05 | Cómo consumen los demás equipos nuestras APIs | 04.05.1, 04.05.2, 04.05.3 | `04-apis-cores-confluencia.md` |
| 04.06 | Arquitectura de microservicios | 04.06.1, 04.06.2, 04.06.3, 04.06.4 | `04-apis-cores-confluencia.md` |
| 05.01 | Qué es una PWA | 05.01.1, 05.01.2, 05.01.3, 05.01.4 | `05-desarrollo-pwa.md` |
| 05.02 | Estado actual del front F0 | 05.02.1, 05.02.2 | `05-desarrollo-pwa.md` |
| 05.03 | Paso a paso | 05.03.1, 05.03.2, 05.03.3, 05.03.4, 05.03.5, 05.03.6, 05.03.7, 05.03.8 | `05-desarrollo-pwa.md` |
| 05.04 | Verificación | 05.04.1, 05.04.2, 05.04.3 | `05-desarrollo-pwa.md` |
| 06.01 | Spec Driven Development (SDD) | 06.01.1, 06.01.2, 06.01.3 | `06-tutorial-openspec-sdd.md` |
| 06.02 | Estructura de OpenSpec | 06.02.1, 06.02.2, 06.02.3, 06.02.4 | `06-tutorial-openspec-sdd.md` |
| 06.03 | Flujo proponer → aplicar → archivar | 06.03.1, 06.03.2, 06.03.3, 06.03.4 | `06-tutorial-openspec-sdd.md` |
| 06.04 | El `config.yaml` del proyecto | 06.04.1, 06.04.2 | `06-tutorial-openspec-sdd.md` |
| 06.05 | Caso real: el cambio `microservicios` | 06.05.1, 06.05.2, 06.05.3, 06.05.4 | `06-tutorial-openspec-sdd.md` |
| 06.06 | API hecha con IA vs. API optimizada a mano | 06.06.1, 06.06.2, 06.06.3 | `06-tutorial-openspec-sdd.md` |

Árbol completo:

```
00 Índice
  00.01 Mapa de la guía
  00.02 Numeración de todas las notas
  00.03 Bitácora de push por integrante
    00.03.1 Cómo generarla
    00.03.2 Tabla

01 Introducción a las inversiones
  01.01 El mercado de valores de EU
    01.01.1 Bolsas y horarios
    01.01.2 Participantes
    01.01.3 Datos de mercado
  01.02 Instrumentos
    01.02.1 Acciones
    01.02.2 ETFs
    01.02.3 Opciones (adelanto)
  01.03 Cotización: bid, ask y spread
    01.03.1 Definiciones
    01.03.2 Cómo lo usa el proyecto
  01.04 Liquidez
    01.04.1 Qué es
    01.04.2 Regla práctica
  01.05 Tipos de orden
    01.05.1 Market (a mercado)
    01.05.2 Limit (límite)
    01.05.3 Stop y stop-limit
    01.05.4 Vigencia (time in force)
    01.05.5 Validación en la API de órdenes
  01.06 Riesgo y rendimiento
    01.06.1 Conceptos
    01.06.2 Medidas usadas en el proyecto
  01.07 Diversificación
    01.07.1 Idea
    01.07.2 Cómo se aplica
  01.08 Papel de las opciones
    01.08.1 Para qué sirven
    01.08.2 Relación con F0

02 Inversión con opciones   (archivo de otro integrante; respeta su numeración 02.xx)

03 Operativa en brokers
  03.01 Comparación de brokers
    03.01.1 Tabla comparativa
    03.01.2 Por qué el proyecto usa Alpaca
  03.02 Cuentas paper
    03.02.1 Qué es
    03.02.2 Buenas prácticas
  03.03 Niveles de opciones
    03.03.1 Qué son
    03.03.2 Cómo ver tu nivel en el proyecto
  03.04 Órdenes multi-pierna (mleg)
    03.04.1 Qué son
    03.04.2 Campos de una orden mleg en Alpaca
    03.04.3 Símbolo OCC
  03.05 Paso a paso con Alpaca paper (como lo usa el proyecto)
    03.05.1 Crear la cuenta y las llaves
    03.05.2 Configurar el `.env`
    03.05.3 Cómo se autentica cada llamada
    03.05.4 Endpoints de Alpaca que usa el proyecto
    03.05.5 Orden simple (una pierna)
    03.05.6 Encontrar símbolos OCC reales
    03.05.7 Armar la estrategia (borrador)
    03.05.8 Revisar precio y riesgo antes de enviar
    03.05.9 Enviar la orden mleg
    03.05.10 Modificar y cancelar
    03.05.11 Errores frecuentes
  03.06 Lo mismo en IBKR y Webull (referencia)
    03.06.1 IBKR
    03.06.2 Webull

04 APIs, cores y motor de confluencia
  04.01 Los 5 cores de análisis
    04.01.1 Qué es un core
    04.01.2 Core técnico
    04.01.3 Core fundamental
    04.01.4 Core institucional
    04.01.5 Core de indicadores
    04.01.6 Core de noticias
  04.02 Motor de confluencia
    04.02.1 Idea
    04.02.2 Cómo se combinan en un score
    04.02.3 De score a estrategia
  04.03 Tres modos de selección estrategia ↔ empresa
    04.03.1 Empresa → estrategia
    04.03.2 Estrategia → empresa
    04.03.3 Automático por score
  04.04 Qué aporta F0
    04.04.1 Datos de mercado
    04.04.2 Cadenas de opciones con IV y griegas
    04.04.3 Estrategias y ejecución
    04.04.4 Motor de riesgo
  04.05 Cómo consumen los demás equipos nuestras APIs
    04.05.1 REST
    04.05.2 GraphQL
    04.05.3 ¿Cuál usar?
  04.06 Arquitectura de microservicios
    04.06.1 Diagrama
    04.06.2 Responsabilidades
    04.06.3 Qué cambia para los consumidores
    04.06.4 Cómo levantarlo y verificarlo

05 Desarrollo de la PWA
  05.01 Qué es una PWA
    05.01.1 Definición
    05.01.2 Las tres piezas
    05.01.3 Criterios de instalación (Chrome)
    05.01.4 Ventajas y límites
  05.02 Estado actual del front F0
    05.02.1 Qué tenemos
    05.02.2 Qué falta para ser PWA
  05.03 Paso a paso
    05.03.1 Paso 1 — Íconos
    05.03.2 Paso 2 — Manifest
    05.03.3 Paso 3 — Enlazarlo en `index.html`
    05.03.4 Paso 4 — Service worker
    05.03.5 Paso 5 — Registrar el service worker
    05.03.6 Paso 6 — Botón "Instalar" (opcional)
    05.03.7 Paso 7 — Aviso de "sin conexión"
    05.03.8 Paso 8 — Servirlo
  05.04 Verificación
    05.04.1 DevTools
    05.04.2 Lighthouse
    05.04.3 Errores comunes

06 Tutorial: OpenSpec y Spec Driven Development
  06.01 Spec Driven Development (SDD)
    06.01.1 Qué es
    06.01.2 Por qué conviene
    06.01.3 Vocabulario
  06.02 Estructura de OpenSpec
    06.02.1 Árbol
    06.02.2 `project.md`
    06.02.3 Formato de una spec
    06.02.4 Formato de un delta
  06.03 Flujo proponer → aplicar → archivar
    06.03.1 Proponer
    06.03.2 Aplicar
    06.03.3 Archivar
    06.03.4 Comandos útiles del CLI
  06.04 El `config.yaml` del proyecto
    06.04.1 Para qué sirve
    06.04.2 Forma esperada
  06.05 Caso real: el cambio `microservicios`
    06.05.1 `proposal.md` (resumen)
    06.05.2 `tasks.md` (como checklist)
    06.05.3 Deltas
    06.05.4 Del escenario a la prueba
  06.06 API hecha con IA vs. API optimizada a mano
    06.06.1 Hecha con IA desde la spec (SDD)
    06.06.2 Optimizada a mano
    06.06.3 Cómo se documenta la diferencia

```

## 00.03 Bitácora de push por integrante

> Placeholder: se llena antes de entregar. Evidencia de que cada integrante subió cambios.

### 00.03.1 Cómo generarla
```bash
# Resumen: commits por autor (todas las ramas)
git shortlog -sn --all

# Detalle de un integrante: fecha, hash corto y mensaje
git log --all --author="Kevin" --date=short --format='%ad  %h  %s'

# Solo lo de este proyecto
git log --all --author="Kevin" --date=short --format='%ad  %h  %s' -- quant-core-engine/

# Pushes al remoto (lo que ya está en GitHub)
git log origin/main --date=short --format='%ad  %an  %h  %s'
```
Si un integrante usó dos correos/nombres, unifícalos con un `.mailmap` en la raíz antes de correr
`git shortlog`.

### 00.03.2 Tabla
| Integrante | Commits | Primer push | Último push | Aportes principales (notas / carpetas) |
|---|---|---|---|---|
| _Nombre 1_ | | | | |
| _Nombre 2_ | | | | |
| _Nombre 3_ | | | | |
| _Nombre 4_ | | | | |
