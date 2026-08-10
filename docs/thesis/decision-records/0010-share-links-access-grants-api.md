# Share Links And Access Grants API

## Status

accepted

## Related plan

[`15-share-links-api.md`](../../plan-prompts/15-share-links-api.md)

## Date

2026-07-25

## Context

YUNI necesitaba separar dos formas de compartir un avatar: links publicos y accesos privados por cuenta. El borrador de Share Links no estaba conectado a la aplicacion, duplicaba acceso Prisma dentro de API y no contemplaba grants ni el listado de avatares compartidos.

La feature debia preparar el modelo de permisos sin implementar aun la tab Compartir, la pagina publica, sesiones compartidas, correos ni metricas.

## Options considered

1. Integrar el borrador sin cambios y mantener repositorios Prisma dentro de API.
2. Compartir solamente mediante links y postergar los permisos por cuenta.
3. Consolidar persistencia en `packages/db`, implementar links y grants por email, y exponer un listado seguro con permisos derivados.

## Decision

Se adopta la tercera opcion:

- Share Links y Access Grants se administran desde rutas privadas del owner.
- El email del grant se normaliza y funciona como identidad estable, exista o no una cuenta.
- Un grant activo se vincula inmediatamente con una cuenta existente o al registrar/iniciar sesion una cuenta coincidente.
- El estado publico del grant se deriva como `pending`, `linked` o `revoked`.
- `GET /avatars` acepta `scope=all|owned|shared` y devuelve solamente un DTO resumido con permisos.
- La persistencia Prisma queda centralizada en `packages/db`; API contiene adapters, servicios y controllers.

## Rationale

El email permite preparar una invitacion antes de que el participante tenga cuenta y conservar el mismo grant cuando luego se registre. Separar `status` persistido de `state` expuesto evita guardar estados redundantes: `pending` y `linked` dependen de si existe `participantUserId`.

Centralizar los repositorios evita dos implementaciones Prisma que pueden divergir. El DTO resumido protege instrucciones, contexto y datos de providers antes de habilitar interacciones compartidas.

## Implementation notes

- `AccessGrant` es unico por avatar y email; un grant revocado se reactiva con `PATCH` y uno eliminado se borra definitivamente.
- Al reactivar un grant pendiente se vuelve a buscar una cuenta coincidente.
- Borrar un avatar elimina sus grants; borrar al participante conserva el grant y deja `participantUserId` en `null`.
- Los avatares compartidos deben estar `active` y tener un grant `active`.
- Los links conservan slug inmutable, globalmente unico, en kebab-case, y exponen una `publicUrl` derivada de configuracion.
- La lista de avatares no expone `ownerId`, instrucciones, contexto, documentos, storage keys, provider IDs ni errores de sincronizacion.

## User/product impact

Un creador puede preparar links e invitar participantes por email mediante API. Un participante con cuenta puede encontrar los avatares activos compartidos con el, y deja de verlos inmediatamente cuando el owner revoca el grant.

La experiencia visual de compartir y la resolucion de links publicos permanecen fuera de esta entrega.

## Cost/UX/security tradeoffs

- Seguridad: los recursos ajenos responden `404` para no revelar su existencia.
- Privacidad: el listado compartido usa un DTO minimo y no reutiliza el modelo interno del avatar.
- Consistencia: vincular grants durante login agrega una escritura idempotente por email.
- Alcance: se priorizaron tests focalizados de dominio y HTTP con repositorios en memoria; no se agrego una suite E2E ni PostgreSQL real para esta feature de tesis.

## Sources

- [Plan 15: Share Links And Access Grants API](../../plan-prompts/15-share-links-api.md)
- [Decision 0009: Product Navigation, Sharing Identity And Background Sync](0009-product-navigation-sharing-background-sync.md)
- Schemas, migracion, repositorios y tests implementados en este monorepo.

## Evidence to collect later

- Verificacion manual con dos cuentas, creacion y revocacion de un grant.
- Capturas de requests y respuestas de Share Links y Access Grants.
- Validacion de que ningun campo privado aparece en el DTO compartido.
- Resultado de typecheck, lint, build y tests del monorepo.

## Open questions

- Como se notificara al participante cuando se agregue envio de invitaciones.
- Que permisos adicionales, si alguno, tendran los participantes compartidos.
- Como se presentaran grants duplicados o revocados en la futura tab Compartir.
