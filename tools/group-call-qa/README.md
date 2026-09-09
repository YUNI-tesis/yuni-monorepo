# QA reproducible de llamadas grupales

Herramientas manuales para separar entrega del protocolo, procesamiento del Agent, audio recibido y lifecycle de la aplicación. No forman parte del producto ni reemplazan QA físico.

## Seguridad y prerrequisitos

- Los runs reales requieren `--run` y `LIVEAVATAR_SANDBOX=true`; `APP_ENV=production` se rechaza. El sandbox LiveAvatar dura aproximadamente un minuto. ElevenLabs puede consumir créditos aunque LiveAvatar sea sandbox.
- Se necesita el workspace instalado, Node 20+, Chrome y un runtime externo con Playwright. Indicar su `node_modules` absoluto mediante `YUNI_QA_NODE_MODULES`. No se agrega Playwright ni se modifica el lockfile del proyecto.
- Por defecto se usa el canal `chrome`, perfil efímero y micrófono ficticio. Para otro ejecutable, usar `--browser-path=/ruta/al/browser` o `YUNI_QA_BROWSER_PATH`.
- Cargar las claves mediante el entorno o `node --env-file=.env`; nunca pegarlas como argumentos. Se necesitan `LIVEAVATAR_API_KEY`, `LIVEAVATAR_ELEVENLABS_SECRET_ID` y `ELEVENLABS_API_KEY` para el probe de protocolo. No se imprimen tokens, cookies, prompts, transcripciones ni respuestas textuales.
- Los reportes JSON se generan en un directorio temporal nuevo. `--output-dir=/ruta/qa` permite conservarlos explícitamente. Contienen IDs y nombres de participantes: revisarlos antes de compartir. No comitear reportes crudos o archivos de credenciales.
- Los bloques `finally` cierran exclusivamente las sesiones creadas por ese run. No limpian sesiones anteriores ni datos. Una terminación forzada del proceso puede impedir la limpieza: revisar los IDs registrados y el estado del proveedor, sin detener otras llamadas.
- No ejecutar dos probes simultáneos sobre los mismos Agents: la búsqueda de conversaciones sin metadata inequívoca responde `inconclusive` si hay más de una candidata.

Los comentarios `/* global ... */` declaran el entorno Node/browser para ESLint sin cambiar la configuración global del repositorio. `browser.js` sólo se compila dentro del harness; no hay hooks de QA en código de producción.

## 1. Probe del protocolo real

`probe.mjs` abre de uno a tres connectors reales en paralelo y envía los turnos secuencialmente. Mantiene `voiceChat.defaultMuted: true` por defecto, sin cambiar la configuración remota de los Agents. El payload de creación fija `is_sandbox: true` y el avatar sandbox oficial.

Smoke local, sin sesiones ni solicitudes a proveedores:

```sh
YUNI_QA_NODE_MODULES=/ruta/runtime/node_modules node tools/group-call-qa/probe.mjs
```

Definir el roster con IDs propios —los siguientes son placeholders— y ejecutar tres participantes con el API público del SDK instalado:

```sh
export YUNI_QA_NODE_MODULES=/ruta/runtime/node_modules
export YUNI_QA_AGENTS='[{"name":"QA A","agentId":"agent_REEMPLAZAR_A"},{"name":"QA B","agentId":"agent_REEMPLAZAR_B"},{"name":"QA C","agentId":"agent_REEMPLAZAR_C"}]'
node --env-file=.env tools/group-call-qa/probe.mjs --run --group --variant=official
```

También se acepta `--agents='[...]'`. Sin `--group` se usa el primer participante, o el elegido mediante `--avatar='QA A'`.

Comparación controlada del envelope, manteniendo texto, Agent y configuración:

```sh
node --env-file=.env tools/group-call-qa/probe.mjs --run --variant=omitted
node --env-file=.env tools/group-call-qa/probe.mjs --run --variant=uuid
node --env-file=.env tools/group-call-qa/probe.mjs --run --variant=custom
```

- `omitted`: envelope anterior sin `event_id`.
- `uuid`: mismo envelope, con UUID.
- `custom`: mismo envelope, con `group-turn:provider-probe:...`.
- `official`: `ElevenLabsAgentSession.sendContextualUpdate()` y `.sendUserMessage()`; el SDK construye el envelope completo.

Para baseline del SDK anterior, extraer su tarball en un directorio temporal e indicar el **export publicado**, sin cambiar el proyecto:

```sh
node --env-file=.env tools/group-call-qa/probe.mjs --run --group --variant=omitted --sdk-file=/ruta/sdk-0.0.17/package/lib/index.esm.js
```

No usar archivos JS internos no bundleados para inferir el contrato público: el paquete 0.0.18 contiene archivos internos desactualizados. `--voice-chat=off` permite probar ese eje por separado. `--text='Respondé en dos oraciones...'` permite repetir con respuestas largas; no combinar cambios de modelo, voz o configuración en la misma comparación.

### Qué demuestra

El reporte correlaciona eventos SDK/LiveKit, IDs, latencias y muestras PCM de 50 ms. Comprueba recepción exacta del pedido y respuesta posterior en ElevenLabs. Un `publishData()` resuelto o un ID devuelto por el SDK **no** cuentan como recepción confirmada.

