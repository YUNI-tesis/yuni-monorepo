# Implementation Plans - Yuni AI

Documentación de planes de implementación y logs de progreso para mejoras del sistema.

## 📚 Índice de Documentos

### RAG Improvements

1. **[RAG_IMPROVEMENT_PLAN.md](./RAG_IMPROVEMENT_PLAN.md)** - Plan completo de mejora RAG
   - Análisis del estado actual
   - Estrategia de 3 fases (Fase 1, 2, 3)
   - Detalles técnicos de implementación
   - Casos de prueba y métricas esperadas
   - **Estado**: Plan completo ✅
   - **Fecha**: 2025-01-30

2. **[PHASE_1_IMPLEMENTATION_LOG.md](./PHASE_1_IMPLEMENTATION_LOG.md)** - Log de implementación de Fase 1
   - Cambios implementados en detalle
   - Checklist de implementación (completado)
   - Plan de testing (pendiente)
   - Métricas a monitorear
   - Próximos pasos
   - **Estado**: Implementación completa, testing pendiente ⏳
   - **Fecha**: 2025-01-30

3. **[RAG_LIVECALL_IMPLEMENTATION.md](./RAG_LIVECALL_IMPLEMENTATION.md)** - RAG en LiveCall/Voice Mode
   - Análisis del problema (RAG funciona en Chat pero NO en LiveCall)
   - Solución: Retrieval dinámico por turno
   - Análisis de latencia (+85-425ms overhead)
   - Plan de implementación en 3 fases (MVP, Básica, Avanzada)
   - Código específico para cada fase
   - Testing y troubleshooting
   - **Estado**: Listo para implementar 🚀
   - **Fecha**: 2025-01-30

### Infrastructure & Architecture

4. **[PRISMA_UNIFICATION_PLAN.md](./PRISMA_UNIFICATION_PLAN.md)** - Unificación de Schemas de Prisma
   - Consolidación de schemas duplicados en paquete compartido
   - Plan paso a paso con validaciones
   - Migración de `apps/web/prisma` y `apps/agent/prisma` a `packages/database`
   - Tests de validación y plan de rollback
   - **Estado**: Plan completo, pendiente implementación 📋
   - **Fecha**: 2025-01-30

### UI/UX

5. **[LIGHT_THEME_IMPLEMENTATION_PLAN.md](./LIGHT_THEME_IMPLEMENTATION_PLAN.md)** - Light Theme
   - Análisis de páginas y tema actual (dark)
   - Viabilidad de light theme manteniendo el mismo estilo (gradientes, acentos)
   - Ubicación UX del switch de tema (Navbar, TopBar, auth)
   - Plan de ejecución en 4 fases (fundamentos CSS, migración componentes, switch, ajustes)
   - **Estado**: ✅ Implementado (2025-01-30)
   - **Fecha**: 2025-01-30

---

## 🎯 Quick Start

### Para Entender las Mejoras RAG

1. **Leer primero**: `RAG_IMPROVEMENT_PLAN.md` - Contexto completo y estrategia
2. **Ver implementación**: `PHASE_1_IMPLEMENTATION_LOG.md` - Qué se cambió exactamente
3. **Ejecutar tests**: Seguir sección "Plan de Testing" en el log de Fase 1

### Para Continuar con Fase 2 (Embeddings)

**Primero**: Esperar 1 semana y evaluar métricas de Fase 1

**Criterios para proceder**:
- ✅ Precisión < 85% después de 1 semana
- ✅ Queries con sinónimos fallan consistentemente
- ✅ Usuarios reportan problemas de recall

**Si NO cumple criterios**: PARAR en Fase 1 (mejor ROI)

---

## 📊 Resumen de Cambios - Fase 1

### Archivos Modificados

| Archivo | Cambios | Impacto |
|---------|---------|---------|
| `apps/web/src/lib/summarization.ts` | Interface expandida + Prompt mejorado | Summaries capturan valores exactos |
| `apps/web/app/api/documents/[documentId]/ingest/route.ts` | Summaries selectivos | -40% costo en generation |
| `apps/web/src/lib/agent-utils.ts` | SECRET_PATTERNS vaciado | Desbloquea queries legítimas |
| `apps/web/src/lib/retrieval.ts` | Usa LLM classifier | +20% precisión en clasificación |

