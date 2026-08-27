# YUNI Thesis Documentation

Esta carpeta guarda material pensado para alimentar el informe final de tesis: decisiones de diseno, decisiones tecnicas, tradeoffs, evidencia, fuentes y notas de implementacion.

No reemplaza a [docs/plan-prompts/](../plan-prompts/). Los planes describen que se va a implementar y en que orden. Esta carpeta explica por que se decidio una alternativa, que opciones se descartaron y que evidencia queda para justificar el producto.

## Estructura

- [decision-records/](decision-records/): registros numerados de decisiones de arquitectura, UX, costos, seguridad, integracion e implementacion.

## Arquitectura grupal vigente

Las llamadas grupales usan sesiones LiveAvatar LITE independientes, ElevenLabs Agents atómicos y un floor persistente y asimétrico de YUNI. El floor es estricto entre avatares —como máximo uno puede ser audible—, pero la voz humana capturada por el Scribe único puede preemptar la ronda completa. El navegador corta al owner actual, el backend libera el floor y el transcript committed abre una única ronda nueva.

Después de QA real se retiró la persistencia del fragmento audible y su coordinación con correcciones, timers e historial: ese diseño produjo casos de audio simultáneo y streams silenciosos. ADR 0023 conserva la decisión original y documenta la enmienda, en lugar de borrar esa evidencia.

La decisión canónica, sus invariantes y sus límites están en [ADR 0023](decision-records/0023-user-preemptible-group-call-floor.md); la guía operativa está en [llamadas grupales con ElevenLabs y LiveAvatar](../integrations/group-calls-elevenlabs-liveavatar.md).

## Workflow Del Equipo

Cada vez que se termina una feature o plan:

1. Actualizar el estado del plan en [docs/plan-prompts/README.md](../plan-prompts/README.md).
2. Crear un nuevo decision record en [docs/thesis/decision-records/](decision-records/).
3. Usar [0000-template.md](decision-records/0000-template.md) como base.
4. Linkear fuentes, documentos, planes o evidencia usada para tomar la decision.
5. Si el cambio fue mecanico y no hubo tradeoff relevante, crear igual un registro breve como nota de implementacion.

El objetivo es que, al momento de escribir el informe, el equipo tenga una historia trazable de decisiones y no dependa de memoria oral o conversaciones sueltas.
