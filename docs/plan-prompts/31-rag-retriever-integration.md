# Prompt: RAG Retriever Integration

Armame un plan especifico para recuperacion RAG basica.

Objetivo:
Usar chunks de documentos como contexto adicional para respuestas AI bajo control de permisos de YUNI.

Debe incluir:

- retriever en `packages/ai` o package dedicado
- busqueda basica por keyword o embeddings segun decision
- integracion con prompt builder
- limites de tokens/chunks
- permisos por identidad:
  - owner
  - usuario compartido con grant activo
  - participante publico con session/link activo
- tests

Reglas:

- no vector DB avanzada en MVP salvo que ya este decidido
- no exponer chunks al publico
- publico y compartido pueden beneficiarse de RAG sin ver documentos
- no recuperar documentos de otro avatar
- no recuperar contexto si el acceso fue revocado
- ElevenLabs Knowledge Base sigue siendo proyeccion provider-first del MVP, no reemplazo de este RAG propio futuro

Checklist:

- recupera chunks relevantes
- prompt incluye contexto recuperado
- respeta limite de tokens
- respeta permisos por avatar e identidad efectiva
