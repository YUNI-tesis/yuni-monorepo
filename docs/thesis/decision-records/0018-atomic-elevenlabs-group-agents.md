# Agents atómicos de ElevenLabs en llamadas grupales

## Estado

superseded

Reemplazado por [ADR 0023: Floor grupal preemptivo exclusivo del usuario](0023-user-preemptible-group-call-floor.md).

## Contexto

Cada avatar ya tiene en ElevenLabs una identidad, un modelo conversacional, una voz y una Knowledge Base sincronizada. Separar la redacción de la respuesta de ese Agent duplicaba procesamiento, aumentaba la latencia y producía una experiencia de voz distinta a la llamada individual.

## Decisión

YUNI mantiene un floor controller persistente y usa LangGraph solamente como director de la ronda:

- clasifica el pedido humano, elige hasta tres participantes y fija su orden;
- crea una instrucción privada para cada participante, pero nunca redacta su respuesta pública;
- envía primero `contextual_update` con roster y transcript compartido, y después `user_message` con la instrucción del turno;
- cada ElevenLabs Agent consulta exclusivamente su propia Knowledge Base, genera su respuesta y la convierte en voz;
- LiveAvatar publica el texto real y los eventos de inicio y fin; YUNI persiste esa respuesta y sólo entonces habilita al siguiente Agent;
- durante la ronda el micrófono no puede abrir un turno nuevo. Al finalizar, el piso vuelve al humano;
- la señal inicial obligatoria de cada Agent se silencia en el navegador y no forma parte del transcript.

Los Agents grupales siguen siendo réplicas separadas de los Agents directos para poder aplicar reglas de brevedad, conciencia grupal y ausencia de muletillas sin cambiar las llamadas individuales. Voz, TTS y referencias documentales son las mismas.

## Consecuencias

La ruta crítica tiene una sola decisión del director y una sola generación de contenido, ejecutada por el Agent que hablará. No existe recuperación documental paralela en YUNI. La secuencia conserva posiciones fijas, una intervención por avatar y transcript común, mientras que un participante degradado no detiene a los restantes.

## Referencias

- [ElevenLabs Agents JavaScript SDK](https://elevenlabs.io/docs/eleven-agents/libraries/java-script)
- [ElevenLabs Knowledge Base RAG](https://elevenlabs.io/docs/eleven-agents/customization/knowledge-base/rag)
- [LiveAvatar ElevenLabs Agent Connector](https://docs.liveavatar.com/docs/lite-mode/connectors/elevenlabs-agent)
