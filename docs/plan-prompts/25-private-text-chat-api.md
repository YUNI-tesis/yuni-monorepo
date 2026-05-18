# Prompt: Private Text Chat API

Armame un plan específico para chat de texto privado.

Objetivo:
Permitir que el creador mande mensajes privados a un avatar y reciba respuesta AI.

Endpoint:

- `POST /conversations/:conversationId/messages`

Debe incluir:

- validar ownership
- append user message
- generar assistant response
- append assistant message
- actualizar `lastMessageAt`
- registrar usage privado
- streaming SSE si corresponde

Reglas:

- mensajes append-only
- ownerId sale de sesión
- no chat público aquí

Checklist:

- manda mensaje privado
- recibe respuesta
- ambos mensajes se guardan
- usage queda registrado
