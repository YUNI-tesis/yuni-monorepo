# Prompt: Live Avatar Adapter

Armame un plan específico para el adapter backend de Live Avatar.

Objetivo:
Encapsular Live Avatar como único provider visual, forzando LITE mode y sandbox activo.

Debe incluir:

- package `packages/avatars`
- interface `AvatarProvider`
- adapter `LiveAvatarProvider`
- mocks para tests
- env validation desde `packages/config`
- API privada `GET /live-avatar/avatars`

Reglas:

- `LIVEAVATAR_MODE=lite`
- `LIVEAVATAR_SANDBOX=true`
- adapter fuerza `mode: "lite"`
- adapter fuerza `sandbox: true`
- frontend no puede elegir otro modo
- sin avatar local
- sin fallback 3D
- sin assets 3D

Checklist:

- lista avatares visuales desde provider/mock
- errores de provider devuelven error controlado
- tests verifican que mode/sandbox no puedan cambiarse
