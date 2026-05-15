# Prompt: Realtime Service Foundation

Armame un plan específico para la base de `apps/realtime`.

Objetivo:
Preparar WebSocket service para sesiones privadas y públicas.

Debe incluir:

- server WebSocket
- protocolo de eventos
- validación de sesión privada/pública
- state machine básica
- errores
- request/session ids
- tests de state machine

Reglas:

- no implementar voz completa todavía
- no Live Avatar real todavía si va en módulo posterior
- protocolo debe quedar estable

Checklist:

- conexión abre/cierra
- session.init valida modo
- errores son consistentes
