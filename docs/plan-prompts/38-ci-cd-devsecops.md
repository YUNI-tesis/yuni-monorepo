# Prompt: CI/CD DevSecOps Base

## Objetivo

Automatizar las compuertas de calidad y seguridad del monorepo antes de cada despliegue productivo,
con GitHub Actions y el autodeploy existente de Railway.

## Alcance Implementado

- CI paralelo para formato, lint, tipos, build, migraciones y tests unitarios/de integración.
- PostgreSQL 16 efímero en CI.
- CodeQL, Dependency Review, Dependabot, secret scanning y push protection.
- Flujo `feature → staging → main`, con excepción de seguridad para Dependabot.
- Railway `Wait for CI`, healthchecks de Web/API y política de rollback/expand-contract.
- Rulesets sin aprobaciones humanas, bloqueando checks o hallazgos high/critical.

## Fuera De Alcance

- Ambiente Railway de staging y previews por PR.
- DAST, cobertura obligatoria, SBOM/provenance y servicios pagos.
- Migración desde Node 20, conservada como riesgo explícito.

## Criterios De Aceptación

- `CI / gate`, Dependency Review y CodeQL pasan en `staging` y `main`.
- Los tests condicionados por `TEST_DATABASE_URL` se ejecutan contra PostgreSQL en CI.
- Un PR de feature directo a `main` falla; `staging → main` y Dependabot son aceptados.
- Railway no despliega un push fallido y sólo activa Web/API cuando el healthcheck devuelve `200`.

Runbook: [CI/CD DevSecOps](../operations/ci-cd-devsecops.md).

Decision record: [0023](../thesis/decision-records/0023-github-actions-devsecops-railway-gated-deployments.md).
