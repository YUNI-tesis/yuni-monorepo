# Owner Participant Activity

## Status

accepted

## Related plans

`16-share-metrics-api.md`, actividad del perfil owner

## Date

2026-08-10

## Context

Las conversaciones compartidas ya se atribuyen a un Access Grant y conservan un snapshot del email
participante. Faltaba cerrar el circuito pedagogico para que el creador pudiera consultar esa
actividad sin mezclarla con su historial personal ni exponer metadata tecnica.

## Decision

- El owner puede listar la actividad autenticada asociada a los Access Grants de sus avatares.
- La vista se organiza por grant/email y permite recorrer conversaciones paginadas y transcripts.
- Los grants revocados con actividad permanecen visibles para conservar trazabilidad.
- Los participantes siguen accediendo solamente a su propio historial mediante los endpoints de
  conversaciones privadas.
- Los reportes owner omiten mensajes `system`, metadata, configuraciones e IDs de providers.
- La paginacion de conversaciones usa un cursor validado dentro del mismo avatar y grant.

## Rationale

Esta separacion permite al creador revisar evidencia de uso sin cambiar la identidad efectiva de
`Conversation.ownerId`, que en conversaciones compartidas representa al participante. Mantener la
consulta owner en endpoints especificos evita ampliar accidentalmente los permisos del endpoint
privado usado por participantes.

## Limits

- No se muestran conversaciones propias del creador ni sesiones publicas.
- No se calculan minutos, costos, progreso o analytics por fecha.
- `16-share-metrics-api` queda parcialmente implementado hasta incorporar Usage Events, links
  publicos y costos estimados.

## Evidence

- Tests HTTP de ownership, estados de grants, paginacion y DTO seguro.
- Tests Web de contratos, seleccion, presentacion y union de paginas.
- Verificacion manual prevista con dos cuentas y un grant revocado.
