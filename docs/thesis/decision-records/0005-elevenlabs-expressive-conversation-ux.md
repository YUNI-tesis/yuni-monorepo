# ElevenLabs Expressive Conversation UX

## Status

accepted

## Related plan

[24B-elevenlabs-agent-provider-sync.md](../../plan-prompts/24B-elevenlabs-agent-provider-sync.md)

## Date

2026-06-09

## Context

El MVP privado con LiveAvatar LITE + ElevenLabs ya permite hacer una llamada funcional con avatar. El siguiente problema de producto es que la conversacion puede sentirse demasiado mecanica si el agente responde rapido pero plano, corta pausas naturales o no retoma bien despues de una interrupcion.

Para la tesis, la demo necesita mostrar valor experiencial: un avatar que conversa con contexto y se percibe cercano, no solo un canal de audio que responde correctamente.

## Options considered

1. Mantener `eleven_flash_v2_5` y solo ajustar prompt.
2. Usar `eleven_v3` / Expressive Mode y ajustar turn-taking.
3. Implementar pipeline propio para controlar fade-out, audio buffer y emociones desde YUNI.

## Decision

Usar un preset expresivo en el Agent sincronizado por YUNI:

- `ELEVENLABS_AGENT_TTS_MODEL=eleven_v3` por defecto.
- Con V3, no enviar `stability`, `similarity_boost` ni `speed`, porque ElevenLabs no permite customizar esos settings en V3 Conversational.
- Fallback automatico a `eleven_flash_v2_5` si ElevenLabs devuelve `expressive_tts_not_allowed`, sin tags expresivos explicitos.
- Voice settings con mayor dinamismo en fallback Flash: `stability=0.45`, `similarity_boost=0.78`, `speed=0.98`.
- Turn-taking mas paciente con `turn_eagerness=patient`, `turn_timeout=10` y soft timeout natural.
- Backchannels cortos en `interruption_ignore_terms`.
- Prompt con reglas de muletillas controladas, emocion contextual, tags expresivos y retoma de interrupciones.
- UI con estado conversacional visible: `Escuchando`, `Pensando`, `Hablando`, `Interrumpido`.

## Rationale

Expressive Mode esta pensado justamente para delivery emocional y adaptacion de tono en Agents. Para una demo de tesis, el aumento potencial de humanidad justifica aceptar mas variabilidad que con Flash.

El diseno evita romper la arquitectura: YUNI sigue sincronizando el Agent, LiveAvatar sigue renderizando el avatar y el browser no recibe API keys. Si `eleven_v3` no esta disponible para la cuenta o la API lo rechaza, YUNI reintenta el sync con `eleven_flash_v2_5`, ajusta el prompt para no pedir tags expresivos y guarda el fingerprint del fallback para no repetir el error en cada llamada.

## Implementation notes

- El fingerprint de sync incluye el preset expresivo para forzar `PATCH` del Agent existente.
- El fingerprint tambien incluye el modelo TTS efectivo, para diferenciar `eleven_v3` de `eleven_flash_v2_5`.
- Los voice settings manuales solo se aplican en el fallback Flash, no en V3.
- La mitigacion de interrupciones no hace fade-out real porque LiveAvatar consume internamente el audio de ElevenLabs.
- Cuando llega un evento `interruption`, YUNI envia un `contextual_update` para pedir que el siguiente turno priorice el nuevo pedido sin repetir la respuesta anterior.

## User/product impact

El usuario deberia percibir una conversacion mas humana: pausas menos incomodas, menos cortes por backchannels, mas calidez emocional y respuestas menos roboticas.

## Cost/UX/security tradeoffs

- UX: mejora expresividad, pero puede aumentar variabilidad y debe validarse por voz/avatar.
- Latencia: `patient` y `eleven_v3` pueden sentirse menos inmediatos que Flash.
- Costo: ElevenLabs documenta que Eleven v3 Conversational cuesta lo mismo que otros modelos TTS de Agents, pero se debe medir costo real por minuto combinado con LiveAvatar.
- Seguridad: no cambia exposicion de secretos ni contexto; el cambio sigue siendo server-side.

## Sources

- ElevenLabs Expressive Mode: https://elevenlabs.io/docs/eleven-agents/customization/voice/expressive-mode
- ElevenLabs Conversation Flow: https://elevenlabs.io/docs/eleven-agents/customization/conversation-flow
- ElevenLabs Conversational Voice Design: https://elevenlabs.io/docs/eleven-agents/customization/voice/best-practices/conversational-voice-design
- ElevenLabs Client-to-server events: https://elevenlabs.io/docs/eleven-agents/customization/events/client-to-server-events
- LiveAvatar ElevenLabs Agent Connector: https://docs.liveavatar.com/docs/lite-mode/connectors/elevenlabs-agent

## Evidence to collect later

- Latencia percibida de primera respuesta con `eleven_v3`.
- Calidad de interrupciones con frases fuertes y backchannels.
- Si los tags expresivos suenan naturales en espanol.
- Comparacion corta entre `eleven_v3` y `eleven_flash_v2_5`.

## Open questions

- Conviene exponer un selector de preset `estable` vs `expresivo` para demos?
- Que voces concretas de ElevenLabs funcionan mejor en espanol con Expressive Mode?
