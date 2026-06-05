# YUNI Thesis Documentation

Esta carpeta guarda material pensado para alimentar el informe final de tesis: decisiones de diseno, decisiones tecnicas, tradeoffs, evidencia, fuentes y notas de implementacion.

No reemplaza a [docs/plan-prompts/](../plan-prompts/). Los planes describen que se va a implementar y en que orden. Esta carpeta explica por que se decidio una alternativa, que opciones se descartaron y que evidencia queda para justificar el producto.

## Estructura

- [decision-records/](decision-records/): registros numerados de decisiones de arquitectura, UX, costos, seguridad, integracion e implementacion.

## Workflow Del Equipo

Cada vez que se termina una feature o plan:

1. Actualizar el estado del plan en [docs/plan-prompts/README.md](../plan-prompts/README.md).
2. Crear un nuevo decision record en [docs/thesis/decision-records/](decision-records/).
3. Usar [0000-template.md](decision-records/0000-template.md) como base.
4. Linkear fuentes, documentos, planes o evidencia usada para tomar la decision.
5. Si el cambio fue mecanico y no hubo tradeoff relevante, crear igual un registro breve como nota de implementacion.

El objetivo es que, al momento de escribir el informe, el equipo tenga una historia trazable de decisiones y no dependa de memoria oral o conversaciones sueltas.
