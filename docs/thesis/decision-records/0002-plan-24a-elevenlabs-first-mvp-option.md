# ElevenLabs-first MVP Voice Option

## Status

accepted

## Related plan

[24A-agent-voice-architecture-context-contract.md](../../plan-prompts/24A-agent-voice-architecture-context-contract.md)

## Date

2026-06-04

## Context

Despues de revisar demos y documentacion, ElevenLabs Agents aparece como una alternativa fuerte para lograr rapido una experiencia conversacional fluida. El objetivo de YUNI sigue siendo que el creador pueda configurar avatares y subir contexto propio, pero no necesariamente que YUNI implemente desde el primer MVP todo el loop STT/LLM/TTS/RAG.

LiveAvatar LITE documenta conectores para hosted voice agents, incluyendo ElevenLabs Agents. ElevenLabs Agents ya ofrece STT, LLM configurable, TTS, turn-taking, interrupciones, Knowledge Base/RAG, tools, SDKs, analytics y testing.

## Options considered

1. Mantener OpenAI Realtime + LangChain + LiveAvatar LITE como unica ruta primaria.
   - Mayor control de RAG, tools, permisos y persistencia desde YUNI.
   - Mas riesgo de implementacion y UX inicial, porque hay que construir el bridge realtime completo.

2. Agregar ElevenLabs Agents + LiveAvatar LITE como opcion para MVP/spike.
   - Menor esfuerzo para validar UX de conversacion.
   - Permite usar Knowledge Base de ElevenLabs para validar la feature de contexto del creador.
   - Duplica documentos/contexto en un provider externo y reduce control fino al inicio.

3. Usar pipeline STT -> text agent -> TTS -> LiveAvatar.
   - Control explicito por etapa.
   - Menor naturalidad y mas riesgo de latencia/interrupciones.

## Decision

Agregar a 24A una ruta ElevenLabs-first argumentada:

- YUNI conserva la fuente de verdad de creadores, avatares, documentos, permisos y estado de sincronizacion.
- ElevenLabs Agents puede manejar la conversacion en el MVP: STT, LLM, TTS, turn-taking, interrupciones y Knowledge Base/RAG.
- LiveAvatar LITE renderiza el avatar mediante ElevenLabs Agent Connector o flujo equivalente.
- La ruta OpenAI Realtime/LangChain sigue documentada como opcion de mayor control.
- La evolucion preferida para recuperar control sin perder UX es ElevenLabs Custom LLM apuntando a un endpoint de YUNI con RAG propio.

## Rationale

Para una tesis, es importante llegar a una demo convincente que muestre valor de producto: creadores configuran contexto y usuarios conversan con avatares de forma natural. ElevenLabs-first reduce el riesgo de UX y permite validar rapido interrupciones, latencia, voz y uso de contexto.

El tradeoff de control se mitiga dejando a YUNI como fuente de verdad y tratando ElevenLabs como provider sincronizado. Si el MVP funciona, se puede evolucionar gradualmente hacia RAG propio y Custom LLM sin descartar la experiencia de voz de ElevenLabs.

## Implementation notes

- 24A ahora debe separar Ruta A OpenAI/YUNI y Ruta B ElevenLabs-first.
- Agregar contratos de provider: `agentProvider`, `providerAgentId`, `providerDocumentId`, `syncStatus`, `lastSyncedAt`.
- En ElevenLabs-first, sincronizar contexto/documentos publicados desde YUNI hacia ElevenLabs Knowledge Base.
- Si un documento se borra o despublica en YUNI, debe borrarse/desasociarse del provider externo.
- Persistir solo IDs externos no secretos y errores resumidos.
- No exponer API keys de ElevenLabs en el frontend.

## User/product impact

La opcion ElevenLabs-first acelera la validacion de la experiencia principal: hablar con un avatar que tiene contexto personalizado del creador. La UI y el flujo siguen siendo de YUNI; ElevenLabs queda como infraestructura interna.

## Cost/UX/security tradeoffs

- UX: mejora la probabilidad de lograr conversacion fluida pronto porque ElevenLabs ya maneja turn-taking e interrupciones.
- Costos: se suma pricing de ElevenLabs Agents, LLM pass-through y LiveAvatar LITE. Debe medirse costo/minuto real en spike.
- Seguridad: hay duplicacion de contexto en ElevenLabs. Se mitiga con sync controlado, borrado, permisos y evitando subir documentos no publicados.
- Lock-in: se reduce con contratos de provider y manteniendo YUNI como fuente de verdad.

## Sources

- LiveAvatar LITE overview: https://docs.liveavatar.com/docs/lite-mode/overview
- LiveAvatar integration paths: https://docs.liveavatar.com/docs/lite-mode/integration-paths
- ElevenLabs Agents overview: https://elevenlabs.io/docs/eleven-agents/overview
- ElevenLabs WebSocket API: https://elevenlabs.io/docs/eleven-agents/libraries/web-sockets
- ElevenLabs Custom LLM: https://elevenlabs.io/docs/eleven-agents/customization/llm/custom-llm
- ElevenLabs Agents pricing: https://elevenlabs.io/pricing/agents
- OpenAI Voice Agents: https://developers.openai.com/api/docs/guides/voice-agents

## Evidence to collect later

- Spike ElevenLabs Agent + LiveAvatar LITE con un avatar real.
- Latencia hasta primer audio y comportamiento ante interrupciones.
- Calidad de respuestas con contexto corto y documentos sincronizados.
- Costo/minuto real con llamadas de 5 y 10 minutos.
- Calidad de transcripts/eventos disponibles para persistencia en YUNI.

## Open questions

- El connector de LiveAvatar para ElevenLabs alcanza para un flujo productivo o requiere bridge propio?
- Que granularidad de transcripts, usage y eventos expone ElevenLabs para guardarlos en YUNI?
- Como conviene versionar/sincronizar documentos si el creador edita contexto frecuentemente?
- Cuando conviene migrar de Knowledge Base de ElevenLabs a Custom LLM con RAG propio de YUNI?
