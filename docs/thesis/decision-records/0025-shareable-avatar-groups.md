# Grupos de avatares compartibles como recurso propio

## Estado

accepted

## Fecha

2026-08-31

## Contexto

YUNI ya permite compartir avatares individuales mediante accesos por email y links públicos, y
también permite componer llamadas privadas con dos o tres avatares. Tratar un grupo compartido
como varios permisos individuales produciría escalamiento de privilegios, cuotas multiplicadas,
consentimientos ambiguos y métricas duplicadas. Además, una llamada grupal consume varias
sesiones del proveedor aunque para el usuario sea una sola interacción.

## Decisión

El grupo se comparte como un recurso independiente mediante `GroupAccessGrant` y
`GroupShareLink`:

- solo es compartible cuando todos sus miembros pertenecen al dueño del grupo;
- el permiso permite usar la composición pero no concede acceso individual, edición ni
  re-sharing de sus miembros;
- los accesos por cuenta y los links públicos reutilizan límites y estados del sharing individual,
  pero consumen una cuota por llamada grupal completa;
- una llamada externa solo comienza cuando el roster completo está activo, tiene una proyección
  grupal utilizable y pudo preparar todas sus sesiones;
- los tokens, sesiones y endpoints públicos grupales son distintos de sus equivalentes
  individuales;
- cambios del roster versionan el consentimiento y aplican únicamente a próximas llamadas;
- cada conversación conserva un snapshot ordenado del grupo y se contabiliza una sola vez como
  recurso `group` en Activity y Dashboard.

Los grants se vinculan por email al iniciar sesión o registrarse. Los links públicos exigen email y
consentimiento, sin verificar el email ni enviar notificaciones. Las llamadas externas admiten hasta
sesenta minutos; las llamadas privadas del dueño conservan su máximo actual de diez minutos.

## API

- `GET /avatar-groups?scope=all|owned|shared`
- `GET /avatar-groups/:groupId`
- `GET|POST /avatar-groups/:groupId/access-grants`
- `PATCH|DELETE /avatar-groups/:groupId/access-grants/:grantId`
- `GET|POST /avatar-groups/:groupId/share-links`
- `PATCH|DELETE /avatar-groups/:groupId/share-links/:linkId`
- `GET /public/group-links/:slug`
- `POST /public/group-links/:slug/identify`
- `POST /public/group-links/:slug/sessions`
- `POST /public/group-voice-sessions/:sessionId/*`

## Consecuencias

La persistencia y la autorización grupales permanecen separadas de las individuales. Esto agrega
modelos y rutas, pero evita que un receptor pueda extraer o reutilizar los avatares del roster. El
inicio externo se implementa como una reserva y preparación all-or-nothing; después de la
activación completa puede degradarse según las reglas de orquestación existentes.

El borrado del recurso deja de destruir su evidencia: deshabilita canales, finaliza llamadas activas
y conserva snapshots y conversaciones para auditoría. Los agregados usan procedencia explícita y
no el avatar primario técnico.

Esta decisión reemplaza únicamente la exclusión de links públicos grupales declarada como alcance
del MVP en ADR 0016 y resuelve la pregunta abierta de ADR 0009 sobre grupos como capa sobre los
access grants. No modifica las decisiones de floor y orquestación de ADR 0018 y ADR 0019.

## Rollout y reversión

El despliegue se hará en orden base de datos → API/worker → Web, con migraciones aditivas y tres
flags independientes: sharing por cuenta, links públicos y Activity/Dashboard. Durante la
transición `GroupVoiceSession.ownerId` se conserva como campo legado y se backfillea
`initiatorUserId`; su retiro requiere completar el rollout y verificar los registros históricos.

Una reversión deshabilita nuevos inicios, pero mantiene montados los comandos de sesiones ya
emitidas para que puedan finalizar y ejecutar su cleanup durable. La única excepción es el borrado
explícito del grupo, que finaliza todas sus llamadas activas.

## Fuera de alcance

- compartir grupos que contengan avatares recibidos;
- permisos o cuotas por miembro;
- coautoría y re-sharing;
- invitaciones por email o verificación del email público;
- historial visible para visitantes públicos.
