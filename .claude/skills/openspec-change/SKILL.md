---
name: openspec-change
description: Proponer un cambio de contrato (APIs F0 o @core/quant-engine) con el flujo OpenSpec - propuesta, tareas y delta de spec - antes de implementarlo. Úsala cuando otro equipo pida un endpoint/campo nuevo o al cambiar el comportamiento público de las APIs o del motor.
---

# Cambio de contrato con OpenSpec

Specs vigentes: `quant-core-engine/openspec/specs/{market-data-api,quant-engine}/spec.md`.

1. Crea `quant-core-engine/openspec/changes/<id-kebab>/` con:
   - `proposal.md`: **Por qué**, **Qué cambia**, **Impacto** (equipos consumidores, tablas, endpoints).
   - `tasks.md`: checklist `- [ ]` de implementación (migración, servicio, ruta, GraphQL, OpenAPI, smoke).
   - `specs/<capability>/spec.md` con deltas:
     ```markdown
     ## ADDED Requirements
     ### Requirement: <nombre>
     El sistema SHALL ...
     #### Scenario: <caso>
     - **WHEN** ...
     - **THEN** ...

     ## MODIFIED Requirements
     ## REMOVED Requirements
     ```
2. Implementa marcando las tareas.
3. Al terminar, fusiona los deltas en `openspec/specs/...` y mueve la carpeta a `openspec/changes/archive/AAAA-MM-DD-<id>/`.
4. Pide al agente `api-contract-guardian` que verifique REST ⇄ GraphQL ⇄ OpenAPI ⇄ spec.

Si está instalado el CLI (`npm i -g @fission-ai/openspec`), `openspec validate <id>` revisa el formato.
