# Prompt: OpenAI Adapter Y Prompt Builder

Estado: implementado parcialmente el 2026-06-21. `packages/ai` tiene adapter minimo para generar titulos de conversaciones con OpenAI Responses API y fallback controlado. Quedan pendientes la interfaz general de LLM provider, prompt builder de respuestas del avatar, RAG futuro y metadata de pricing.

Armame un plan específico para `packages/ai`.

Objetivo:
Crear adapter OpenAI y prompt builder para respuestas del avatar.

Debe incluir:

- interface LLM provider
- OpenAI adapter
- prompt builder
- input con avatar instructions/context
- soporte para chunks RAG futuros
- errores controlados
- pricing metadata si aplica

Reglas:

- no llamar OpenAI desde UI
- no exponer system prompt
- provider mockeable para tests
- LangGraph no se usa en v1

Checklist:

- prompt builder arma mensajes correctos
- adapter mock funciona
- errores de provider quedan normalizados
