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
- Claves LiveAvatar/ElevenLabs para verificar sandbox y recoger evidencia. Antes de `SDK.start()`, inspecciona sólo claims permitidos del token recién recibido por la API loopback autenticada: `is_sandbox` o `start_session_data.is_sandbox` deben ser booleanos verdaderos, `exp` numérico debe seguir vigente y `sid`/`session_id` deben coincidir con el participante cuando existan. Claims ausentes, desconocidos, contradictorios o expirados bloquean el inicio.
- Esa decodificación **no verifica criptográficamente la firma JWT**; confía en la procedencia de la API propia autenticada y se registra como `signatureVerified: false`. No debe reutilizarse para aceptar tokens arbitrarios. Una vez conectado el roster, antes de inyectar Scribe, exige además `GET` del proveedor con HTTP 200 y `is_sandbox === true`. Si falla, cierra sólo la llamada propia y no envía el pedido.

El `GET` previo a `start` resultó HTTP 400 en los tres participantes del intento instrumentado: no se interpreta como `sandbox=false`. El protocolo distingue [crear el token](https://docs.liveavatar.com/api-reference/sessions/create-session-token) de [iniciar la sesión](https://docs.liveavatar.com/docs/lite-mode/lifecycle); la guarda usa claims antes de esa materialización y [metadata de sesión](https://docs.liveavatar.com/api-reference/sessions/get-session) después. El flag de creación está documentado en [Sandbox Mode](https://docs.liveavatar.com/docs/sandbox-mode), pero la ubicación exacta de los claims no constituye aquí una garantía contractual del proveedor: si cambia, la herramienta falla cerrada y requiere revisar evidencia.

Dry-run, sin autenticación, consultas ni llamadas:

```sh
node tools/group-call-qa/full-app.mjs --group-id=ID_DEL_GRUPO_LOCAL
```

Run real:

```sh
node --env-file=.env tools/group-call-qa/full-app.mjs --run --group-id=ID_DEL_GRUPO_LOCAL
```

Cada llamada solicita una respuesta de todos los participantes. Elegir longitud y layout sin mezclar otras variables:

```sh
node --env-file=.env tools/group-call-qa/full-app.mjs --run --group-id=ID_DEL_GRUPO_LOCAL --response=short --layout=desktop
node --env-file=.env tools/group-call-qa/full-app.mjs --run --group-id=ID_DEL_GRUPO_LOCAL --response=long --layout=mobile
```

`short` pide una palabra; `long` pide dos oraciones de unas veinte palabras por avatar, para permanecer dentro del sandbox. El orquestador/LLM puede variar redacción o duración. `--text` permite un pedido específico sin guardarlo en el reporte. `mobile` emula viewport 390 × 844, touch y escala 3 en Chrome: no equivale a Safari ni a un teléfono físico.

Para repetición controlada, cada iteración abre una llamada independiente y un perfil efímero nuevo:

```sh
node --env-file=.env tools/group-call-qa/repeat.mjs --run --calls=3 --group-id=ID_DEL_GRUPO_LOCAL --response=short --layout=desktop
```

La repetición es secuencial, admite de una a seis llamadas y se detiene al primer error o resultado inconcluso. Cada llamada consume sus propias sesiones y deja su propio reporte/historial; no comparte cookies persistidas entre iteraciones. Sin `--run` sólo describe la repetición.

**Este comando sí modifica estado**: inicia/finaliza una llamada y guarda conversación, mensajes, eventos y consumo de prueba mediante la API normal. Iniciar puede resincronizar los Agents grupales con el perfil vigente del código; el reporte guarda los siete campos TTS relevantes y su SHA256 antes/después. No elimina el historial generado ni restaura configuraciones automáticamente.

El runner hace clic en la UI e inyecta un `committed_transcript` a través de la ruta WebSocket de Scribe. No llama directamente al endpoint de turnos. El SDK de Scribe permanece real, pero la transcripción es simulada y su micrófono es ficticio: **no valida STT real, eco, interrupciones humanas o comportamiento físico del micrófono**. LiveKit y los otros WebSockets no se interceptan.

La instrumentación observa `RTCDataChannel.send` y mensajes recibidos sin modificar los bytes, el retorno nativo ni reenviar paquetes. Extrae sólo metadata de JSON dentro del paquete LiveKit: tipo, IDs y tiempo local. Si el formato deja de ser reconocible, el conteo de comandos no se considera probado y la aceptación queda inconclusa. No usa ese observador para gobernar el floor.

## Lectura de resultados y límites de aceptación

Cada proveedor se consulta hasta `done`/`failed`, con espera acotada de 45 segundos y requests de hasta 15 segundos. Si sigue procesando, falla la lectura o no hay una conversación identificable de forma única, el resultado es `inconclusive`: no se interpreta la ausencia provisional de transcript como rechazo. Los resultados `failed` e `inconclusive` terminan con exit code distinto de cero.

El full-app separa:

| Campo                                                                                    | Significado                                                                                                                              |
| ---------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| `roundPassed`                                                                            | Todos los participantes reportaron fin y el backend volvió a escuchar. No demuestra reproducción completa.                               |
| `acousticEvidence.participants[].responseAudibleSamples`                                 | Energía PCM de la ventana de respuesta mientras el elemento reproduce sin mute ni volumen cero. No prueba inteligibilidad.               |
| `maxUnmutedElements`                                                                     | Máximo observado cada 20 ms en full-app; debe ser uno como máximo. No prueba que no hubiera una transición más corta entre muestras.     |
| `acousticEvidence.participants[].responseBlockedSamples`                                 | Muestras no silenciosas en la ventana de respuesta con mute, volumen cero o reproducción pausada. Deben ser cero.                        |
| `acousticEvidence.participants[].userMessageCount`                                       | Comandos salientes `user_message` observados por participante. Debe ser exactamente uno, sin redelivery ante continuaciones.             |
| `acousticEvidence.participants[].continuationSuppressions` / `providerInterruptCommands` | Supresiones backend o comandos interrupt posteriores al inicio de la respuesta. Deben ser cero en este baseline sin barge-in.            |
| `acousticEvidence.ignoredPreResponseSamples`                                             | Audio posterior al input pero anterior a evidencia de la respuesta: puede ser un saludo tardío, no se acredita como respuesta escuchada. |
| `acousticEvidence.unattributedNonSilentSamples`                                          | Parte de ese audio temprano que estaba audible. Impide declarar aceptación aunque las respuestas posteriores se completen.               |
| `acousticCheck`                                                                          | Falla por cortes, superposición o comandos extra; queda inconcluso si no hay atribución/instrumentación suficiente.                      |
| `outcome`                                                                                | Resultado combinado; sólo es `passed` si todas las comprobaciones pasan.                                                                 |

Una forma de falla importante es `speak_ended → gate muted → PCM todavía no silencioso`, seguida o no de otro `speak_started`. Revisar `media.samples`, `media.wallStartedAt`, `injection.browserAtMs`, `media.commands`, `media.providerEvents` y los timestamps API. `requestObservedAt` y `responseObservedAt` son observaciones de Playwright, **no timestamps del evento del proveedor**. Aunque `roundPassed`, recepción en ElevenLabs y conteo de un solo owner pasen, esa secuencia puede cortar una palabra: **no declararla aceptada**.

La ventana por avatar comienza en un evento de generación/habla correlacionado con el ID del comando saliente; si esa correlación falta, se declara `attribution: api_turn_observation` y se usa el primer evento de generación/habla reportado con turnId. El audio temprano queda separado para no confundir un saludo con una respuesta. Estas son asociaciones temporales, no una atribución acústica exacta de cada muestra. Un inicio autónomo o audio ambiguo merece investigación, no una afirmación de palabras escuchadas.

`fixtures/legacy-tail-cut.json` conserva un extracto anonimizado del QA anterior: timestamps observados y muestras PCM originales, sin texto ni IDs reales. El replay excluye cinco muestras audibles tempranas sin atribución y aún detecta 3/5/7 muestras de respuesta bloqueadas más una supresión tardía por participante. Esa evidencia no se elimina aumentando el conteo de audio total.

El RMS usa umbral heurístico `0.001`, no escucha ni mide calidad perceptual. La instrumentación full-app muestrea cada 20 ms (probe aislado: 50 ms); puede perder transiciones breves y no repara audio. Incluso un `passed` necesita comparación con la grabación fuente, respuestas cortas/largas, desktop/mobile, parlantes/auriculares y escucha humana. Los casos de interrupción requieren una etapa adicional; estas herramientas conservan el checkpoint de recuperación básica.

El plazo de 45 segundos del full-app corresponde a **toda la ronda de QA**, no a un watchdog del producto ni a una falla de red. Se informa como `QaDeadlineExceeded` con `timeoutMs`, sin publicar el texto del error. Tres respuestas extensas pueden agotarlo: usar `--text` para una frase de extensión fija permite comparar cierres dentro del sandbox, conservando el intento incompleto como no aprobado. El [checkpoint del 2026-09-09](../../docs/thesis/evidence/2026-09-09-group-speech-completion.md) registra ambos casos. La suite reproduce sus tuplas sanitizadas y también la regresión anterior; no requiere acceder a proveedores para recalcular esos resultados.

## Validación local de las herramientas

```sh
node --check tools/group-call-qa/probe.mjs
node --check tools/group-call-qa/browser.js
node --check tools/group-call-qa/full-app.mjs
node --test tools/group-call-qa/runtime.test.mjs tools/group-call-qa/acoustic-evidence.test.mjs tools/group-call-qa/observer.test.mjs
pnpm exec eslint tools/group-call-qa
pnpm exec prettier --check tools/group-call-qa
```

Las pruebas no usan red ni proveedores. Cubren guardas de URL/sandbox, roster, ausencia de texto y estado `processing` inconcluso; replay de la falla anterior, finalización silenciosa, saludo tardío, duplicados, supresiones, overlap y volumen cero; y que el observador conserve exactamente los paquetes sin almacenar su contenido.