El probe conserva el owner audible durante una ventana de observación de un segundo después del primer `speak_ended`. Es instrumentación del experimento, **no** una política implementada en la aplicación. Por eso, que pase el probe no demuestra que `GroupInteractCall` reproduzca la respuesta completa.

## 2. Aplicación completa, con entrada Scribe determinista

`full-app.mjs` usa la página real de grupos, el componente real, API local, orquestador y SDK/proveedor reales. Requiere `--group-id` y sólo acepta URLs loopback. El default es `http://localhost:3000`; se puede cambiar con `--app-url=http://127.0.0.1:3000`.

Prerrequisitos específicos:

- Web/API locales en ejecución; configuración `API_INTERNAL_URL` también local.
- Docker Compose `postgres`, base **local de desarrollo** `yuni_dev`, usuario `yuni`. La consulta de owner y roster es de sólo lectura. El runner no admite una base remota ni modifica migraciones.
- Un grupo existente de dos o tres participantes sincronizados. Se usa una cookie JWT efímera de diez minutos, firmada con el `AUTH_SECRET` local y el owner encontrado; no crea usuarios ni guarda credenciales o estado de autenticación.
- Claves LiveAvatar/ElevenLabs para verificar sandbox y recoger evidencia. Antes de permitir `SDK.start()`, intercepta la respuesta de creación, consulta la metadata de cada sesión creada y exige `is_sandbox === true`. Si la metadata es inaccesible o no lo confirma, bloquea el inicio y termina únicamente esa sesión grupal.

Dry-run, sin autenticación, consultas ni llamadas:

```sh
node tools/group-call-qa/full-app.mjs --group-id=ID_DEL_GRUPO_LOCAL
```

Run real:

```sh
node --env-file=.env tools/group-call-qa/full-app.mjs --run --group-id=ID_DEL_GRUPO_LOCAL
```

**Este comando sí modifica estado**: inicia/finaliza una llamada y guarda conversación, mensajes, eventos y consumo de prueba mediante la API normal. Iniciar puede resincronizar los Agents grupales con el perfil vigente del código; el reporte guarda los siete campos TTS relevantes y su SHA256 antes/después. No elimina el historial generado ni restaura configuraciones automáticamente.

El runner hace clic en la UI e inyecta un `committed_transcript` a través de la ruta WebSocket de Scribe. No llama directamente al endpoint de turnos. El SDK de Scribe permanece real, pero la transcripción es simulada y su micrófono es ficticio: **no valida STT real, eco, interrupciones humanas o comportamiento físico del micrófono**. LiveKit y los otros WebSockets no se interceptan.

## Lectura de resultados y límites de aceptación

Cada proveedor se consulta hasta `done`/`failed`, con espera acotada de 45 segundos y requests de hasta 15 segundos. Si sigue procesando, falla la lectura o no hay una conversación identificable de forma única, el resultado es `inconclusive`: no se interpreta la ausencia provisional de transcript como rechazo. Los resultados `failed` e `inconclusive` terminan con exit code distinto de cero.

El full-app separa:

| Campo                              | Significado                                                                                                                                                        |
| ---------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `roundPassed`                      | Todos los participantes recibieron un turno, reportaron fin y el backend volvió a escuchar. No demuestra reproducción completa.                                    |
| `audioDetectedForEveryParticipant` | Se detectó alguna energía PCM con cada elemento reproduciendo y sin mute. No demuestra inteligibilidad ni ausencia de cortes.                                      |
| `maxUnmutedElements`               | Máximo observado cada 50 ms; debe ser uno como máximo. No prueba que no hubiera una transición más corta entre muestras.                                           |
| `mutedNonSilentSamplesAfterInput`  | Muestras PCM no silenciosas recibidas mientras el elemento estaba muteado después de la intervención de prueba. Un valor positivo invalida este baseline acústico. |
| `acousticCheck`                    | Falla si falta audio audible, hay superposición observada o existen muestras no silenciosas muteadas. Es `inconclusive` si falta instrumentación.                  |
| `outcome`                          | Resultado combinado de recorrido, proveedor e instrumentación. Sólo es `passed` si todas esas comprobaciones pasan.                                                |

Una forma de falla importante es `speak_ended → gate muted → PCM todavía no silencioso`, seguida o no de otro `speak_started`. Revisar `media.samples` junto con `media.wallStartedAt`, `injection.at` y los timestamps API. Aunque `roundPassed`, recepción en ElevenLabs y conteo de un solo owner pasen, esa secuencia puede cortar una palabra: **no declararla aceptada**.

El RMS usa umbral heurístico `0.001`, no escucha ni mide calidad perceptual. La instrumentación tiene resolución de 50 ms, puede perder transiciones breves y no repara audio. Incluso un `passed` necesita comparación con la grabación fuente, respuestas cortas/largas, desktop/mobile, parlantes/auriculares y escucha humana. Los casos de interrupción requieren una etapa adicional; estas herramientas conservan el checkpoint de recuperación básica.

## Validación local de las herramientas

```sh
node --check tools/group-call-qa/probe.mjs
node --check tools/group-call-qa/browser.js
node --check tools/group-call-qa/full-app.mjs
node --test tools/group-call-qa/runtime.test.mjs
pnpm exec eslint tools/group-call-qa
pnpm exec prettier --check tools/group-call-qa
```

Las pruebas de `runtime.test.mjs` no usan red ni proveedores. Cubren guardas de URL/sandbox, roster, ausencia de texto en resultados y estado `processing` que vence como inconcluso.
