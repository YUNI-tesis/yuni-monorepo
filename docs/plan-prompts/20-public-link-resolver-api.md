# Prompt: Public Link Resolver API

Armame un plan específico para resolver links públicos.

Objetivo:
Permitir que visitantes anónimos obtengan datos públicos seguros de un avatar por slug.

Endpoint:

- `GET /public/links/:slug/avatar`

Debe incluir:

- resolver `ShareLink` activo
- bloquear link desactivado
- respuesta pública segura
- capabilities text/voice
- tests

No exponer:

- ownerId
- instructions
- context
- documentos
- storage keys
- provider secrets
- costos internos

Checklist:

- slug activo devuelve avatar público
- slug inexistente o desactivado bloquea
- respuesta no contiene campos privados
