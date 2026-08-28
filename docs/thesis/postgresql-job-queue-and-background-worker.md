# Cola de trabajos en PostgreSQL y worker de background

Estado: documenta la implementacion vigente en `staging` al 2026-08-25.

Este documento explica como YUNI delega tareas lentas o dependientes de servicios externos a un proceso separado. El ejemplo principal es la sincronizacion de documentos con ElevenLabs Knowledge Base, pero la misma cola tambien se usa para sincronizar avatares, limpiar recursos externos y cerrar sesiones LiveAvatar.

Las decisiones de producto y arquitectura relacionadas estan en [ADR 0007](decision-records/0007-elevenlabs-knowledge-base-context-sync.md) y [ADR 0009](decision-records/0009-product-navigation-sharing-background-sync.md). Esta guia se concentra en como funciona la implementacion.

## Resumen para entenderlo sin contexto

La API y el worker se pueden pensar como una recepcion y un equipo de operaciones:

- La API recibe un pedido del usuario y hace solamente las validaciones necesarias para aceptarlo.
- En lugar de completar todo el trabajo en ese momento, deja un ticket en la tabla `Job` de PostgreSQL.
- La respuesta HTTP puede terminar sin esperar la descarga y el procesamiento del archivo, ElevenLabs, la indexacion RAG o el cleanup de LiveAvatar.
- Un proceso separado, el worker, busca tickets pendientes, toma uno de forma exclusiva y ejecuta la tarea.
- Si termina bien, marca el ticket como `done`. Si el error es transitorio, lo vuelve a dejar en espera. Si ya no se puede recuperar, lo marca como `failed`.

La fila en `Job` es la cola. La API no llama directamente a una funcion del worker y tampoco necesita que el worker este ejecutandose en ese mismo instante. Ambos procesos se coordinan a traves de PostgreSQL.

```text
Cliente ---- upload presignado ----> S3
   |
   | confirma la operacion
   v
  API ---- INSERT Job(status = queued) ----> PostgreSQL
   |                                             |
   v                                             | claim exclusivo
respuesta rapida                                 v
                                              Worker
                                                 |
                                                 +--> S3 / ElevenLabs / LiveAvatar
                                                 |
                                                 +--> actualiza estado y marca Job done
```

## Ejemplo principal: confirmar un documento

El flujo comienza cuando el cliente confirma que termino de subir un archivo:

```text
POST /documents/:documentId/confirm-upload
  -> controller
  -> service.confirm(...)
  -> HEAD del objeto en S3
  -> valida existencia, tamano y MIME type
  -> repository.confirmUpload(...)
  -> transaccion PostgreSQL:
       Document.status = processing
       DocumentProviderSync.status = pending
       INSERT Job(type = document_provider_sync, status = queued)
  -> respuesta HTTP

Proceso worker independiente
  -> reclama el Job
  -> descarga el archivo de S3
  -> lo crea en ElevenLabs Knowledge Base
  -> inicia o consulta el indice RAG
  -> asocia el documento al Agent del avatar
  -> Document.status = ready
  -> Job.status = done
```

