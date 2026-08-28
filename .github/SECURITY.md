# Security Policy

## Supported Version

YUNI mantiene únicamente la versión desplegada desde `main`. Las ramas de feature y `staging` no se
consideran versiones soportadas.

## Reporting A Vulnerability

No publiques vulnerabilidades, credenciales ni datos sensibles en un issue.

Usá **Security → Report a vulnerability** en GitHub para abrir un reporte privado. Incluí una
descripción, impacto, pasos mínimos de reproducción y cualquier mitigación conocida. El equipo
confirmará recepción de hallazgos críticos dentro de 24 horas y de hallazgos altos dentro de tres
días hábiles.

Si una credencial quedó expuesta, revocala o rotala inmediatamente antes de continuar con el análisis.

## Remediation Policy

- `critical`: contener y rotar secretos inmediatamente; publicar una corrección prioritaria.
- `high`: corregir dentro de tres días hábiles o documentar una mitigación temporal y responsable.
- `medium` y `low`: registrar para triage y priorizar según exposición e impacto.

Los detalles se coordinan en privado hasta que exista una corrección o mitigación suficiente.
