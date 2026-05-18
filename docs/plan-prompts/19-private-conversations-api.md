# Prompt: Private Conversations API

Armame un plan específico para conversaciones privadas.

Objetivo:
Crear/listar/obtener conversaciones privadas entre creador y avatar.

Endpoints:

- `GET /avatars/:avatarId/conversations`
- `POST /avatars/:avatarId/conversations`
- `GET /avatars/:avatarId/conversations/latest`
- `GET /conversations/:conversationId`

Debe incluir:

- ownership
- latest conversation
- create if none flow
- conversation mode text/voice
- status active/ended

Reglas:

- conversación privada requiere ownerId
- última conversación usa `lastMessageAt desc`, fallback `createdAt desc`
- no mensajes/chat AI todavía si va en otro módulo

Checklist:

- crear conversación privada
- obtener última conversación
- listar historial
- no acceder a conversación ajena
