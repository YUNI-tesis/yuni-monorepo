# Prompt: Usage Y Cost Tracking

Armame un plan específico para registrar uso y costos estimados.

Objetivo:
Registrar eventos de uso para chat, embeddings, STT, TTS y Live Avatar.

Debe incluir:

- `UsageEventRepository`
- cost calculator
- pricing desde `packages/config`
- registro en flujos privados/públicos
- helpers para sumar por avatar/link/session

Reglas:

- costos son estimados
- público incluye `shareLinkId` y `publicSessionId`
- privado incluye `ownerId`
- no exponer costos internos en endpoints públicos

Checklist:

- registra tokens in/out
- registra audio seconds
- calcula costUsd
- métricas Share pueden consumir estos datos
