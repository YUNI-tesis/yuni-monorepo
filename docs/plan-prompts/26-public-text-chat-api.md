# Prompt: Public Text Chat API

Armame un plan especifico para chat de texto publico identificado por email.

Objetivo:
Permitir que participantes con sesion publica activa interactuen por texto con avatar compartido.

Endpoint:

- `POST /public/sessions/:sessionId/messages`

Debe incluir:

- validar public session activa
- validar share link activo
- validar token publico de sesion
- append user/assistant messages
- respuesta AI
- usage con `shareLinkId`, `publicSessionId`, `participantEmail` y `participantUserId?`
- limites basicos por sesion/email/IP si aplica

Reglas:

- participante no requiere cuenta, pero la sesion debe tener email
- no exponer prompts/contexto/documentos
- mensajes append-only
- si el link se desactiva, bloquear nuevas interacciones segun regla elegida
- transcripts quedan visibles para el owner desde `Actividad`

Checklist:

- participante envia mensaje
- respuesta se guarda
- link desactivado bloquea nuevas interacciones
- usage publico queda atribuido a link, sesion y email
