# Product Navigation, Sharing Identity And Background Sync

## Status

accepted

## Related plans

`12A-app-shell-navigation-dashboard.md`, `15-share-links-api.md`, `16-share-metrics-api.md`, `17-share-tab-ui.md`, `18-interact-shell-ui.md`, `21-public-link-resolver-api.md`, `22-public-avatar-ui.md`, `23-public-session-api.md`, `24B-elevenlabs-agent-provider-sync.md`, `24C-elevenlabs-knowledge-base-context-sync.md`

## Date

2026-06-19

## Context

YUNI ya tiene el flujo base de creacion, edicion, perfil e Interact privado con ElevenLabs + LiveAvatar. Al proyectar el producto final, aparecieron necesidades de producto que cambian la forma de organizar los planes pendientes:

- `Mis avatares` debe ser el centro operativo, con avatares propios y avatares compartidos.
- `Interactuar` debe sentirse como una accion sobre un avatar, no como una seccion principal independiente.
- Los creadores necesitan compartir avatares con alumnos o usuarios identificables, revisar actividad, transcripts y progreso por persona.
- La sincronizacion tecnica de Agent/Knowledge Base no debe ser una tarea manual del usuario.

## Options considered

1. Mantener `Interact` como tab principal y compartir solo por links sin identificacion de participante.
2. Usar solo cuentas para alumnos y eliminar links publicos.
3. Usar `Mis avatares` como centro, compartir por link con email e invitaciones por cuenta, e implementar sync silencioso.

## Decision

YUNI adopta la tercera opcion:

- La navegacion privada principal se centra en `Inicio` y `Mis avatares`.
- `Mis avatares` muestra filtros `Todos`, `Propios` y `Compartidos conmigo`.
- `Interactuar` se abre desde un avatar y navega a una ruta profunda como `/interact/[avatarId]`.
- El perfil owner se organiza en `Informacion`, `Contexto`, `Compartir` y `Actividad`.
- Sharing soporta links publicos con email obligatorio e invitaciones/accesos por email o cuenta.
- Las sesiones publicas guardan `participantEmail` y, si corresponde, `participantUserId`.
- El creador puede revisar metricas, transcripts y resumen de progreso por alumno/email.
- La sincronizacion con ElevenLabs Agent/Knowledge Base corre en background con jobs, fingerprints, backoff y reintentos automaticos.
- La UI normal no muestra botones de sync como accion principal. Solo muestra estados de producto: `Listo`, `Procesando` o `No se pudo actualizar`.

## Rationale

El usuario piensa en avatares y alumnos, no en rutas ni providers. Poner `Mis avatares` como centro reduce friccion y permite que el mismo catalogo sirva para creadores y usuarios que reciben un avatar.

Pedir email antes de usar un link publico habilita reportes utiles sin obligar a crear cuenta. Si luego existe una cuenta con ese email, YUNI puede vincular historial y permisos.

La sincronizacion manual expone un detalle tecnico que deberia ser invisible. El sistema debe conservar la fuente de verdad local, reintentar automaticamente y usar la ultima version valida del contexto cuando el provider falle.

## Implementation notes

- Los endpoints de force-sync pueden existir para soporte, dev o admin, pero no deben aparecer como CTA principal.
- Los planes publicos deben usar `participantEmail` como identidad primaria, manteniendo IP/session id solo para rate limits y antifraude.
- Las metricas y usage deben poder agruparse por avatar, link, grant, sesion, email y usuario vinculado.
- La tab `Contexto` debe hablar de contexto/documentos, no de Knowledge Base o provider IDs.
- La llamada no debe bloquearse por fallos no criticos de sync si hay una version anterior valida del Agent/contexto.

## User/product impact

El creador puede crear un avatar, cargar contexto, compartirlo con alumnos y revisar uso sin administrar sincronizacion tecnica. El alumno puede entrar por link con email, usar el avatar y luego recuperar su historial si crea o ya tiene cuenta.

## Cost/UX/security tradeoffs

- UX: email obligatorio agrega un paso, pero habilita seguimiento de progreso y reduce sesiones sin trazabilidad.
- Seguridad: compartir por email/cuenta exige revisar permisos en todas las rutas de conversation, transcript, usage y public session.
- Operacion: background sync requiere jobs, retries y observabilidad, pero evita fallos visibles en flujos de creacion/edicion.
- Privacidad: antes de iniciar una sesion compartida, la UI debe avisar que el creador puede ver actividad y transcripts.

## Sources

- Plan de producto acordado el 2026-06-19 en la iteracion de estructura final de YUNI.
- Decision previa de Knowledge Base: [0007-elevenlabs-knowledge-base-context-sync.md](0007-elevenlabs-knowledge-base-context-sync.md)
- Decision previa de llamada privada: [0004-elevenlabs-liveavatar-private-call-mvp.md](0004-elevenlabs-liveavatar-private-call-mvp.md)

## Evidence to collect later

- Si pedir email reduce o aumenta abandono antes de iniciar una sesion publica.
- Calidad de agrupacion de transcripts por alumno/email.
- Tiempo promedio de sync background y tasa de retries.
- Frecuencia de llamadas iniciadas con contexto parcialmente desactualizado.

## Open questions

- Si el alumno debe poder ocultar su historial al creador en algun modo futuro.
- Si conviene agregar grupos/cursos como capa sobre access grants por email.
- Que umbral convierte fallos repetidos de sync en alerta visible para soporte.
