# Conversación predeterminada de los nuevos avatares

Al crear un avatar, YUNI lee los defaults del entorno del servidor y guarda el modelo y el perfil dentro de `voiceConfig`. El formulario omite esos campos para que la configuración del servidor tenga efecto. Una elección explícita mediante API se respeta. El repositorio también aplica los defaults a creaciones internas que omitan los campos.

## Variables que administrar

En el `.env` de la raíz para desarrollo, o en las variables del servicio API para staging/producción:

```dotenv
AVATAR_DEFAULT_CONVERSATION_MODEL=gpt-5.4
AVATAR_DEFAULT_CONVERSATION_PROFILE=natural
```

`AVATAR_DEFAULT_CONVERSATION_MODEL` define el LLM de los próximos avatares; `AVATAR_DEFAULT_CONVERSATION_PROFILE` acepta `natural` o `standard`. Si se omiten, los defaults son `gpt-5.4` y `natural`. Los valores vacíos y los perfiles inválidos se rechazan al arrancar.

Reiniciá o redesplegá la API después de cambiarlas. El cambio afecta las creaciones siguientes: los avatares ya creados conservan sus valores guardados, incluso al editar o cambiar de voz. No hace falta recompilar el frontend. Configurá las mismas variables en cualquier otro proceso que cree avatares directamente; el worker de sincronización usa la configuración que ya quedó guardada.

Las variables anteriores de ElevenLabs siguen teniendo otro alcance y deben ser consistentes en API y worker:

| Variable                     | Valor actual recomendado | Alcance                                                                                                                                    |
| ---------------------------- | ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------ |
| `ELEVENLABS_AGENT_LLM_MODEL` | `gpt-4o-mini`            | Modelo de grupos y fallback para avatares sin `conversationModel` guardado.                                                                |
| `ELEVENLABS_AGENT_TTS_MODEL` | `eleven_v3`              | Modelo de voz global; en perfil natural se resuelve a `eleven_v3_conversational` con expresividad. Otros modelos configurados se respetan. |

Cambiar estas dos variables requiere reiniciar los procesos y sincronizar los agentes afectados; no actualiza por sí solo la configuración remota de ElevenLabs. No se encola una sincronización masiva al cambiar el entorno. El TTS sigue siendo global, por lo que su cambio también puede afectar avatares existentes y grupos al sincronizarse.

`OPENAI_DEFAULT_MODEL` configura otros usos de OpenAI en YUNI; no el LLM de estas llamadas, que administra ElevenLabs.

## Comportamiento con los defaults recomendados

Las llamadas individuales de los avatares creados con esos defaults usan:

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
