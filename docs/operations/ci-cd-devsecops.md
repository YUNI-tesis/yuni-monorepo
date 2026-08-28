# CI/CD DevSecOps Runbook

## Flujo De Entrega

1. Crear una branch por feature y abrir un PR hacia `staging`.
2. Esperar `CI / gate`, `Dependency Review` y CodeQL. No se requiere una aprobación humana, pero
   ningún check puede omitirse.
3. Integrar el cambio en `staging`.
4. Abrir un PR de `staging` hacia `main`. El workflow rechaza cualquier otra branch de origen salvo
   un PR creado por `dependabot[bot]`.
5. Al fusionarse en `main`, Railway espera que todos los workflows del push terminen correctamente.
   Si alguno falla, el deploy queda `SKIPPED`; si todos pasan, Web, API y Worker se despliegan.
6. Railway sólo activa Web y API cuando `GET /health` responde `200` para el deployment nuevo.

`main` continúa siendo la rama por defecto y la única conectada a producción. Las actualizaciones de
versión de Dependabot apuntan a `staging`. GitHub dirige sus actualizaciones de seguridad a la rama por
defecto, por lo que esos PRs son la única excepción permitida directamente hacia `main`. Después de
fusionar una excepción, abrir y fusionar inmediatamente un PR de back-sync `main` → `staging`.

## Checks Obligatorios

### CI / gate

- `release policy`: valida el origen de un PR hacia `main`.
- `quality`: instalación reproducible, Prisma Client, formato, lint y tipos.
- `test`: PostgreSQL 16 efímero, migraciones y tests unitarios/de integración.
- `build`: build completo del monorepo sin credenciales productivas.

Las ejecuciones de PR y `staging` obsoletas se cancelan. Las de `main` nunca se cancelan para que
Railway reciba un resultado terminal confiable.

### Security

- Dependency Review bloquea dependencias nuevas con severidad `high` o `critical`.
- CodeQL analiza JavaScript/TypeScript en PRs, pushes y semanalmente. El ruleset bloquea resultados
  nuevos de seguridad `high` o superiores.
- Dependabot revisa npm/pnpm y GitHub Actions cada lunes; minor y patch se agrupan, major queda
  separado.
- Secret scanning y push protection deben permanecer habilitados. Todo bypass requiere triage.
- Todas las Actions se referencian por SHA completa y el `GITHUB_TOKEN` usa permisos mínimos.

## Configuración Administrativa De GitHub

En **Settings → Actions → General**:

- Dejar el permiso por defecto del workflow token en `Read repository contents and packages`.
- Exigir Actions fijadas a SHA completa.
- Permitir únicamente Actions de GitHub y `pnpm/action-setup`.

En **Settings → Security and analysis**:

- Habilitar Dependency graph, Dependabot alerts y Dependabot security updates.
- Habilitar Secret scanning, Push protection y Private vulnerability reporting.

Crear rulesets activos equivalentes para `staging` y `main`:

- Exigir un PR con cero aprobaciones mínimas y branch actualizada.
- Exigir `CI / gate` y `Dependency Review / dependency-review`.
- Exigir CodeQL con `security alerts: high or higher`.
- Bloquear borrado y force-push; no configurar bypass habitual para administradores.

Activar los rulesets únicamente después de que CI y el primer análisis CodeQL estén verdes en ambas
ramas.

## Configuración Administrativa De Railway

En los servicios `web`, `api` y `worker`:

- Mantener `main` como source branch y habilitar **Wait for CI**.
- Mantener el autodeploy habilitado; un workflow fallido debe producir un deployment `SKIPPED`.

Además:

- `web`: healthcheck `/health`, timeout 300 segundos, restart `ON_FAILURE`.
- `api`: healthcheck `/health`, timeout 300 segundos, restart `ON_FAILURE`.
- `worker`: sin healthcheck HTTP; restart `ON_FAILURE` con el límite permitido por el plan.

## Migraciones Y Rollback

La API conserva `pnpm db:migrate:deploy` antes de iniciar. CI aplica las mismas migraciones sobre una
base PostgreSQL vacía. Toda evolución debe usar expand/contract:

1. Agregar estructuras nuevas sin romper la versión actualmente activa.
2. Desplegar código que tolere ambas estructuras y completar cualquier backfill.
3. Retirar estructuras antiguas en un release posterior.

Ante un incidente de aplicación, usar **Rollback** sobre el último deployment sano en Railway y abrir
un PR de corrección o revert. El rollback restaura la imagen, no revierte una migración ya aplicada;
una migración incompatible requiere roll-forward o una restauración de base coordinada.

## Respuesta A Fallos

- CI fallido: corregir en la branch; nunca deshabilitar el check para fusionar.
- CodeQL o dependencia high/critical: bloquear el release, confirmar exposición y corregir o mitigar.
- Secret scanning: revocar primero, eliminar el secreto del código y revisar el historial afectado.
- Deploy fallido: confirmar que el deployment anterior sigue activo, revisar build/runtime logs y
  decidir rollback o fix-forward.
- Worker `CRASHED`: revisar logs y reintentos antes de reiniciar; confirmar que los jobs persistidos no
  se duplicaron.

## Excepción De Runtime

`.node-version` fija Node.js `20.20.2` para desarrollo, CI y Railpack/Railway; pnpm permanece en
`10.8.1`. Node 20 está fuera de soporte desde el 24 de marzo de 2026; mantenerlo es una excepción
aceptada por el equipo que las demás compuertas no pueden mitigar. La migración a una línea LTS
soportada debe tratarse como hardening prioritario.
