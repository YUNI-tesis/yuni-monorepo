# Prompt: Realtime Service Foundation

> Estado: superseded el 2026-08-24. Este servicio WebSocket no se implementará para la arquitectura
> vigente; el navegador usa los SDK de los providers con tokens efímeros entregados por la API. La
> entidad de dominio `RealtimeSession` permanece activa. Ver decision record `0021`.

Armame un plan especifico para la base de `apps/realtime`.

Objetivo:
Preparar WebSocket service para sesiones privadas, compartidas y publicas identificadas.

Debe incluir:

- server WebSocket
- protocolo de eventos
- validacion de sesion privada owner
- validacion de usuario compartido con grant activo
- validacion de sesion publica con token y `participantEmail`
- state machine basica
- errores
- request/session ids
- tests de state machine

Reglas:

- no implementar voz completa todavia
- no Live Avatar real todavia si va en modulo posterior
- protocolo debe quedar estable
- no iniciar participante publico sin email de sesion
- no exponer prompts/contexto/documentos por eventos realtime

Checklist:

- conexion abre/cierra
- session.init valida modo owner/shared/public
- public init exige identidad de sesion
- errores son consistentes
