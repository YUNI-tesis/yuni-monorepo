# Prompt: Public Text Chat API

Armame un plan específico para chat de texto público.

Objetivo:
Permitir que visitantes anónimos interactúen por texto con avatar compartido.

Endpoint:

- `POST /public/sessions/:sessionId/messages`

Debe incluir:

- validar public session activa
- validar share link activo
- append user/assistant messages
- respuesta AI
- usage con `shareLinkId` y `publicSessionId`
- límites básicos por sesión si aplica

Reglas:

- visitante no tiene cuenta
- no exponer prompts/contexto
- mensajes append-only

Checklist:

- visitante envía mensaje
- respuesta se guarda
- link desactivado bloquea nuevas interacciones según regla elegida
- usage público queda atribuido