### Archivos Nuevos

| Archivo | Propósito |
|---------|-----------|
| `apps/web/src/lib/query-classifier.ts` | Clasificación LLM con fallback a keywords |

---

## 🧪 Testing

### Test Crítico 1: Password in Document

```bash
# 1. Crear test-credentials.txt con:
# "La contraseña temporal es: TeSt123!@#"

# 2. Subir via UI

# 3. Query: "¿Cuál es la contraseña?"
# Expected: "La contraseña temporal es TeSt123!@#"
```

### Test Crítico 2: Small Document Cost Saving

```bash
# 1. Crear small-doc.txt (<2000 chars)

# 2. Verificar en DB:
SELECT summary, summary_status FROM documents WHERE filename = 'small-doc.txt';
# Expected: summary = null, summary_status = READY
```

### Test Crítico 3: Query Classification

```bash
# Verificar logs:
# [RAG] LLM classified "¿Cuál es la contraseña?" as: specific
# [RAG] LLM classified "¿De qué trata el documento?" as: general
```

Ver detalles completos en: `PHASE_1_IMPLEMENTATION_LOG.md` → "Plan de Testing"

---

## 📈 Métricas Esperadas

| Métrica | Antes | Después Fase 1 | Mejora |
|---------|-------|----------------|--------|
| Precisión | 65% | **85%** | +31% |
| Costo/doc | $0.006 | **$0.004** | -33% |
| Costo/query | $0.15 | **$0.12** | -20% |
| Queries bloqueadas | 100% | **0%** | ✅ |

---

## 🚀 Roadmap

```
✅ Fase 1: Mejoras Inmediatas (COMPLETADO)
   ├── ✅ Summaries mejorados
   ├── ✅ Summaries selectivos
   ├── ✅ LLM classifier
   └── ✅ Guardrails ajustados

⏸️ Fase 2: Embeddings (Pendiente evaluación)
   ├── ⏳ Setup pgvector
   ├── ⏳ Generar embeddings
   └── ⏳ Búsqueda semántica

❌ Fase 3: Optimizaciones Avanzadas (No recomendada)
   ├── Hybrid search
   ├── Re-ranking
   └── Query expansion
```

---

## 📝 Próximos Pasos

### Esta Semana
1. ⏳ Deploy a staging/production
2. ⏳ Ejecutar tests críticos 1, 2, 3
3. ⏳ Monitorear logs por 3 días

### Semana 2
1. ⏳ Analizar métricas
2. ⏳ Calcular precisión real
3. ⏳ **DECISIÓN**: ¿Proceder a Fase 2?

---

## 🏗️ Infraestructura

### Unificación de Schemas de Prisma

**Problema**: Actualmente hay 2 schemas de Prisma duplicados en `apps/web/prisma` y `apps/agent/prisma`, lo que causa:
- Duplicación de código y mantenimiento doble
- Riesgo de inconsistencias
- Necesidad de correr `prisma generate` en ambas apps

**Solución**: Consolidar en un paquete compartido `packages/database`

**Ver guía completa**: [PRISMA_UNIFICATION_PLAN.md](./PRISMA_UNIFICATION_PLAN.md)

**Tiempo estimado**: 2-3 horas  
**Beneficios**:
- ✅ Single source of truth
- ✅ Mantenimiento simplificado
- ✅ Arquitectura profesional de monorepo

---

## 🔗 Referencias

- **Código Fuente**: `/apps/web/src/lib/`
- **API Routes**: `/apps/web/app/api/documents/`
- **Prisma Schema**: `/apps/web/prisma/schema.prisma` (pronto en `/packages/database/prisma/`)
- **Main Plan**: [RAG_IMPROVEMENT_PLAN.md](./RAG_IMPROVEMENT_PLAN.md)
- **Implementation Log**: [PHASE_1_IMPLEMENTATION_LOG.md](./PHASE_1_IMPLEMENTATION_LOG.md)
- **Prisma Unification**: [PRISMA_UNIFICATION_PLAN.md](./PRISMA_UNIFICATION_PLAN.md)
- **Light Theme**: [LIGHT_THEME_IMPLEMENTATION_PLAN.md](./LIGHT_THEME_IMPLEMENTATION_PLAN.md)

---

**Última Actualización**: 2025-01-30  
**Mantenedor**: Equipo Yuni AI
