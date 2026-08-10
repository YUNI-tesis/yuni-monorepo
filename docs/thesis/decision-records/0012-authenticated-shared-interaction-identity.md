# Authenticated Shared Interaction Identity

## Status

accepted

## Related plans

`18-interact-shell-ui.md`, `19-private-conversations-api.md`

## Date

2026-08-10

## Context

Access Grants permitian que una cuenta encontrara un avatar compartido, pero todas las rutas de
detalle, conversaciones y voz seguian validando ownership. Habilitar solamente el CTA de Interact
habria expuesto datos privados o mezclado historiales entre creador y participantes.

## Decision

- Un resolver comun distingue acceso `owner` y `shared`; un grant compartido debe estar activo,
  vinculado a la cuenta actual y pertenecer a un avatar activo.
- Interact usa un DTO minimo que no expone instrucciones, contexto, configuraciones ni IDs de
  providers.
- `Conversation.ownerId` sigue representando al usuario autenticado dueño de ese historial.
  Conversaciones compartidas guardan ademas `accessGrantId` y un snapshot de `participantEmail`.
- Los endpoints personales solo muestran conversaciones de la identidad efectiva actual. El owner
  no accede todavia a transcripts de participantes.
- Un participante no dispara sincronizacion. Si el agente no esta listo, la llamada responde
  `AVATAR_NOT_READY` y no crea registros parciales.
- Un grant con actividad no se borra fisicamente: la accion de eliminar lo revoca para conservar
  trazabilidad. Reactivar el mismo grant restaura su historial.
- Antes de una llamada compartida se muestra un aviso de privacidad. La opcion de no volver a
  mostrarlo se guarda localmente por usuario y avatar; es una preferencia UX, no consentimiento
  auditable.

## Rationale

Separar permiso de acceso y ownership de configuracion evita filtrar la fuente de verdad del
creador. Atribuir conversaciones al participante y al grant permite aislamiento inmediato y deja
preparadas las futuras metricas por email/cuenta sin habilitar prematuramente la vista Actividad.

No permitir sync desde una cuenta compartida evita latencia, costos y mutaciones tecnicas causadas
por participantes. Preservar grants usados mantiene el vinculo necesario para auditoria y progreso.

## Implementation notes

- Revocar un grant bloquea nuevas llamadas y lectura de historial.
- Si el grant se revoca durante una llamada, el participante puede finalizar la realtime session y
  guardar el transcript. El token ya emitido al SDK externo no puede invalidarse retroactivamente
  desde esta arquitectura cliente-provider.
- La llamada owner conserva temporalmente el sync lazy existente.
- Links publicos, public sessions, uso/costos y lectura owner de actividad siguen fuera de alcance.

## User/product impact

Una persona con cuenta y grant activo puede encontrar el avatar, abrir una llamada, guardar el
transcript y consultar solo su historial. El creador puede revocar el acceso sin destruir la
trazabilidad futura.

## Evidence

- Tests HTTP de DTO seguro, inicio/cierre compartido, aislamiento, revocacion/reactivacion y estado
  `AVATAR_NOT_READY`.
- Tests web de contratos API y preferencia de privacidad por usuario/avatar.
- Verificaciones del monorepo registradas al cerrar la implementacion.

## Open questions

- Mecanismo de corte server-side para sesiones externas ya iniciadas.
- Copy y registro auditable de consentimiento si el producto lo requiere legalmente.
- Presentacion final de transcripts compartidos en la tab Actividad del creador.
