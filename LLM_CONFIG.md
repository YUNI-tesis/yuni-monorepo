# Configuración de Modelos LLM

El sistema ahora es agnóstico al modelo y permite elegir entre diferentes proveedores mediante variables de entorno.

## Variables de Entorno

### Proveedor y Modelo

- `LLM_PROVIDER`: El proveedor a usar. Valores soportados:
  - `openai` (por defecto)
  - `gemini`
  
- `LLM_MODEL`: El nombre del modelo específico a usar. Si no se especifica, se usa un modelo por defecto según el proveedor:
  - OpenAI: `gpt-4o-mini`
  - Gemini: `gemini-1.5-pro`

- `LLM_TEMPERATURE`: Temperatura para la generación (por defecto: `0.7`)

### API Keys

Según el proveedor seleccionado, necesitas configurar la API key correspondiente:

- **OpenAI**: `OPENAI_API_KEY`
- **Gemini**: `GOOGLE_API_KEY`

## Ejemplos de Configuración

### Usar OpenAI con GPT-4o-mini (por defecto)
```bash
export OPENAI_API_KEY="sk-..."
# No es necesario configurar LLM_PROVIDER ni LLM_MODEL
```

### Usar OpenAI con GPT-4o
```bash
export OPENAI_API_KEY="sk-..."
export LLM_MODEL="gpt-4o"
```

### Usar Google Gemini con Gemini 1.5 Pro
```bash
export LLM_PROVIDER="gemini"
export GOOGLE_API_KEY="..."
# LLM_MODEL se establece automáticamente a gemini-1.5-pro
```

### Usar Google Gemini con Gemini 1.5 Flash
```bash
export LLM_PROVIDER="gemini"
export GOOGLE_API_KEY="..."
export LLM_MODEL="gemini-1.5-flash"
```

## Instalación de Dependencias

Después de configurar las variables de entorno, instala las dependencias necesarias:

```bash
# Instalar todas las dependencias
pnpm install

# O si prefieres instalar manualmente según el proveedor:
# Para Gemini:
cd apps/web && pnpm add @google/generative-ai
cd apps/agent && pnpm add @langchain/google-genai
```

## Modelos Soportados

### OpenAI
- `gpt-4o`
- `gpt-4o-mini`
- `gpt-4-turbo`
- `gpt-3.5-turbo`

### Google Gemini
- `gemini-1.5-pro`
- `gemini-1.5-flash`
- `gemini-pro`
- `gemini-1.0-pro`

## Notas

- El sistema calcula automáticamente los costos según el modelo utilizado
- Los precios están configurados en `costTracker.ts` y `cost-utils.ts`
- Si cambias de proveedor, asegúrate de tener la API key correspondiente configurada

