# Prompt: Share Activity And Metrics API

Estado: implementado parcialmente. El 2026-08-16 se agregó el agregado owner-level para dashboard con actividad por email/avatar, comparación temporal, recurrencia, sesiones, duración, profundidad y alertas. Quedan pendientes costos y el desglose específico por link/grant.

Armame un plan especifico para metricas y actividad de avatares compartidos.

Objetivo:
Calcular metricas agregadas por avatar, link, grant y participante identificado por email/cuenta.

Endpoint:

- `GET /avatars/:avatarId/share-metrics`

Metricas:

- totalSessions
- totalConversations
- totalMessages
- totalVoiceMinutes
- estimatedCostUsd
- lastUsedAt
- metricas por link
- metricas por grant/acceso
- metricas por `participantEmail`
- metricas por `participantUserId` cuando exista cuenta vinculada

Debe incluir:

- queries eficientes con Prisma
- agregacion desde `UsageEvent`, `PublicSession`, `Conversation`, `Message` y access grants
- ownership
- filtros por rango de fechas si no complica el MVP
- tests

Reglas:

- no analytics por dia en MVP salvo que salga simple
- los reportes de producto deben agruparse por email/cuenta
- IP/session id pueden usarse para antifraude/rate limits, no para reportes pedagogicos principales
- costos son estimados
- no exponer datos publicos sensibles
- transcripts detallados viven en `Actividad`, pero este endpoint puede devolver contadores y referencias

Checklist:

- agrega metricas de todos los links del avatar
- devuelve metricas por link
- devuelve metricas por email/usuario vinculado
- no expone datos de otros owners