El endpoint esta en [`context/controller.ts`](../../apps/api/src/domains/context/controller.ts#L75). La validacion contra S3 esta en [`context/service.ts`](../../apps/api/src/domains/context/service.ts#L95), y el cambio de estado junto con la creacion del job se realiza en una sola transaccion en [`context/repository.ts`](../../apps/api/src/domains/context/repository.ts#L131).

Actualizar el documento y crear el job dentro de la misma transaccion es importante: o se guardan ambos cambios, o no se guarda ninguno. Asi se evita que un documento quede marcado como `processing` sin una tarea durable que lo procese.

## Que componentes participan

| Componente            | Responsabilidad                                                                            |
| --------------------- | ------------------------------------------------------------------------------------------ |
| Cliente web           | Sube el archivo directamente a S3 mediante una URL presignada y luego confirma el upload.  |
| API                   | Autentica, valida ownership y estado, comprueba el objeto en S3 y crea el job.             |
| PostgreSQL            | Guarda el estado de negocio y la cola durable en la tabla `Job`.                           |
| S3-compatible storage | Conserva el archivo original para procesarlo, reintentarlo, migrarlo o eliminarlo.         |
| Worker                | Reclama jobs, ejecuta las integraciones externas y actualiza sus estados.                  |
| ElevenLabs            | Guarda documentos de Knowledge Base, calcula el indice RAG y mantiene el Agent proyectado. |
| LiveAvatar            | Recibe operaciones de cierre durable para sesiones que no deben quedar abiertas.           |

YUNI, PostgreSQL y el storage S3-compatible siguen siendo la fuente de verdad. Los recursos de ElevenLabs y LiveAvatar son proyecciones o recursos externos que el sistema intenta mantener consistentes de manera asincronica.

## Flujos que usan la cola

La implementacion vigente usa los siguientes tipos de job:

| Tipo de job                    | Que lo crea                                                                                                                 | Que hace el worker                                                                                              |
| ------------------------------ | --------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| `avatar_context_provider_sync` | Crear un avatar o modificar su contexto textual.                                                                            | Crea o actualiza el documento de texto en ElevenLabs Knowledge Base y sincroniza el Agent.                      |
| `agent_provider_sync`          | Modificar datos del avatar cuando el contexto ya esta actualizado.                                                          | Crea o actualiza el ElevenLabs Agent con nombre, instrucciones, voz y referencias de Knowledge Base vigentes.   |
| `document_provider_sync`       | Confirmar la subida de un documento o reintentar uno fallido.                                                               | Descarga desde S3, sube a ElevenLabs, espera el indice RAG, lo asocia al Agent y marca el documento como listo. |
| `provider_document_cleanup`    | Vencer un upload nunca confirmado o eliminar un documento.                                                                  | Borra el objeto de S3 y, cuando corresponde, lo desasocia del Agent y lo elimina de ElevenLabs y PostgreSQL.    |
| `avatar_provider_cleanup`      | Eliminar un avatar.                                                                                                         | Elimina Agents, documentos de Knowledge Base y archivos externos usando el snapshot guardado en el payload.     |
| `session_cleanup`              | Finalizar, reemplazar, recuperar o fallar una sesion LiveAvatar; tambien se crea al borrar un avatar con sesiones abiertas. | Detiene la sesion en LiveAvatar y borra de YUNI el token cifrado que ya no se necesita.                         |

`document_ingest` todavia existe en el enum `JobType`, pero el worker actual no lo reclama y no hay un flujo productivo que lo cree. Corresponde al diseno anterior de extraccion y chunking local. En el MVP vigente, YUNI envia el archivo original a ElevenLabs y reserva `DocumentChunk` para un RAG propio futuro.

La lista de tipos persistidos esta en [`schema.prisma`](../../packages/db/prisma/schema.prisma#L727), y los tipos efectivamente aceptados por el worker estan en [`knowledge-base-worker.ts`](../../apps/worker/src/knowledge-base-worker.ts#L62).

## Explicacion tecnica

### Estructura del job

Cada fila de `Job` contiene, entre otros campos:

- `type`: indica que operacion debe despachar el worker.
- `payload`: contiene los identificadores o el snapshot minimo necesario para ejecutarla.
- `status`: `queued`, `running`, `done` o `failed`.
- `attempts` y `maxAttempts`: controlan los reintentos.
- `dedupeKey`: evita crear dos veces el mismo trabajo logico cuando el productor usa una clave estable.
- `runAfter`: permite programar una tarea o postergar un reintento.
- `lockedAt` y `lockedBy`: registran que worker tiene la tarea.
- `errorMessage`: conserva un resumen seguro del ultimo error.

Prisma aplica `queued` cuando el productor no especifica un estado. El modelo completo esta en [`schema.prisma`](../../packages/db/prisma/schema.prisma#L549).

### Reclamo atomico y concurrencia

Cada runner del worker llama a `claimNext()`. La consulta selecciona el job `queued` mas antiguo cuyo `runAfter` ya vencio y usa `FOR UPDATE SKIP LOCKED`. En el mismo statement lo cambia a `running`, incrementa `attempts` y guarda el identificador del worker.

Esto permite ejecutar varios runners o varias instancias del worker sin que dos de ellos reclamen normalmente la misma fila. El codigo esta en [`job-repository.ts`](../../packages/db/src/repositories/job-repository.ts#L28).

Los jobs asociados a un avatar tambien usan un advisory lock de PostgreSQL. De esta manera, dos operaciones distintas no modifican al mismo tiempo la proyeccion externa de un avatar. Si el lock esta ocupado, el job se difiere brevemente sin consumir un intento.

### Polling, heartbeat y recuperacion

El proceso inicia tantos runners como indique `workerConcurrency`. Cuando no hay trabajo, cada runner espera 750 ms antes de volver a consultar. El loop esta en [`worker/main.ts`](../../apps/worker/src/main.ts#L39).

Mientras ejecuta un job, el worker actualiza `lockedAt` cada 60 segundos. Si una instancia muere y el heartbeat desaparece, otro ciclo de recuperacion devuelve a `queued` los jobs que llevan mas de cinco minutos trabados en `running`. La recuperacion se ejecuta al iniciar el worker y luego una vez por minuto.

### Despacho y finalizacion

Una vez reclamado, el worker lee `job.type` y llama al handler correspondiente. El switch de despacho esta en [`knowledge-base-worker.ts`](../../apps/worker/src/knowledge-base-worker.ts#L446).

El ciclo normal de estados es:

```text
queued -> running -> done
             |
             +-> queued con runAfter -> running -> ...
             |
             +-> failed
```

Cuando una integracion devuelve un error transitorio, el job vuelve a `queued` con backoff exponencial: comienza en cinco segundos y tiene un maximo de una hora. Al alcanzar `maxAttempts`, el job queda en `failed`; los flujos de sincronizacion de contexto, Agent y documentos tambien marcan como fallido su recurso de negocio correspondiente.

Esperar que ElevenLabs termine una indexacion RAG no se considera un intento fallido. El job se difiere durante diez segundos y `attempts` se decrementa para no agotar el limite mientras el provider sigue procesando.

### Semantica de entrega

La cola esta disenada con una semantica de ejecucion al menos una vez, no exactamente una vez. `dedupeKey`, los estados persistidos y los IDs externos reducen duplicados, pero un proceso puede morir despues de completar una llamada externa y antes de persistir el resultado local. Por eso los handlers deben poder reanudarse, comprobar el estado vigente e ignorar recursos que ya no existen.

Esta propiedad tambien explica por que borrar en un provider trata `404` como un resultado aceptable: si el recurso ya fue eliminado en un intento anterior, el objetivo del cleanup ya esta cumplido.

## Ventajas

- **La API responde rapido.** No mantiene abierta la request durante uploads al provider, indexacion RAG o cleanup externo.
- **Los trabajos son durables.** Una fila en PostgreSQL sobrevive reinicios de la API y del worker.
- **Los fallos externos quedan aislados.** Una caida de ElevenLabs o LiveAvatar no obliga a perder la accion local del usuario.
- **Hay reintentos automaticos.** Los errores transitorios usan backoff y no requieren que el usuario repita toda la operacion.
- **Estado y enqueue pueden ser atomicos.** Cuando se crean en la misma transaccion, no queda un cambio local sin su trabajo correspondiente.
- **Permite concurrencia segura.** `SKIP LOCKED`, locks por avatar y heartbeats permiten escalar runners sin procesar normalmente la misma tarea en paralelo.
- **Sirve para tareas programadas.** `runAfter` permite limpiar uploads abandonados o postergar trabajo sin un scheduler adicional.
- **Mejora la trazabilidad.** Los estados, intentos, timestamps y errores permiten investigar que ocurrio.

## Desventajas y riesgos

- **Consistencia eventual.** La API puede responder correctamente mientras el documento o el avatar todavia aparece como `Procesando`.
- **Mas complejidad de estados.** Hay que coordinar el estado del job, del documento, del provider sync y del recurso externo.
- **Requiere operacion y monitoreo.** Si el worker esta detenido o mal configurado, la API sigue creando filas pero el trabajo queda acumulado.
- **No ofrece ejecucion exactamente una vez.** Los handlers y las APIs externas deben tolerar reintentos y ejecuciones parciales.
- **Agrega latencia de cola.** El polling, `runAfter` y una cola con backlog retrasan el resultado final.
- **Usa PostgreSQL como broker.** Para el volumen del MVP simplifica infraestructura, pero una carga mucho mayor podria competir con las consultas de producto y exigir particionado, purga o una cola dedicada.
- **La tabla crece.** Los jobs `done` y `failed` necesitan una politica futura de retencion, archivado o limpieza.
- **El payload requiere cuidado.** Debe contener solo lo necesario, evitar secretos en texto plano y conservar cifrados los tokens que sean imprescindibles para un cleanup posterior.

## Que ve el usuario

El usuario no necesita conocer `Job`, ElevenLabs Knowledge Base, locks o reintentos. La UI traduce el estado asincronico a conceptos de producto:

- `Procesando`: hay trabajo pendiente o en ejecucion.
- `Listo`: existe una version utilizable.
- `No se pudo actualizar`: se agotaron los intentos o ocurrio un error permanente.

Cuando existe una version anterior utilizable, YUNI intenta conservarla mientras procesa la nueva. Esto permite que una llamada siga funcionando aunque una resincronizacion reciente falle.

## Limites actuales y mejoras futuras

- Agregar metricas y alertas para antiguedad de la cola, cantidad de retries, jobs trabados y fallos terminales.
- Definir una politica de retencion para jobs terminados.
- Incorporar una herramienta operativa para inspeccionar y reintentar jobs sin editar la base manualmente.
- Evaluar una cola dedicada solamente si el volumen, el aislamiento o la prioridad de tareas superan lo que PostgreSQL puede resolver de forma simple.
- Mantener los handlers idempotentes y agregar claves de idempotencia del provider cuando sus APIs las soporten.

Para el alcance actual, una cola en PostgreSQL evita sumar otra pieza de infraestructura y ofrece durabilidad, transacciones y concurrencia suficientes. El costo principal es aceptar consistencia eventual y mantener correctamente los estados y reintentos.
