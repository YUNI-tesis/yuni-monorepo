# Prompt: Public Session API

Armame un plan especifico para sesiones publicas identificadas por email.

Objetivo:
Crear y finalizar sesiones publicas asociadas a un share link y a un participante identificable.

Endpoints:

- `POST /public/links/:slug/sessions`
- `POST /public/sessions/:sessionId/end`

Debe incluir:

- `PublicSession`
- conversacion publica asociada
- `participantEmail`
- `participantUserId?` cuando el email este vinculado a una cuenta
- token publico corto
- validar link activo
- validar identidad previa o email en el request
- actualizar `ShareLink.lastUsedAt`
- trazabilidad para metricas por alumno/email

Reglas:

- visitante no requiere cuenta, pero si email
- conversacion publica no tiene ownerId del participante
- sesion publica se atribuye a `shareLinkId`
- bloquear nuevas sesiones si link desactivado
- no exponer prompts/contexto/documentos al participante
- session id/IP quedan para antifraude y rate limits; la identidad de producto es el email

Checklist:

- crear sesion publica con email
- vincular cuenta si corresponde
- finalizar sesion
- link desactivado bloquea
- token publico no expone secretos
