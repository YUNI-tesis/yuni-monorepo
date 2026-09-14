# Piloto de conversación individual

Esta herramienta permite inspeccionar un avatar, probar el perfil `natural` y volver al perfil `standard`. Usa el entorno de la raíz del workspace, cargado antes de importar la configuración. Requiere la migración que agrega `providerVoiceState`, el cliente Prisma actualizado y las credenciales habituales del worker.

La inspección predeterminada lee la base de datos y consulta la configuración de voz del agente en ElevenLabs mediante GET. No modifica agentes ni sesiones:

```sh
pnpm exec tsx tools/direct-call-qa/pilot.ts --avatar-id ID
pnpm exec tsx tools/direct-call-qa/pilot.ts --avatar-id ID --profile natural
```

`--profile` sin `--apply` muestra el perfil propuesto junto al actual. El estado remoto es una observación actual; el estado guardado puede pertenecer a una verificación anterior. El campo `profile` de esa observación representa el perfil local, no una lectura independiente del prompt remoto.

Para aplicar el perfil a un único avatar:

```sh
pnpm exec tsx tools/direct-call-qa/pilot.ts --avatar-id ID --apply --profile natural
```

Si el agente quedó anteriormente en Flash por falta de acceso a v3 y se quiere reintentar v3 explícitamente:

```sh
pnpm exec tsx tools/direct-call-qa/pilot.ts --avatar-id ID --apply --profile natural --retry-expressive
```

La herramienta toma el mismo lock por avatar que el worker, vuelve a leer su configuración y rechaza la operación si hay sesiones `connecting` o `active`, incluidas las de grupos. Coordiná la prueba para que nadie inicie llamadas a ese avatar durante la aplicación: el lock del worker no bloquea nuevos inicios de sesión.

Actualiza el `voiceConfig` completo validado, conservando la voz, velocidad y demás campos existentes. Después llama directamente a `worker.syncAgent`, que reconstruye las referencias existentes de contexto y documentos. No ejecuta `runOnce`, no consume la cola ni sincroniza otros avatares o agentes de grupo.

El campo `localKnowledgeBase` incluye cantidad de documentos sincronizados, presencia de contexto y una huella SHA-256 de sus referencias en la base de datos local. Después de aplicar, `localKnowledgeBaseReferencesUnchanged` confirma únicamente que esas referencias locales siguen iguales. No verifica que ElevenLabs haya conservado las referencias remotas: esa comprobación requiere comparar por separado la configuración remota antes y después. No imprime nombres ni contenido de documentos.

El resultado `applied` exige estado sincronizado y una verificación remota de voz reciente persistida. `applied_with_fallback` indica que el modelo efectivo difiere del solicitado. Consultá siempre `expressiveMode`: `null` significa que el proveedor no lo confirmó; el reporte no equivale a una prueba acústica ni garantiza que el conector visual transmita todas las capacidades expresivas.

El modelo solicitado se resuelve por perfil con el mismo helper que el proveedor. En `natural`, la configuración histórica `eleven_v3` se traduce a `eleven_v3_conversational`, el identificador de Agents. La inspección usa el perfil actual; la aplicación y su verificación usan el perfil de destino. `standard` conserva el identificador configurado, también al volver desde `natural`.

Si falla la sincronización o su verificación, intenta marcar el avatar como `failed`. Informa `remoteState: unknown` y si pudo guardar el fallo. No restaura automáticamente la configuración local ni afirma que el proveedor volvió al estado anterior. Reintentá después de resolver la causa o usá la vuelta explícita a `standard`:

```sh
pnpm exec tsx tools/direct-call-qa/pilot.ts --avatar-id ID --apply --profile standard
```

Esta vuelta usa la misma sincronización, conserva la configuración local de voz y exige que las referencias locales de conocimiento sigan iguales. Verifica la voz remota, pero la conservación remota de conocimiento requiere la comparación independiente descrita arriba. Restaura el comportamiento del perfil estándar de Yuni; no reconstruye una copia exacta de cambios manuales anteriores en ElevenLabs. Conserva el modelo TTS configurado en el entorno.

Se puede agregar `--output /ruta/reporte.json` para crear un reporte JSON, con permisos de lectura/escritura para su dueño, sin sobrescribir archivos. Los reportes solo contienen identificadores operativos, perfiles, conteos y estado de voz; omiten nombres, texto de conversaciones, prompts, documentos, claves y errores crudos. Los estados `failed` y `blocked` devuelven código de salida 1.

Pruebas locales, con dependencias simuladas y sin tráfico al proveedor:

```sh
pnpm exec vitest run tools/direct-call-qa/pilot-core.test.ts
pnpm exec tsc --project tools/direct-call-qa/tsconfig.json
```
