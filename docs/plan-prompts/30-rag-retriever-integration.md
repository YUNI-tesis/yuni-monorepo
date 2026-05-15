# Prompt: RAG Retriever Integration

Armame un plan específico para recuperación RAG básica.

Objetivo:
Usar chunks de documentos como contexto adicional para respuestas AI.

Debe incluir:

- retriever en `packages/ai` o package dedicado
- búsqueda básica por keyword o embeddings según decisión
- integración con prompt builder
- límites de tokens/chunks
- tests

Reglas:

- no vector DB avanzada en MVP salvo que ya esté decidido
- no exponer chunks al público
- público puede beneficiarse de RAG sin ver documentos

Checklist:

- recupera chunks relevantes
- prompt incluye contexto recuperado
- respeta límite de tokens
