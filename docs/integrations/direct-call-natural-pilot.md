# Piloto natural de llamadas individuales

Desde el 14/09/2026, el perfil natural también se aplica automáticamente a los avatares nuevos, con GPT-5.4. Consultá la [configuración de nuevos avatares](new-avatar-conversation-defaults.md). Esta guía conserva la operación por avatar y la evidencia histórica del piloto.

El perfil `voiceConfig.conversationProfile: "natural"` se activa por avatar. Sin ese campo se conserva `standard`; los agentes grupales mantienen su configuración habitual.

Tomy (`cmtay26rk00kr8y6gfvmg847i`) quedó verificado por GET el 13/09/2026 a las 22:15 de Buenos Aires: `eleven_v3_conversational`, `expressive_mode: true`, sin fallback. Antes usaba Flash sin expresividad. La [evidencia](../thesis/evidence/2026-09-13-direct-call-natural-pilot.json) confirma configuración; ese sondeo automatizado no inició una llamada. En pruebas manuales posteriores, el usuario confirmó una mejora audible del perfil natural de Tomy.

## Comportamiento

El piloto configura toma de turnos `normal`, respuestas de hasta 512 tokens y un prompt más flexible en longitud, personalidad y reacciones. Mantiene temperatura `0.4`, el LLM configurado y la voz elegida. El saludo pasa a «Hola, soy [nombre]».

El identificador de V3 para Agents es `eleven_v3_conversational`, según la [documentación oficial de modelos](https://elevenlabs.io/docs/overview/models). En `natural`, YUNI traduce el valor histórico `eleven_v3` a ese identificador; `standard` conserva el modelo configurado. Si el proveedor rechaza expresividad, puede aplicar Flash como fallback.

`providerVoiceState` guarda separadamente modelo solicitado, efectivo, Expressive Mode, motivo del fallback, perfil y fecha de verificación. El backend habilita el comportamiento natural del frontend según ese estado verificado, no solamente por el perfil solicitado. Mientras un avatar natural está sincronizando o falló, no inicia llamadas usando una versión anterior potencialmente modificada.

Las interrupciones naturales no inyectan la instrucción adicional que interpreta siempre un nuevo pedido. Las correcciones de ElevenLabs actualizan el transcript usando identidad y texto original; los eventos ambiguos no reemplazan arbitrariamente el último turno.

## Aplicación y reversión

Desde la raíz, con el entorno y las credenciales habituales del worker:

```sh
pnpm db:migrate:deploy
pnpm db:generate
pnpm exec tsx tools/direct-call-qa/pilot.ts --avatar-id ID
pnpm exec tsx tools/direct-call-qa/pilot.ts --avatar-id ID --profile natural
pnpm exec tsx tools/direct-call-qa/pilot.ts --avatar-id ID --apply --profile natural
```

La migración `20260913120000_direct_voice_profile_state` agrega el estado JSONB. Sin `--apply`, la CLI solo inspecciona.

Aplicá sin llamadas en curso ni nuevos inicios. La CLI sincroniza mediante el worker de Knowledge Base conservando voz y referencias locales. Compará también las referencias remotas de conocimiento antes/después.

Para reintentar expresividad tras un fallback, agregá `--retry-expressive` al comando de aplicación. Para volver al comportamiento estándar:

```sh
pnpm exec tsx tools/direct-call-qa/pilot.ts --avatar-id ID --apply --profile standard
```

Revisá `remoteVoice`, `storedVoice` y el resultado; `applied_with_fallback` no confirma V3. Un fallo requiere nueva inspección. La reversión no recupera cambios manuales históricos. Consultá la [guía de la CLI](../../tools/direct-call-qa/README.md).

## Comparación manual

Usá el mismo agente, voz y ajustes en ElevenLabs directo y YUNI. Repetí:

- Una pausa a mitad de frase y luego completala.
- Interrumpir para corregir un dato; después, «sí, seguí» sin cambiar de tema.
- Asentimientos «sí» y «claro» mientras responde.
- Una buena noticia, frustración y una explicación neutra.

Registrá cortes prematuros, recuperación del contexto y expresividad percibida. El timeline del hook conserva 80 eventos con `performance.now()`: son tiempos de recepción del proveedor, no mediciones de voz audible. No registra audio ni prompts. Este piloto no garantiza asentimientos simultáneos del agente mientras habla el usuario.
