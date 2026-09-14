# YUNI Thesis Documentation

Esta carpeta guarda material pensado para alimentar el informe final de tesis: decisiones de diseno, decisiones tecnicas, tradeoffs, evidencia, fuentes y notas de implementacion.

No reemplaza a [docs/plan-prompts/](../plan-prompts/). Los planes describen que se va a implementar y en que orden. Esta carpeta explica por que se decidio una alternativa, que opciones se descartaron y que evidencia queda para justificar el producto.

## Estructura

- [decision-records/](decision-records/): registros numerados de decisiones de arquitectura, UX, costos, seguridad, integracion e implementacion.
- [Estudio de estabilidad de audio e interrupciones grupales](group-call-audio-stability-case-study.md): explicación narrativa de los síntomas, intentos fallidos, revisión del contrato del SDK y evidencia de la reconstrucción.

## Arquitectura grupal vigente

Las llamadas grupales usan sesiones LiveAvatar LITE independientes, ElevenLabs Agents atómicos y un floor persistente de YUNI. La decisión y sus límites están en [ADR 0019](decision-records/0019-strict-floor-independent-liveavatar-group-sessions.md); la guía operativa está en [llamadas grupales con ElevenLabs y LiveAvatar](../integrations/group-calls-elevenlabs-liveavatar.md).

[ADR 0026](decision-records/0026-user-preemptible-group-call-floor.md) define el floor asimétrico: estricto entre avatares y preemptivo para la voz del Scribe único. Mantiene separados el borrador generado, el fragmento informado por el provider y lo pendiente o desconocido. Al 2026-09-12 las fases de interrupción y contexto están **implementadas para validación, con aceptación formal y QA físico pendientes**: corte local, cancelación durable de toda la ronda, reemplazo de los connectors afectados y nuevo ruteo. La migración aditiva se aplicó sólo a desarrollo con backup y conteos verificados idénticos; preserva la tabla legacy mediante una receipt física nueva. No hubo despliegue a producción. El [estudio de caso](group-call-audio-stability-case-study.md) conserva el análisis, los intentos fallidos y las trazas sanitizadas.

El [checkpoint del 2026-09-09](evidence/2026-09-09-group-speech-completion.md) registra la corrección acotada del cierre: conserva el turno ante continuaciones tardías y valida la finalización dentro de la misma cola. Pasaron tres rondas con providers —nueve respuestas, sin PCM bloqueado observado— y permanece pendiente el QA físico. Se conservan también los intentos no aprobados. La espera temporal no se presenta como garantía acústica ni como implementación de barge-in.

El usuario confirmó después la recuperación de voz y priorizó completar las interrupciones. Este incremento no vuelve a modificar SDK, TTS o cierre natural; el lip-sync intermitente queda fuera de alcance. ADR 0026 sigue siendo la fuente canónica y el estudio explica la evolución del incidente, sin crear otro ensayo o ADR paralelo.

El [checkpoint de interrupción del 2026-09-12](evidence/2026-09-12-group-human-barge-in.md) registra dos ensayos técnicos con providers y Scribe simulado: corte del gate, cancelación y audio después de elegir otro avatar o el mismo sobre un connector nuevo. Conserva también un primer intento fallido con HTTP 500 de causa sin confirmar. Los oráculos experimentales quedaron inconclusos; no se presentan como aceptación con micrófono físico.

## Workflow Del Equipo

Cada vez que se termina una feature o plan:

1. Actualizar el estado del plan en [docs/plan-prompts/README.md](../plan-prompts/README.md).
2. Crear un nuevo decision record en [docs/thesis/decision-records/](decision-records/).
3. Usar [0000-template.md](decision-records/0000-template.md) como base.
4. Linkear fuentes, documentos, planes o evidencia usada para tomar la decision.
5. Si el cambio fue mecanico y no hubo tradeoff relevante, crear igual un registro breve como nota de implementacion.

El objetivo es que, al momento de escribir el informe, el equipo tenga una historia trazable de decisiones y no dependa de memoria oral o conversaciones sueltas.
