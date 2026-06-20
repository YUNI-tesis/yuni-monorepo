# Prompt: Limits Y Rate Limits

Armame un plan especifico para limites anti-abuso.

Objetivo:
Proteger endpoints publicos, compartidos y privados con limites basicos.

Debe incluir:

- rate limit por IP
- rate limit por `participantEmail`
- rate limit por cuenta cuando exista `participantUserId`
- limites de sesion publica:
  - 5 minutos
  - 20 mensajes
- maximo sesiones publicas por avatar/link por hora
- limites por access grant si aplica
- configuracion desde env
- errores `429`
- tests

Reglas:

- no bloquear desarrollo local de forma molesta
- publico es prioridad
- limites configurables
- usar email/cuenta como dimensiones principales de producto
- IP/session id se usan para antifraude, no como sustituto de email

Checklist:

- exceso de mensajes bloquea
- exceso de sesiones bloquea
- abuso por email bloquea
- abuso por IP bloquea
- rate limit devuelve 429
