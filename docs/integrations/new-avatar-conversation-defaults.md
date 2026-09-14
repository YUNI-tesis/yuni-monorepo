# Conversación predeterminada de los nuevos avatares

Desde el 14/09/2026, crear un avatar en YUNI guarda `conversationProfile: "natural"` y `conversationModel: "gpt-5.4"` dentro de `voiceConfig`. El servidor aplica estos valores aunque el cliente los omita. La interfaz de creación también los envía. Una elección explícita mediante API se respeta.

Las llamadas individuales nuevas usan:

| Configuración                      | Valor                                              |
| ---------------------------------- | -------------------------------------------------- |
| Modelo de conversación             | GPT-5.4 (`gpt-5.4`, no Mini)                       |
| Razonamiento                       | `none`                                             |
| Voz, con el entorno predeterminado | `eleven_v3_conversational`, Expressive Mode activo |
| Toma de turnos                     | `normal`                                           |
| Longitud                           | Breve según el contexto, hasta 512 tokens          |
| Temperatura                        | 0.4                                                |

Se heredan el prompt flexible, las interrupciones nativas sin instrucción adicional de cambio de tema y la corrección del historial del perfil natural. La voz, personalidad, idioma regional y conocimiento elegidos por el creador siguen perteneciendo a cada avatar: las instrucciones argentinas de Tomy no se copian a otros.

Guardar cambios, incluso elegir otra voz, conserva el modelo y el perfil. Los clientes antiguos que omiten estos campos al actualizar tampoco los eliminan. Leer o editar un avatar anterior sin estos campos no lo migra automáticamente.

`ELEVENLABS_AGENT_LLM_MODEL` continúa como fallback para avatares anteriores sin `conversationModel` y para agentes grupales. El override individual no cambia el payload ni el fingerprint de grupos. En el perfil natural, el valor histórico TTS `eleven_v3` se resuelve al identificador correcto `eleven_v3_conversational`.

El worker sincroniza el agente con su conocimiento y verifica el modelo de voz remoto. Si el proveedor rechaza expresividad, conserva el fallback documentado y registra el modelo efectivo. `providerVoiceState` describe TTS; no debe confundirse con la verificación del LLM. El modelo configurado se puede comprobar en `conversation_config.agent.prompt.llm` mediante GET del agente.

No se requiere una migración adicional: `conversationModel` se guarda en el JSON existente. Sigue siendo necesaria la migración `20260913120000_direct_voice_profile_state` del perfil natural.

La [evidencia de creación y sincronización](../thesis/evidence/2026-09-14-new-avatar-defaults.json) verifica configuración real, sin iniciar una llamada. La naturalidad y la latencia de GPT-5.4 deben evaluarse durante conversaciones reales.

Fuentes: [GPT-5.4](https://developers.openai.com/api/docs/models/gpt-5.4), [modelos y razonamiento de ElevenLabs](https://elevenlabs.io/docs/eleven-agents/customization/llm).
