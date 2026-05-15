# Prompt: Avatar Domain API

Armame un plan específico para el backend del ABM de avatares de YUNI.

Objetivo:
Permitir CRUD privado de `AvatarAgent` para creadores autenticados.

Debe incluir:

- dominio `avatars` en `apps/api/src/domains/avatars`
- `controller.ts`
- `service.ts`
- `repository.ts`
- endpoints privados:
  - `GET /avatars`
  - `POST /avatars`
  - `GET /avatars/:avatarId`
  - `PATCH /avatars/:avatarId`
  - `DELETE /avatars/:avatarId`
- validación con schemas de `packages/domain`
- ownership server-side
- errores consistentes
- tests de API/service/repository contract

Reglas:

- cliente nunca manda `ownerId`
- `ownerId` sale de `requireAuth`
- ABM no contiene chat ni llamada
- no implementar UI en este módulo
- no implementar share links en este módulo
- `liveAvatarConfig.mode` siempre `lite`
- `liveAvatarConfig.sandbox` siempre `true`
- no avatar local ni fallback 3D

Checklist:

- creador crea avatar
- lista solo avatares propios
- obtiene solo avatar propio
- edita solo avatar propio
- elimina solo avatar propio
- requests anónimos son `401`
- intento sobre avatar ajeno es `404` o `403` consistente
