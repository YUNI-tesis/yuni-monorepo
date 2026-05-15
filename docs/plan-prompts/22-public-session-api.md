# Prompt: Public Session API

Armame un plan específico para sesiones públicas anónimas.

Objetivo:
Crear y finalizar sesiones públicas asociadas a un share link.

Endpoints:

- `POST /public/links/:slug/sessions`
- `POST /public/sessions/:sessionId/end`

Debe incluir:

- `PublicSession`
- conversación pública asociada
- anonymousId
- token público corto
- validar link activo
- actualizar `ShareLink.lastUsedAt`

Reglas:

- visitante no requiere cuenta
- conversación pública no tiene ownerId
- sesión pública se atribuye a `shareLinkId`
- bloquear nuevas sesiones si link desactivado

Checklist:

- crear sesión pública
- finalizar sesión
- link desactivado bloquea
- token público no expone secretos
