# Prompt: Share Links And Access Grants API

Armame un plan especifico para API privada de sharing.

Objetivo:
Permitir que un creador administre links publicos con email obligatorio e invitaciones/accesos directos por email o cuenta.

Endpoints sugeridos:

- `GET /avatars/:avatarId/share-links`
- `POST /avatars/:avatarId/share-links`
- `PATCH /avatars/:avatarId/share-links/:shareLinkId`
- `DELETE /avatars/:avatarId/share-links/:shareLinkId`
- `GET /avatars/:avatarId/access-grants`
- `POST /avatars/:avatarId/access-grants`
- `PATCH /avatars/:avatarId/access-grants/:accessGrantId`
- `DELETE /avatars/:avatarId/access-grants/:accessGrantId`

Debe incluir:

- dominio `share`
- controller/service/repository
- slug unico global para links
- activar/desactivar links
- crear invitacion por email
- vincular grant a `participantUserId` si el email corresponde a una cuenta existente o se vincula despues
- revocar acceso
- ownership
- errores consistentes
- modelo preparado para filtrar `Mis avatares > Compartidos conmigo`

Reglas:

- cliente no manda ownerId
- crear link o grant requiere avatar propio
- todo link publico debe requerir email antes de iniciar sesion
- no implementar metricas aqui
- no implementar UI aqui
- no exponer prompts/contexto/documentos por share

Checklist:

- crear link publico
- listar links por avatar propio
- activar/desactivar link
- eliminar link
- crear grant por email
- revocar grant
- usuario con cuenta puede ver avatar compartido en `Mis avatares`
- no operar links o grants de otro owner
