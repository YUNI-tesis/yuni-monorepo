# Voice Agent Provider Strategy

## Status

superseded

## Related plan

[24A-agent-voice-architecture-context-contract.md](../../plan-prompts/24A-agent-voice-architecture-context-contract.md)

## Date

2026-06-04

Superseded by [0002-plan-24a-elevenlabs-first-mvp-option.md](0002-plan-24a-elevenlabs-first-mvp-option.md).

## Context

YUNI necesita que los creadores configuren avatares con contexto personalizado y que los usuarios puedan conversar con esos avatares de forma fluida. La experiencia objetivo requiere baja latencia, interrupciones naturales, buena calidad de voz, RAG sobre documentos del creador y control de persistencia de conversaciones.

El plan 24A define la arquitectura de agente, contexto y voz realtime. Durante el analisis se comparo la arquitectura OpenAI Realtime + LangChain + LiveAvatar LITE contra ElevenLabs Agents como alternativa de agente conversacional completo.

## Options considered

1. OpenAI Realtime + LangChain + LiveAvatar LITE como arquitectura principal.
   - OpenAI maneja el loop speech-to-speech de baja latencia.
   - LangChain/YUNI conservan ownership de tools, retrieval, memoria, contexto, permisos y persistencia.
   - LiveAvatar LITE actua como renderer visual sincronizado por audio.

2. ElevenLabs Agents + LiveAvatar LITE connector.
   - ElevenLabs ofrece STT, LLM configurable, TTS, turn-taking, interrupciones, soft timeouts, widget, SDKs, analytics y testing.
   - Reduce esfuerzo inicial y puede mejorar la UX de voz out-of-the-box.
   - Puede mover parte del agente, contexto, RAG y observabilidad fuera del backend de YUNI.

3. Pipeline encadenado STT -> LangChain/text agent -> TTS -> LiveAvatar.
   - Da control explicito sobre cada etapa.
   - Tiene mas riesgo de latencia, peor barge-in y menor naturalidad.
   - Sirve como fallback o demo, no como loop principal si la conversacion fluida es prioritaria.

## Decision

Mantener OpenAI Realtime + LangChain + LiveAvatar LITE como arquitectura primaria del plan 24A.

Dejar ElevenLabs Agents como alternativa de spike y provider opcional futuro, no como reemplazo inmediato. El repo ya admite extensibilidad conceptual con `voiceConfig.provider = "openai" | "elevenlabs"`, pero no hay implementacion real de providers de voz todavia.

## Rationale

La tesis necesita mostrar valor en un producto de avatares contextuales creado por YUNI, no solo integrar un voice bot hosted. La arquitectura primaria mantiene dentro de YUNI el contexto del creador, RAG, autorizacion, transcripts, costos, uso y criterios de persistencia.

OpenAI recomienda speech-to-speech con live audio sessions cuando la prioridad es conversacion natural, baja latencia, barge-in, turn taking y tools realtime. LiveAvatar LITE encaja con esa decision porque su responsabilidad es renderizar video en tiempo real desde audio, mientras YUNI conserva STT, LLM, TTS y orquestacion.

ElevenLabs Agents es fuerte para demo y experiencia de voz lista para usar, pero antes de adoptarlo como principal hay que validar que no degrade el control de contexto, seguridad, trazabilidad y costos que YUNI necesita para el informe y el producto.

## Implementation notes

- El plan 24A debe seguir definiendo OpenAI Realtime como loop principal, LangChain como capa de agente/tools/retrieval/memoria y LiveAvatar LITE como renderer.
- ElevenLabs debe quedar representado como provider opcional o spike comparativo, sin bloquear el contrato principal.
- Antes de promover ElevenLabs a arquitectura primaria, validar:
  - integracion real con LiveAvatar LITE connector o stream de audio compatible
  - forma de inyectar contexto de YUNI sin duplicar documentos de forma insegura
  - soporte para sesiones privadas y publicas con permisos de YUNI
  - persistencia de transcripts y eventos en el modelo de datos propio
  - costo/minuto medido en escenarios reales

## User/product impact

La decision prioriza una experiencia de avatar contextual controlada por YUNI. Esto aumenta esfuerzo de implementacion, pero permite que el creador suba contexto propio, que el agente lo use con permisos claros y que el producto mida conversaciones, calidad y costos de forma consistente.

ElevenLabs queda disponible para validar rapidamente UX de voz o como provider premium/futuro si demuestra mejor calidad sin perder control de producto.

## Cost/UX/security tradeoffs

- Costos: ElevenLabs Agents ofrece pricing por minuto de hosting conversacional y cobra LLM por separado. Si se combina con LiveAvatar LITE, tambien se suma el costo de creditos/minuto de LiveAvatar. OpenAI Realtime usa pricing por tokens de audio/texto, por lo que el costo real depende de duracion, historial, tool calls, caching y truncation.
- UX: ElevenLabs puede dar mejor UX inicial por sus controles de turn-taking, interrupciones y soft timeouts. OpenAI Realtime requiere mas implementacion, pero permite controlar mejor el contrato del agente y las tools.
- Seguridad: mantener contexto, RAG y autorizacion en YUNI reduce riesgo de exponer documentos, prompts, storage keys o datos internos en sesiones publicas.

## Sources

- OpenAI Voice Agents: https://developers.openai.com/api/docs/guides/voice-agents
- OpenAI Realtime and audio: https://developers.openai.com/api/docs/guides/realtime
- OpenAI Realtime conversations: https://developers.openai.com/api/docs/guides/realtime-conversations
- OpenAI Realtime costs: https://developers.openai.com/api/docs/guides/realtime-costs
- OpenAI gpt-realtime-2 pricing: https://developers.openai.com/api/docs/models/gpt-realtime-2
- LiveAvatar LITE overview: https://docs.liveavatar.com/docs/lite-mode/overview
- LiveAvatar integration paths: https://docs.liveavatar.com/docs/lite-mode/integration-paths
- LiveAvatar credits: https://docs.liveavatar.com/docs/faq/credits
- ElevenLabs Agents overview: https://elevenlabs.io/docs/eleven-agents/overview
- ElevenLabs Agents pricing: https://elevenlabs.io/pricing/agents
- ElevenLabs Agents cost help: https://help.elevenlabs.io/hc/en-us/articles/29298065878929-How-much-does-ElevenAgents-cost
- ElevenLabs conversation flow: https://elevenlabs.io/docs/eleven-agents/customization/conversation-flow
- ElevenLabs WebSocket API: https://elevenlabs.io/docs/eleven-agents/libraries/web-sockets
- ElevenLabs custom LLM: https://elevenlabs.io/docs/eleven-agents/customization/llm/custom-llm

## Evidence to collect later

- Comparacion de 5 guiones iguales en OpenAI Realtime y ElevenLabs Agents.
- Latencia hasta primer audio, tasa de interrupciones correctas y errores de turn-taking.
- Costo real por minuto en llamadas de 5 y 10 minutos.
- Calidad de respuestas con contexto corto y con documentos subidos.
- Screenshots o clips de la experiencia con LiveAvatar LITE.

## Open questions

- El connector de LiveAvatar para ElevenLabs permite mantener el contexto y la autorizacion completamente bajo control de YUNI?
- ElevenLabs permite extraer eventos, transcripts y costos con suficiente granularidad para el dashboard de YUNI?
- Que proveedor ofrece mejor experiencia en espanol rioplatense con interrupciones frecuentes?
- Conviene ofrecer ElevenLabs como provider premium despues del MVP?
