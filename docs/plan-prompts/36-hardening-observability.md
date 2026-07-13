# Prompt: Hardening Y Observability

Armame un plan especifico para hardening final del MVP.

Objetivo:
Revisar seguridad, errores, logs, sync background y cleanup antes de validar el MVP con usuarios.

Debe incluir:

- request ids
- logs estructurados
- redaccion de secrets
- error boundaries frontend
- errores API consistentes
- cleanup jobs
- cleanup Live Avatar sessions
- observabilidad de cola de provider/context sync
- retries, fallos permanentes y dead-letter si aplica
- revision permisos microfono
- revision CORS/cookies
- auditoria de permisos owner/shared/public

Reglas:

- no loguear passwords
- no loguear cookies/JWT
- no loguear emails en claro si no hace falta; preferir redaccion/hash en logs operativos
- no exponer prompts/contexto/documentos en publico o usuarios compartidos
- production env debe fallar temprano si faltan secrets
- fallos de sync no deben romper avatar si hay version previa valida

Checklist:

- logs utiles en API/realtime/worker
- errores 4xx/5xx consistentes
- cleanup funciona
- sync background tiene metricas y alertas basicas
- permisos de transcripts/actividad estan cubiertos
- build/test/lint/typecheck pasan
