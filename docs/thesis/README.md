# YUNI Thesis Documentation

Esta carpeta guarda material pensado para alimentar el informe final de tesis: decisiones de diseno, decisiones tecnicas, tradeoffs, evidencia, fuentes y notas de implementacion.

No reemplaza a [docs/plan-prompts/](../plan-prompts/). Los planes describen que se va a implementar y en que orden. Esta carpeta explica por que se decidio una alternativa, que opciones se descartaron y que evidencia queda para justificar el producto.

## Estructura

- [decision-records/](decision-records/): registros numerados de decisiones de arquitectura, UX, costos, seguridad, integracion e implementacion.
- [Estudio de estabilidad de audio e interrupciones grupales](group-call-audio-stability-case-study.md): explicación narrativa de los síntomas, intentos fallidos, revisión del contrato del SDK y evidencia de la reconstrucción.

## Arquitectura grupal vigente

Las llamadas grupales usan sesiones LiveAvatar LITE independientes, ElevenLabs Agents atómicos y un floor persistente de YUNI. La decisión y sus límites están en [ADR 0019](decision-records/0019-strict-floor-independent-liveavatar-group-sessions.md); la guía operativa está en [llamadas grupales con ElevenLabs y LiveAvatar](../integrations/group-calls-elevenlabs-liveavatar.md).

[ADR 0026](decision-records/0026-user-preemptible-group-call-floor.md) conserva la decisión de hacer ese floor preemptivo para la voz humana y mantener separados el borrador generado, el fragmento informado por el provider y lo pendiente o desconocido. Al 2026-09-08 su reconstrucción desde `main` está **EN VALIDACIÓN, fase 1**: el contrato de comandos pasó con proveedores reales, pero la aceptación de respuestas completas falló por cierre prematuro del gate. La interrupción todavía no se habilita. El [estudio de caso](group-call-audio-stability-case-study.md) conserva el análisis y enlaza las trazas sanitizadas, distinguiendo los tests aprobados de la aceptación acústica pendiente.

El [checkpoint del 2026-09-09](evidence/2026-09-09-group-speech-completion.md) registra la corrección acotada del cierre: conserva el turno ante continuaciones tardías y valida la finalización dentro de la misma cola. Pasaron tres rondas con providers —nueve respuestas, sin PCM bloqueado observado— y permanece pendiente el QA físico. Se conservan también los intentos no aprobados. La espera temporal no se presenta como garantía acústica ni como implementación de barge-in.

## Workflow Del Equipo

Cada vez que se termina una feature o plan:

1. Actualizar el estado del plan en [docs/plan-prompts/README.md](../plan-prompts/README.md).
2. Crear un nuevo decision record en [docs/thesis/decision-records/](decision-records/).
3. Usar [0000-template.md](decision-records/0000-template.md) como base.
4. Linkear fuentes, documentos, planes o evidencia usada para tomar la decision.
5. Si el cambio fue mecanico y no hubo tradeoff relevante, crear igual un registro breve como nota de implementacion.

El objetivo es que, al momento de escribir el informe, el equipo tenga una historia trazable de decisiones y no dependa de memoria oral o conversaciones sueltas.
