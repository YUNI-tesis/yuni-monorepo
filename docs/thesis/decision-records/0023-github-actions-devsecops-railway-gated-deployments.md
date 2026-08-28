# GitHub Actions DevSecOps And Railway Gated Deployments

## Status

accepted

## Related plan

`38-ci-cd-devsecops.md`

## Date

2026-08-25

## Context

Railway ya desplegaba Web, API y Worker automáticamente desde `main`, pero el repositorio no tenía
workflows ni protecciones versionadas que validaran calidad, migraciones, tests o seguridad antes de
producción. Los tests locales pasaban, aunque 25 casos de integración se omitían cuando
`TEST_DATABASE_URL` no estaba disponible.

YUNI es un repositorio público, un monorepo pnpm y un proyecto de dos integrantes. Se priorizó una
solución gratuita, de baja operación y compatible con el deploy existente.

## Options considered

- Migrar todo el deployment a GitHub Actions con un token de Railway: ofrece control centralizado,
  pero duplica capacidades nativas y agrega un secreto con permisos de despliegue.
- Incorporar un tercero como CircleCI, Snyk o Sonar: amplía vendors, configuración y costo para un
  baseline que GitHub cubre en un repositorio público.
- Conservar Railway como CD y usar GitHub Actions/GitHub Security como gate: separa validación de
  ejecución sin introducir credenciales productivas en CI.

## Decision

GitHub Actions ejecuta calidad, build, migraciones y tests con PostgreSQL efímero. CodeQL analiza
JavaScript/TypeScript; Dependency Review bloquea dependencias nuevas high/critical; Dependabot
mantiene npm/pnpm y Actions; secret scanning y push protection previenen filtraciones.

El flujo normal es `feature → staging → main`. `main` permanece como default y única rama productiva.
Por una limitación de Dependabot, sus security updates pueden abrir PR directo a `main`; después se
sincroniza `main` nuevamente hacia `staging`.

Railway conserva el autodeploy y habilita Wait for CI. Web y API usan `/health` como deployment
healthcheck; Worker reinicia on-failure. No se introducen secretos productivos en GitHub Actions.

## Rationale

El diseño aprovecha integraciones ya presentes, reduce permisos y hace fallar el release de manera
cerrada. Un gate final estable evita acoplar los rulesets a cada job interno. PostgreSQL efímero valida
que las migraciones puedan construir la base desde cero y activa las pruebas que antes se omitían.

## Implementation notes

- `.node-version` fija Node `20.20.2` en desarrollo, CI y Railpack/Railway; pnpm usa `10.8.1`.
- Actions se fijan a SHA completa y se actualizan mediante Dependabot.
- PRs hacia `main` sólo aceptan origen `staging` o autor `dependabot[bot]`.
- Hallazgos medium/low se registran; high/critical bloquean.
- Las migraciones productivas deben seguir expand/contract porque un rollback de imagen no revierte
  cambios de base.

## User/product impact

No cambian APIs ni experiencia de usuario. Los cambios que no compilan, no pasan tests o introducen
riesgos altos quedan bloqueados antes de producción, y Railway mantiene la versión anterior si el
nuevo Web/API no alcanza estado saludable.

## Cost/UX/security tradeoffs

No crear staging reduce costo, pero impide validar un deployment real antes de producción. No exigir
revisión humana reduce espera en el equipo de dos personas, a costa de depender completamente de los
checks. Mantener Node 20 conserva compatibilidad inmediata pero acepta un runtime EOL sin nuevos
parches de seguridad.

## Sources

- [Railway GitHub autodeploys and Wait for CI](https://docs.railway.com/deployments/github-autodeploys).
- [Railway healthchecks](https://docs.railway.com/deployments/healthchecks).
- [GitHub secure use reference](https://docs.github.com/en/actions/reference/security/secure-use).
- [GitHub dependency review](https://docs.github.com/en/code-security/concepts/supply-chain-security/dependency-review).
- [GitHub code scanning merge protection](https://docs.github.com/en/code-security/concepts/code-scanning/merge-protection).
- [Dependabot non-default target behavior](https://docs.github.com/en/code-security/tutorials/secure-your-dependencies/customizing-dependabot-prs).
- [Node.js end-of-life releases](https://nodejs.org/en/about/eol).

## Evidence

- Baseline local previo: formato, lint, typecheck y tests en verde; 25 integraciones condicionadas por
  PostgreSQL omitidas y un test marcado explícitamente como skip.
- La evidencia del primer PR, CodeQL, rulesets y deployment Railway debe adjuntarse cuando la branch
  se publique y se activen las configuraciones administrativas.
