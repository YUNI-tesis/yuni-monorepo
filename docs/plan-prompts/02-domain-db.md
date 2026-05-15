# Prompt: Dominio Y Base De Datos

Armame un plan detallado para el modelo de dominio y base de datos de YUNI.

Objetivo:
Diseñar entidades limpias para crear, compartir e interactuar con avatares AI.

Stack:

- PostgreSQL
- Prisma
- `packages/db`
- `packages/domain`

Entidades:

- User
- AvatarAgent
- ShareLink
- Conversation
- Message
- PublicSession
- RealtimeSession
- Document
- DocumentChunk
- UsageEvent
- Job

El plan debe incluir:

- schema Prisma
- relaciones
- ownership
- índices
- enums
- repositories
- migrations iniciales
- seeds mínimos
- reglas de dominio
- qué lógica va en db y qué lógica va en domain
- checklist de aceptación

Reglas importantes:

- cliente nunca manda `userId`
- mensajes append-only
- links públicos por slug único
- recursos privados validan owner
- recursos públicos validan `ShareLink` activo
- `LiveAvatarConfig` fuerza `mode: "lite"` y `sandbox: true`
- storage de documentos apunta a S3, no Azure
