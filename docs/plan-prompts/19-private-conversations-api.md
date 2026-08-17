# Prompt: Conversations API

Estado: implementado parcialmente el 2026-06-21. Existe historial privado owner para conversaciones `voice` generadas por llamadas, con listado por avatar, detalle por conversacion, mensajes ordenados y titulo persistido. Quedan pendientes `POST`, `latest`, conversaciones `text`, shared authenticated users y public session identity.

Armame un plan especifico para conversaciones privadas y compartidas.

Objetivo:
Crear/listar/obtener conversaciones entre un avatar y un owner, usuario compartido o participante publico identificado.

Endpoints:

- `GET /avatars/:avatarId/conversations`
- `POST /avatars/:avatarId/conversations`
- `GET /avatars/:avatarId/conversations/latest`
- `GET /conversations/:conversationId`

Debe incluir:

- ownership para owner
- acceso por grant para usuarios compartidos
- acceso por public session token para participantes publicos cuando aplique
- latest conversation por identidad efectiva
- create if none flow
- conversation mode text/voice
- status active/ended
- campos o metadata para:
  - owner private
  - shared authenticated user
  - public participant email
  - shareLink/accessGrant/publicSession

Reglas:

- conversacion privada de owner requiere ownerId
- conversacion compartida autenticada requiere grant activo
- conversacion publica requiere public session activa con `participantEmail`
- ultima conversacion usa `lastMessageAt desc`, fallback `createdAt desc`
- no mensajes/chat AI todavia si va en otro modulo
- usuario compartido solo accede a sus conversaciones
- owner puede listar actividad agregada del avatar desde planes de Actividad

Checklist:

- crear conversacion privada de owner
- crear conversacion de usuario compartido
- crear conversacion publica asociada a email/session
- obtener ultima conversacion por identidad
- listar historial permitido
- no acceder a conversacion ajena
