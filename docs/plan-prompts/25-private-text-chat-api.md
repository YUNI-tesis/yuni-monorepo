# Prompt: Private And Shared Text Chat API

Armame un plan especifico para chat de texto autenticado.

Objetivo:
Permitir que el owner o un usuario con acceso compartido mande mensajes a un avatar y reciba respuesta AI.

Endpoint:

- `POST /conversations/:conversationId/messages`

Debe incluir:

- validar ownership o grant activo
- append user message
- generar assistant response
- append assistant message
- actualizar `lastMessageAt`
- registrar usage privado o compartido
- streaming SSE si corresponde
- atribucion a:
  - `ownerId` para owner
  - `participantUserId` y/o `participantEmail` para usuario compartido
  - `accessGrantId` si aplica

Reglas:

- mensajes append-only
- ownerId sale de sesion
- usuario compartido no ve prompts/contexto/documentos internos
- no chat publico por link aqui; eso vive en `26`
- no permitir mensajes si el grant fue revocado

Checklist:

- owner manda mensaje privado
- usuario compartido manda mensaje si tiene grant activo
- respuesta se guarda
- ambos mensajes se guardan
- usage queda registrado con identidad correcta
