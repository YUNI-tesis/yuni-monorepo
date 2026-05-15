# Prompt: Configuración Y Env

Armame un plan específico para el módulo de configuración/env de YUNI.

Objetivo:
Centralizar y validar todas las variables de entorno.

Debe incluir:

- package `packages/config`
- validación con Zod
- separación server/client env
- `.env.example`
- envs para dev/test/prod
- OpenAI
- Live Avatar
- S3
- PostgreSQL
- Auth secrets
- rate limits
- costos/pricing

Reglas:

- ninguna app lee `process.env` directo salvo `packages/config`
- no exponer secrets al frontend
- fallar temprano si falta una env crítica
- defaults seguros para dev
- en producción usar envs del entorno de deploy, no archivos `.env`
- en local usar loader/runner centralizado desde `packages/config`

Incluir:

- estructura de archivos
- contratos
- ejemplos de uso
- checklist de aceptación
