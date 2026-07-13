# MVP Roadmap Pull Based Execution

## Status

accepted

## Related plan

[mvp-gantt.md](../../roadmap/mvp-gantt.md)

## Date

2026-06-06

## Context

YUNI se esta desarrollando como tesis por un equipo de dos personas. La base del producto ya tiene planes `00-13` implementados, pero todavia faltan navegacion global, rutas de Interact, conversaciones, documentos reales, share publico y voz.

El mayor riesgo de producto es que la experiencia conversacional con avatar sea fluida y convincente. Tambien hay friccion operativa porque la app tiene rutas sueltas y algunas pantallas requieren escribir paths manualmente.

## Options considered

1. Seguir los planes en orden numerico estricto.
   - Simple de administrar.
   - Retrasa validacion de voz y navegacion porque varias ramas son paralelizables.

2. Priorizar primero documentos/RAG completo.
   - Da mas control tecnico.
   - Retrasa la demo conversacional y no resuelve la navegacion.

3. Priorizar app navegable + spike ElevenLabs-first.
   - Mejora la forma de producto temprano.
   - Valida rapido la experiencia de voz/avatar.
   - Permite sumar documentos reales despues, empezando por sync simple antes de RAG propio.

## Decision

Priorizar una ruta de MVP por vertical slices y usar un backlog pull-based:

- No asignar personas fijas a areas.
- Cada integrante toma el item disponible de mayor prioridad que no choque con el trabajo activo del otro.
- El roadmap separa tareas en serie, tareas paralelizables y prioridades P0-P4.
- La app navegable y el spike ElevenLabs + LiveAvatar deben ocurrir antes de completar RAG propio.
- RAG propio queda como evolucion posterior sobre una experiencia conversacional ya validada.

## Rationale

Para una tesis conviene llegar temprano a una demo defendible: el usuario crea/configura un avatar, entra a Interact y conversa con una experiencia fluida. Si se completa primero todo el pipeline de documentos/RAG pero la experiencia de voz falla, el producto pierde valor central.

La navegacion global tambien es prioritaria porque permite trabajar, probar y mostrar el producto como una aplicacion real, aunque algunas pantallas empiecen con placeholders.

## Implementation notes

- Crear `docs/roadmap/mvp-gantt.md` como fuente operativa para division de trabajo.
- Agregar `12A-app-shell-navigation-dashboard.md` para cubrir navegacion global, que no estaba explicitada en los planes.
- Agregar `24B-elevenlabs-agent-provider-sync.md` para convertir la decision ElevenLabs-first en un plan implementable.
- Mantener actualizados `docs/plan-prompts/README.md` y decision records al cerrar cada plan.

## User/product impact

El equipo puede dividir tareas segun disponibilidad semanal sin bloquearse ni quedar atado a roles fijos. La demo temprana se centra en el valor principal: avatar conversacional con contexto del creador.

## Cost/UX/security tradeoffs

- UX: priorizar Interact y ElevenLabs reduce el riesgo de conversacion poco natural.
- Costo: el spike debe medir costo/minuto real antes de escalar.
- Seguridad: sincronizar contexto a ElevenLabs debe hacerse solo desde backend y con YUNI como fuente de verdad.
- Coordinacion: trabajar en paralelo exige congelar contratos antes de dividir API/UI y usar owners temporales por plan, no por persona.

## Sources

- Roadmap operativo: [mvp-gantt.md](../../roadmap/mvp-gantt.md)
- Plan `24A`: [24A-agent-voice-architecture-context-contract.md](../../plan-prompts/24A-agent-voice-architecture-context-contract.md)
- Decision ElevenLabs-first: [0002-plan-24a-elevenlabs-first-mvp-option.md](0002-plan-24a-elevenlabs-first-mvp-option.md)

## Evidence to collect later

- Tiempo real hasta tener app navegable.
- Tiempo real hasta primer spike de voz privada.
- Bloqueos entre integrantes.
- Calidad de demo con usuarios o jurado.
- Costos reales de llamadas de prueba.

## Open questions

- El plan `13` implementado alcanza para configurar ElevenLabs como provider real?
- El primer spike de voz debe usar solo contexto textual o tambien documentos sincronizados?
- Que convencion de ownership temporal usara el equipo en branch names y PRs?
