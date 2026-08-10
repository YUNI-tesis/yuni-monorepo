# Sharing Management UI And Public Preview

## Status

accepted

## Related plans

`17-share-tab-ui.md`, `21-public-link-resolver-api.md`, `22-public-avatar-ui.md`

## Date

2026-07-27

## Context

Share Links y Access Grants ya tenian contratos privados, persistencia y permisos, pero el owner
debia operarlos mediante requests manuales. Ademas, copiar un link apuntaba a `/a/:slug`, una ruta
que todavia no existia.

Las sesiones publicas, la identificacion por email y la interaccion de usuarios compartidos siguen
requiriendo features de permisos y trazabilidad que no corresponden a esta entrega.

## Options considered

1. Implementar solo la tab privada y dejar los links copiados sin destino.
2. Implementar de una vez identificacion, sesiones, chat y voz publicos.
3. Implementar administracion completa y una vista publica informativa, manteniendo bloqueada la
   interaccion.

## Decision

Se adopta la tercera opcion:

- El owner administra links y accesos desde la tab `Compartir`.
- La UI usa “Dar acceso” porque esta version no envia emails.
- `/a/:slug` muestra un DTO publico minimo si link y avatar estan activos.
- Un link puede prepararse sobre un draft, pero la pagina publica permanece bloqueada hasta activar
  el avatar.
- Los avatares compartidos aparecen en el catalogo sin acciones que requieran ownership o permisos
  de conversacion aun no implementados.

## Rationale

La vista informativa permite probar copiar, abrir, activar y desactivar links sin fingir que ya
existen sesiones publicas. Ocultar acciones no soportadas evita dirigir al participante a endpoints
owner-only o llamadas que devolverian errores.

## Implementation notes

- El resolver publico no actualiza `lastUsedAt`; ese dato se actualizara al crear una sesion real.
- Slug inexistente, link deshabilitado y avatar no activo producen el mismo `404`.
- El DTO publico expone solamente nombre, descripcion, nombre/slug del link y thumbnail validado.
- Los conflictos `409` se muestran junto al formulario sin limpiar sus valores.
- Loading, error y retry de links y grants son independientes.

## User/product impact

El creador puede completar el flujo de sharing desde la aplicacion. El receptor puede reconocer el
avatar mediante una pagina publica o verlo en “Compartidos conmigo”, pero todavia no puede iniciar
una conversacion.

## Cost/UX/security tradeoffs

- UX: la pagina publica resulta util como preview, aunque el CTA conversacional queda postergado.
- Seguridad: no se expone configuracion interna y se exige que el avatar tambien este activo.
- Alcance: no se agregan emails, identity tokens, sesiones, chat, voz, metricas ni transcripts.

## Sources

- [Plan 17](../../plan-prompts/17-share-tab-ui.md)
- [Plan 21](../../plan-prompts/21-public-link-resolver-api.md)
- [Plan 22](../../plan-prompts/22-public-avatar-ui.md)
- [Decision 0010](0010-share-links-access-grants-api.md)

## Evidence to collect later

- Capturas de la tab con links y grants en sus tres estados.
- Apertura y bloqueo de un mismo link al activarlo y desactivarlo.
- Validacion manual con dos cuentas y revocacion inmediata.

## Open questions

- Copy y consentimiento exactos antes de identificar por email.
- Si la futura pagina publica ofrecera texto, voz o ambas capacidades.
- Como representar la disponibilidad de interaccion compartida cuando se implemente.
