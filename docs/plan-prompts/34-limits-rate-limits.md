# Prompt: Limits Y Rate Limits

Armame un plan específico para límites anti-abuso.

Objetivo:
Proteger endpoints públicos y privados con límites básicos.

Debe incluir:

- rate limit por IP/anonymousId
- límites de sesión pública:
  - 5 minutos
  - 20 mensajes
- máximo sesiones públicas por avatar por hora
- configuración desde env
- errores `429`
- tests

Reglas:

- no bloquear desarrollo local de forma molesta
- público es prioridad
- límites configurables

Checklist:

- exceso de mensajes bloquea
- exceso de sesiones bloquea
- rate limit devuelve 429
