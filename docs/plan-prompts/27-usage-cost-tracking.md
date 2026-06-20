# Prompt: Usage Y Cost Tracking

Armame un plan especifico para registrar uso y costos estimados.

Objetivo:
Registrar eventos de uso para chat, embeddings, STT, TTS, Live Avatar y provider sync relevante.

Debe incluir:

- `UsageEventRepository`
- cost calculator
- pricing desde `packages/config`
- registro en flujos privados, compartidos y publicos
- helpers para sumar por avatar/link/grant/session/email/user

Identidades a soportar:

- owner privado: `ownerId`
- usuario compartido: `participantUserId?`, `participantEmail`, `accessGrantId?`
- participante publico: `participantEmail`, `participantUserId?`, `shareLinkId`, `publicSessionId`

Reglas:

- costos son estimados
- publico incluye `shareLinkId`, `publicSessionId` y `participantEmail`
- compartido autenticado incluye grant/user/email cuando aplique
- privado owner incluye `ownerId`
- no exponer costos internos en endpoints publicos
- IP/session id pueden alimentar antifraude, pero los reportes de progreso se agrupan por email/cuenta

Checklist:

- registra tokens in/out
- registra audio seconds
- calcula costUsd
- metricas Share pueden consumir estos datos
- actividad por alumno/email puede consumir estos datos
