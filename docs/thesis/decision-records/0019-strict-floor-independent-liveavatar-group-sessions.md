# Floor estricto con sesiones LiveAvatar grupales independientes

## Estado

superseded

Reemplazado por [ADR 0023: Floor grupal preemptivo exclusivo del usuario](0023-user-preemptible-group-call-floor.md).

## Contexto

YUNI necesita conversaciones dirigidas por una persona con dos o tres avatares, posiciones fijas, un único hablante por vez y contexto compartido. Cada avatar ya existe como un ElevenLabs Agent con instrucciones, Knowledge Base, modelo, TTS y voz propios. Separar la redacción pública de ese Agent aumentó la latencia y degradó la voz, por lo que ADR 0018 estableció al Agent como unidad atómica.

LiveAvatar no ofrece en FULL Mode una orquestación nativa que reúna varios avatares independientes con estos Agents. El equipo de LiveAvatar sugirió BYO LiveKit como posible evolución, pero todavía no existe evidencia suficiente de que una sala compartida conserve el connector nativo de ElevenLabs, su RAG y el aislamiento de comandos entre múltiples workers.

## Decisión

Estabilizamos la arquitectura de sesiones independientes:

- una sesión LiveAvatar LITE administrada por cada avatar y una sola conexión Scribe para el usuario;
- un ElevenLabs Agent grupal atómico por avatar, con Knowledge Base, generación, TTS y voz nativos;
- un router semántico rápido en YUNI que decide participantes, orden e instrucciones privadas, pero no redacta la respuesta pública;
- un floor controller persistente que autoriza exactamente un turno y una intervención por avatar dentro de cada ronda;
- `contextual_update` acotado a 9.000 bytes, con roster y transcript público reciente inmediatamente antes del `user_message` privado del avatar elegido;
- todos los medios grupales muteados por defecto y un gate del navegador que habilita únicamente al dueño vigente del piso;
- `user_activity` periódico para evitar respuestas automáticas por `turn_timeout` y supresión local de cualquier inicio no autorizado;
- posiciones visuales y orden colectivo tomados del snapshot de participantes creado al iniciar la conversación;
- un attempt inmutable por conexión, identificado por su `RealtimeSession.id`, para que eventos de una conexión anterior no puedan degradar un retry vigente;
- cleanup durable y cifrado de cada sesión LiveAvatar mediante el outbox `session_cleanup`, incluso cuando el usuario termina la llamada, elimina un avatar o cierra el navegador durante un fallo del provider.

El backend es la autoridad sobre la ronda, el lease y el dueño del floor. Con salas independientes no puede mutear directamente los tracks remotos: la audibilidad se impone en el navegador y se refuerza interrumpiendo sólo la sesión infractora. No enviar `user_message` evita generación dirigida; `user_activity` reduce la generación autónoma por inactividad; el audio gate garantiza que una respuesta no autorizada no sea audible dentro de la aplicación.

Se mantienen `turn_timeout=30` y `soft_timeout=-1` para Agents grupales. Las llamadas individuales conservan su configuración, micrófono e interrupción actuales.

## Alternativas

- **Sala compartida con BYO LiveKit:** postergada hasta validar el connector en un spike aislado. No está descartada.
- **Bridge PCM:** no se adopta como alternativa predeterminada porque reemplazaría el flujo nativo de Agent, RAG y TTS y aumentaría superficie operativa y latencia.
- **Custom LLM grupal o respuesta pública preplanificada:** descartados para este flujo porque duplican generación y separan la respuesta del Agent configurado.

## Consecuencias

La arquitectura tiene costo lineal por avatar y el mute autoritativo de tracks no vive en el backend. A cambio, reutiliza integraciones ya verificadas, conserva la calidad y el conocimiento de cada Agent, evita una migración de infraestructura de alto riesgo y permite cerrar el MVP con reglas de turno observables y testeables.

Una caída individual degrada la llamada sin mover los demás mosaicos ni cancelar el floor válido. Los fallos guardan una receipt durable por evento y el attempt que los originó: una redelivery o una primera entrega tardía de una conexión anterior no vuelve a degradar al participante. Los eventos tardíos, duplicados o no autorizados quedan como auditoría y nunca avanzan o liberan una ronda ajena.

El navegador escucha tanto el cierre funcional del Agent como la desconexión terminal de la sesión, deduplica ambos por attempt y reintenta el reporte con el mismo `sourceEventId` hasta recibir ACK. El backend conserva la autoridad: activar, fallar, renovar o finalizar exige CAS contra sesión, participante, attempt y floor vigentes.

Las llamadas con avatares compartidos mantienen el modelo de privacidad existente: cada creador puede consultar el transcript donde participó su avatar. Antes de crear la sesión, YUNI presenta un consentimiento único que enumera los avatares compartidos involucrados.

## Evolución futura

El roadmap conserva la tarea **“Evaluar una sala multiavatar compartida con BYO LiveKit”**. La decisión sólo podrá reabrirse después de un spike de dos avatares en LiveKit Cloud Build que mantenga el connector nativo de ElevenLabs, confirme RAG/voz/TTS, demuestre control backend de tracks y compare latencia, costo y complejidad con esta solución. El spike debe solicitar a LiveAvatar el POC o contrato de API aplicable y no asumir un bridge PCM.

## Referencias

- [LiveAvatar LITE configuration](https://docs.liveavatar.com/docs/lite-mode/configuration)
- [LiveAvatar ElevenLabs Agent Connector](https://docs.liveavatar.com/docs/lite-mode/connectors/elevenlabs-agent)
- [ElevenLabs client-to-server events](https://elevenlabs.io/docs/eleven-agents/customization/events/client-to-server-events)
- [ElevenLabs Knowledge Base](https://elevenlabs.io/docs/eleven-agents/customization/knowledge-base)
- [ADR 0018: Agents atómicos de ElevenLabs](0018-atomic-elevenlabs-group-agents.md)
