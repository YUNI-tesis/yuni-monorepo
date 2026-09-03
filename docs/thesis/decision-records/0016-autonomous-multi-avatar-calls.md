# Llamadas autónomas con múltiples avatares

## Estado

superseded

## Contexto

LiveAvatar LITE crea una sala y un renderer por token; el connector de ElevenLabs está asociado a un único avatar y un único Agent. No existe una sesión nativa que renderice dos o tres avatares independientes. Abrir el micrófono de cada connector produciría además transcripciones duplicadas y respuestas simultáneas.

## Decisión

YUNI compone una llamada grupal autenticada con dos o tres sesiones independientes:

- una sesión LiveAvatar LITE y un ElevenLabs Agent por avatar;
- un único Scribe Realtime v2 con VAD como dueño del micrófono;
- Agents grupales separados de los directos, sin saludo inicial y mudos hasta recibir `user_message` por el canal `agent-control`;
- un director híbrido: primero resuelve menciones por nombre y luego usa OpenAI con salida estructurada;
- en un turno normal responden como máximo dos avatares distintos; cuando el usuario pide explícitamente una ronda completa, los dos o tres participantes responden exactamente una vez y en secuencia;
- si OpenAI no responde, un fallback determinista habilita una sola respuesta normal o completa la ronda explícita en el orden fijo del grupo;
- el cliente conserva posiciones visuales estables, bloquea nuevas intervenciones mientras un avatar tiene la palabra y espera `AVATAR_SPEAK_ENDED` antes de dirigir el siguiente turno;
- las llamadas individuales y grupales comparten el mismo shell, stage, controles e historial; el stage maximiza un único participante y compone un mosaico estable cuando recibe dos o tres;
- si una sesión falla, la llamada continúa mientras quede al menos un participante activo y ofrece reintento individual.

La experiencia grupal vive en la sección privada `/groups`, accesible desde la navegación principal. Allí se crean y editan grupos, se inicia la llamada y se consulta el historial. Las posiciones de los participantes respetan siempre el orden guardado del grupo. `/interact` deja de ser una página de índice y redirige a `/groups`; las llamadas individuales conservan sus enlaces contextuales existentes.

Cada turno se persiste inmediatamente con `sourceEventId` idempotente y `speakerAvatarId`. La conversación guarda un snapshot `ConversationAvatar`, por lo que todos los creadores de avatares participantes pueden consultar la transcripción aunque el grupo sea editado después.

Los tokens de LiveAvatar se cifran en reposo exclusivamente para cierre y cleanup. Se eliminan al terminar. La sesión tiene un máximo de diez minutos y heartbeat autenticado.

## API

- `GET|POST /avatar-groups`
- `GET|PATCH|DELETE /avatar-groups/:groupId`
- `POST /avatar-groups/:groupId/voice-sessions`
- `POST /group-voice-sessions/:sessionId/scribe-token`
- `POST /group-voice-sessions/:sessionId/turns`
- `POST /group-voice-sessions/:sessionId/participants/:avatarId/retry`
- `POST /group-voice-sessions/:sessionId/heartbeat`
- `POST /group-voice-sessions/:sessionId/end`
- `GET /group-conversations`
- `GET /group-conversations/:conversationId`

## Consecuencias

La solución respeta los contratos publicados por ambos providers y evita mezclar micrófonos, pero el costo crece linealmente: una llamada con tres avatares consume tres sesiones LiveAvatar y tres conversaciones ElevenLabs, además de Scribe y las decisiones OpenAI. El cliente también debe sostener hasta tres streams de video; en mobile la grilla pasa a una columna y destaca al hablante activo sin cambiar el orden ni el tamaño de las posiciones.

El MVP no ofrece links públicos de grupos, edición del grupo durante una llamada ni más de tres participantes. La lista y el detalle del historial aplican el permiso acordado para todos los creadores de avatares participantes, incluso si el grupo original fue eliminado.

> Nota adicional (2026-08-31): [ADR 0025](0025-shareable-avatar-groups.md) reemplaza la exclusión de
> sharing público, la autorización histórica basada en dueños de avatares miembros y el lifecycle
> destructivo del grupo. Este ADR continúa superseded: ADR 0018 y ADR 0019 contienen las decisiones
> vigentes de proyección de Agents, floor, degradación y orquestación.

## Referencias

- [LiveAvatar ElevenLabs Agent Connector](https://docs.liveavatar.com/docs/lite-mode/connectors/elevenlabs-agent)
- [ElevenLabs Scribe JavaScript SDK](https://elevenlabs.io/docs/eleven-api/resources/libraries/scribe-stt/javascript-scribe)
- [ElevenLabs single-use tokens](https://elevenlabs.io/docs/api-reference/tokens/create)
