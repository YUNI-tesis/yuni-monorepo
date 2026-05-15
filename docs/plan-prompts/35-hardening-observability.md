# Prompt: Hardening Y Observability

Armame un plan específico para hardening final del MVP.

Objetivo:
Revisar seguridad, errores, logs y cleanup antes de validar el MVP con usuarios.

Debe incluir:

- request ids
- logs estructurados
- redacción de secrets
- error boundaries frontend
- errores API consistentes
- cleanup jobs
- cleanup Live Avatar sessions
- revisión permisos micrófono
- revisión CORS/cookies

Reglas:

- no loguear passwords
- no loguear cookies/JWT
- no exponer prompts/contexto en público
- production env debe fallar temprano si faltan secrets

Checklist:

- logs útiles en API/realtime/worker
- errores 4xx/5xx consistentes
- cleanup funciona
- build/test/lint/typecheck pasan
