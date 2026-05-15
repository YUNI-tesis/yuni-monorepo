# Prompt: Share Metrics API

Armame un plan específico para métricas básicas de Share.

Objetivo:
Calcular métricas agregadas por avatar y por link compartido.

Endpoint:

- `GET /avatars/:avatarId/share-metrics`

Métricas:

- totalSessions
- totalConversations
- totalMessages
- totalVoiceMinutes
- estimatedCostUsd
- lastUsedAt
- métricas por link

Debe incluir:

- queries eficientes con Prisma
- agregación desde `UsageEvent`, `PublicSession`, `Conversation`, `Message`
- ownership
- tests

Reglas:

- no analytics por día
- no visitantes únicos exactos salvo que salga gratis de `anonymousId`
- costos son estimados

Checklist:

- agrega métricas de todos los links del avatar
- devuelve métricas por link
- no expone datos públicos sensibles
