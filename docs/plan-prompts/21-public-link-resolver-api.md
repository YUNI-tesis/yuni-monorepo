# Prompt: Public Link Resolver API

Armame un plan especifico para resolver links publicos.

Objetivo:
Permitir que visitantes obtengan datos publicos seguros de un avatar por slug y sepan que deben identificarse por email antes de iniciar.

Endpoints:

- `GET /public/links/:slug/avatar`
- `POST /public/links/:slug/identify`

Debe incluir:

- resolver `ShareLink` activo
- bloquear link desactivado
- respuesta publica segura
- capabilities text/voice
- identify con email requerido
- normalizacion y validacion de email
- deteccion opcional de cuenta existente para ofrecer login/vinculacion
- token corto de pre-session o identity proof si hace falta
- tests

No exponer:

- ownerId
- instructions
- context
- documentos
- storage keys
- provider secrets
- costos internos
- lista de otros participantes

Reglas:

- el visitante no inicia sesion conversacional sin email
- si el email corresponde a una cuenta, se puede sugerir login sin revelar informacion sensible
- link inexistente o desactivado no permite identify

Checklist:

- slug activo devuelve avatar publico
- slug inexistente o desactivado bloquea
- respuesta no contiene campos privados
- identify valida email y deja trazabilidad para la sesion posterior
