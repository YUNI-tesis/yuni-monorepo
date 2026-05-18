# Prompt: Share Links API

Armame un plan específico para API privada de share links.

Objetivo:
Permitir que un creador cree y administre múltiples links públicos por avatar.

Endpoints:

- `GET /avatars/:avatarId/share-links`
- `POST /avatars/:avatarId/share-links`
- `PATCH /avatars/:avatarId/share-links/:shareLinkId`
- `DELETE /avatars/:avatarId/share-links/:shareLinkId`

Debe incluir:

- dominio `share`
- controller/service/repository
- slug único global
- activar/desactivar
- ownership
- errores consistentes

Reglas:

- cliente no manda ownerId
- crear link requiere avatar propio
- no implementar métricas aquí
- no implementar UI aquí

Checklist:

- crear link
- listar links por avatar propio
- activar/desactivar link
- eliminar link
- no operar links de otro owner
