# Configuración del agente de María

Versión 1.0 · 29 de octubre de 2026 · Equipo YUNI

Este documento fija los valores que María, representada por el autor 1, carga en YUNI para el escenario principal. Los campos siguen el formulario de creación (pasos Identidad, Personalidad, Contexto, Voz y Visual) y el modelo `AvatarAgent` de `packages/db/prisma/schema.prisma` en el commit 3d8cfd2. María es un personaje construido; los materiales son sintéticos.

## 1. Agente principal: «Tutor IA de Historia» (condición A)

| Campo de YUNI | Campo del modelo | Valor |
| --- | --- | --- |
| Nombre | `name` | Tutor IA de Historia |
| Descripción | `description` | Asistente de inteligencia artificial configurado por la profesora María para acompañar la Unidad 3 (Revolución Industrial) de Historia Contemporánea. No reemplaza a la docente. |
| Instrucciones de comportamiento | `instructions` | Texto completo de `instrucciones-agente-v1-0.txt`, pegado sin cambios |
| Contexto textual | `context` | Vacío. Se deja vacío para que la base de conocimiento quede limitada a los documentos versionados |
| Documentos | `Document` | `ficha-catedra-revolucion-industrial.md` y `actividad-t47-condicion-a.md` |
| Voz | `voiceConfig` | Voz del catálogo «My Voices» de la cuenta del autor 1. Se registra el `voiceId` y el nombre visible al ejecutar. No debe imitar a una persona real |
| Visual | `liveAvatarConfig` | Avatar del catálogo de LiveAvatar en modo LITE, sin sandbox. Se registra el `avatarId` al ejecutar |
| Perfil y modelo de conversación | `voiceConfig.conversationProfile`, `voiceConfig.conversationModel` | Valores predeterminados para agentes nuevos: perfil `natural` y modelo `gpt-5.4`. No se modifican |
| Estado | `status` | `active` |

Aviso de IA. Con el perfil natural, el primer mensaje que genera la plataforma es «Hola, soy {nombre}.». Por eso el nombre incluye «IA». La descripción, visible en el perfil, y las instrucciones repiten que se trata de un asistente artificial.

Parámetros que fija la plataforma y no edita María (código del commit 3d8cfd2, `packages/voice/src/index.ts`): idioma `es`, temperatura 0,4, máximo de 512 tokens por respuesta en perfil natural, reconocimiento de voz `scribe_realtime` sin palabras clave y RAG con `multilingual_e5_large_instruct` cuando hay documentos. El prompt final agrega reglas comunes, entre ellas «Si el contexto no alcanza, dilo con claridad y no inventes datos». Estos valores se verifican en la configuración remota durante la ejecución real; no se presumen aplicados.

## 2. Agentes de contraste para M-02 (condiciones B y C)

| Agente | Diferencia con el principal | Documentos |
| --- | --- | --- |
| Tutor IA de Historia B | Solo cambia el nombre | `ficha-catedra-revolucion-industrial.md` |
| Tutor IA de Historia C | Solo cambia el nombre | `ficha-catedra-revolucion-industrial.md` y `actividad-t47-condicion-c.md` |

Se utilizan agentes separados para no reemplazar documentos sobre un mismo agente entre repeticiones. Así se evita depender de que la base remota haya terminado de actualizarse. Descripción, instrucciones, voz, visual, perfil y modelo son idénticos a los del agente principal.

## 3. Acceso

| Campo | Valor |
| --- | --- |
| Tipo | Acceso individual por correo (`AccessGrant`), uno por agente |
| Participante | Identidad sintética «Tomás (sintético)», `alumno.maria.01@example.com`, cuenta creada por el autor 2 |
| Duración por llamada | Sin límite |
| Sesiones por 24 horas | Sin límite |
| Enlaces públicos | No se crean |

Se omiten límites para que una cuota no interrumpa las repeticiones. Los límites de uso se verifican por otras pruebas.

## 4. Comprobación de fidelidad

Antes de la primera llamada, el autor 1 copia el texto guardado en el campo de instrucciones y lo compara con el archivo. El esquema recorta espacios finales, por lo que se compara contra el texto sin salto de línea final (SHA-256 `eff90bfab74a717c599f89ae9d53cb253cb1c8b0339e43c26ec8768365e62e17`). Los documentos se comparan por nombre y tamaño en la pestaña Contexto.
