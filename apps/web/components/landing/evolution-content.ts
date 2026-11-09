/**
 * The architecture history shown on the landing. It follows section 5.1 of the thesis report
 * ("Evolución de la arquitectura") and its Figures 6 to 12: the same seven stages, in the same
 * order, with the same components and connections. Dates come from the executed schedule
 * (Figure 4) and describe adoption in YUNI, not provider launch dates.
 */

export type EvolutionZone = "browser" | "yuni" | "providers";

/** Connection kinds of Figures 6 to 12: live media, requests and background synchronisation. */
export type EvolutionLinkKind = "media" | "request" | "sync";

export type EvolutionNode = {
  id: string;
  title: string;
  detail: string;
  zone: EvolutionZone;
  /** Vertical slot inside the zone: 0 (top) to 2 (bottom); halves sit between two slots. */
  row: number;
  isNew?: boolean;
};

export type EvolutionEdge = {
  from: string;
  to: string;
  kind: EvolutionLinkKind;
  label: string;
  bidirectional?: boolean;
  /**
   * How the line leaves its first node. "vertical" goes up or down before turning, so it can pass
   * above or below a node in the middle zone; "outside" bends around the right side of a column.
   */
  route?: "vertical" | "outside";
};

export type EvolutionStage = {
  id: string;
  /** Stage name as written in section 5.1 of the report. */
  name: string;
  shortTitle: string;
  date: string;
  question: string;
  decision: string;
  learning: string;
  shift: string;
  diagramLabel: string;
  diagramCaption: string;
  /** Components that stop being used in this stage. */
  retired?: string[];
  nodes: EvolutionNode[];
  edges: EvolutionEdge[];
};

export const evolutionZones: { id: EvolutionZone; label: string; shortLabel: string }[] = [
  { id: "browser", label: "Navegador", shortLabel: "Navegador" },
  { id: "yuni", label: "Servidores de YUNI", shortLabel: "YUNI" },
  { id: "providers", label: "Proveedores externos", shortLabel: "Proveedores" },
];

export const evolutionLinkKinds: { id: EvolutionLinkKind; label: string }[] = [
  { id: "media", label: "Audio y video" },
  { id: "request", label: "Pedidos y datos" },
  { id: "sync", label: "Sincronización en segundo plano" },
];

export const evolutionCriterion =
  "YUNI delega en proveedores especializados lo que ocurre en tiempo real y conserva lo que define al producto: la configuración, los documentos originales, los permisos y el historial.";

export const evolutionStages: EvolutionStage[] = [
  {
    id: "primer-circuito-de-voz",
    name: "Primer circuito de voz",
    shortTitle: "Primer circuito",
    date: "Enero 2026",
    question: "¿Cómo pasar de un agente de texto a una conversación por voz?",
    decision:
      "Encadenamos cuatro pasos: grabar la voz, transcribirla con Whisper, generar la respuesta con un modelo de texto y convertirla en audio con OpenAI TTS.",
    learning:
      "Ya se podía hablar con un agente configurado en YUNI, pero cada paso sumaba una espera y un punto de falla.",
    shift: "Del chat a un primer circuito de voz",
    diagramLabel: "Cuatro pasos en cadena",
    diagramCaption: "Las rutas /api coordinan cada paso: voz a texto, respuesta y texto a voz.",
    nodes: [
      {
        id: "app",
        title: "Aplicación web",
        detail: "Graba la pregunta y reproduce la respuesta",
        zone: "browser",
        row: 1,
      },
      {
        id: "routes",
        title: "Rutas /api",
        detail: "Coordinan cada paso y guardan en archivos JSON",
        zone: "yuni",
        row: 1,
      },
      { id: "whisper", title: "Whisper", detail: "Voz a texto", zone: "providers", row: 0 },
      { id: "gpt", title: "GPT-4o mini", detail: "Genera la respuesta", zone: "providers", row: 1 },
      { id: "tts", title: "OpenAI TTS", detail: "Texto a voz", zone: "providers", row: 2 },
    ],
    edges: [
      { from: "app", to: "routes", kind: "request", label: "HTTP", bidirectional: true },
      { from: "routes", to: "whisper", kind: "request", label: "paso 1, voz a texto" },
      { from: "routes", to: "gpt", kind: "request", label: "paso 2, respuesta" },
      { from: "routes", to: "tts", kind: "request", label: "paso 3, texto a voz" },
    ],
  },
  {
    id: "conversacion-en-tiempo-real",
    name: "Conversación en tiempo real",
    shortTitle: "Tiempo real",
    date: "Enero 2026",
    question: "¿Cómo quitar la espera entre un paso y el siguiente?",
    decision:
      "Incorporamos OpenAI Realtime, un servicio que escucha, detecta los turnos y genera la respuesta. Un servidor WebSocket propio retransmitía el audio entre el navegador y ese servicio y guardaba la conversación.",
    learning: "La conversación ganó continuidad, pero todo el audio seguía pasando por un servidor propio.",
    shift: "De pasos separados a un servicio en tiempo real",
    diagramLabel: "La conversación se integra",
    diagramCaption:
      "El servidor WebSocket retransmite el audio; la síntesis de voz es de OpenAI o ElevenLabs.",
    nodes: [
      {
        id: "app",
        title: "Aplicación web",
        detail: "Micrófono y audio en forma continua",
        zone: "browser",
        row: 1,
      },
      {
        id: "websocket",
        title: "Servidor WebSocket",
        detail: "Retransmite el audio y guarda la conversación",
        zone: "yuni",
        row: 1,
        isNew: true,
      },
      {
        id: "realtime",
        title: "OpenAI Realtime",
        detail: "Escucha, turnos y respuesta en texto",
        zone: "providers",
        row: 0.5,
        isNew: true,
      },
      { id: "speech", title: "Síntesis de voz", detail: "OpenAI o ElevenLabs", zone: "providers", row: 1.5 },
    ],
    edges: [
      { from: "app", to: "websocket", kind: "media", label: "WebSocket", bidirectional: true },
      { from: "websocket", to: "realtime", kind: "media", label: "audio", bidirectional: true },
      { from: "websocket", to: "speech", kind: "request", label: "texto a voz", bidirectional: true },
    ],
  },
  {
    id: "primer-conocimiento-propio",
    name: "Primer conocimiento propio",
    shortTitle: "Conocimiento propio",
    date: "Enero 2026",
    question: "¿Cómo hacer que el agente responda con los materiales del creador?",
    decision:
      "Construimos una búsqueda propia, un RAG: el servidor dividía cada documento en fragmentos, los guardaba en PostgreSQL y sumaba al modelo los que compartían palabras con la pregunta.",
    learning: "Funcionó en el chat de texto, pero no llegó a la llamada por voz.",
    shift: "De instrucciones sueltas a materiales propios",
    diagramLabel: "Una búsqueda propia",
    diagramCaption: "Los originales van al almacenamiento de objetos y los fragmentos, a PostgreSQL.",
    nodes: [
      {
        id: "app",
        title: "Aplicación web",
        detail: "Sube documentos y conversa por texto",
        zone: "browser",
        row: 1,
      },
      {
        id: "search",
        title: "Búsqueda propia",
        detail: "Extrae, divide y busca el texto",
        zone: "yuni",
        row: 1,
        isNew: true,
      },
      {
        id: "postgres",
        title: "PostgreSQL",
        detail: "Fragmentos de 1.200 caracteres",
        zone: "yuni",
        row: 2,
        isNew: true,
      },
      {
        id: "storage",
        title: "Almacenamiento de objetos",
        detail: "Documentos originales",
        zone: "providers",
        row: 0,
        isNew: true,
      },
      {
        id: "gpt",
        title: "GPT-4o mini",
        detail: "Responde con los fragmentos hallados",
        zone: "providers",
        row: 1,
      },
    ],
    edges: [
      { from: "app", to: "search", kind: "request", label: "HTTP", bidirectional: true },
      { from: "app", to: "storage", kind: "request", label: "URL prefirmada", route: "vertical" },
      { from: "search", to: "postgres", kind: "request", label: "fragmentos", bidirectional: true },
      { from: "search", to: "gpt", kind: "request", label: "contexto" },
    ],
  },
  {
    id: "primer-rostro",
    name: "Primer rostro",
    shortTitle: "Primer rostro",
    date: "Enero 2026",
    question: "¿Cómo darle un rostro al agente?",
    decision:
      "Sumamos un avatar 3D dibujado en el navegador con Three.js, con modelos de Ready Player Me y labios sincronizados con el audio.",
    learning:
      "El cierre de Ready Player Me dejó sin soporte esa integración y mostró el riesgo de depender de un único proveedor para el rostro.",
    shift: "De solo audio a una voz con rostro",
    diagramLabel: "Aparece el rostro",
    diagramCaption: "El navegador dibuja el avatar y mueve sus labios con el audio que reproduce.",
    nodes: [
      {
        id: "app",
        title: "Aplicación web",
        detail: "Micrófono y audio continuos",
        zone: "browser",
        row: 0.5,
      },
      {
        id: "avatar3d",
        title: "Avatar 3D",
        detail: "Modelos de Ready Player Me y labios sincronizados",
        zone: "browser",
        row: 1.5,
        isNew: true,
      },
      {
        id: "websocket",
        title: "Servidor WebSocket",
        detail: "Retransmite el audio",
        zone: "yuni",
        row: 0.5,
      },
      {
        id: "realtime",
        title: "OpenAI Realtime",
        detail: "Escucha, turnos y texto",
        zone: "providers",
        row: 0.5,
      },
      { id: "speech", title: "Síntesis de voz", detail: "OpenAI o ElevenLabs", zone: "providers", row: 1.5 },
    ],
    edges: [
      { from: "app", to: "avatar3d", kind: "media", label: "audio" },
      { from: "app", to: "websocket", kind: "media", label: "WebSocket", bidirectional: true },
      { from: "websocket", to: "realtime", kind: "media", label: "audio", bidirectional: true },
      { from: "websocket", to: "speech", kind: "request", label: "texto a voz", bidirectional: true },
    ],
  },
  {
    id: "avatar-en-vivo",
    name: "Avatar en vivo",
    shortTitle: "Avatar en vivo",
    date: "Mayo 2026",
    question: "¿Cómo mostrar un rostro en tiempo real?",
    decision: "Incorporamos LiveAvatar como rostro en tiempo real, al principio junto a la alternativa 3D.",
    learning:
      "Desde entonces la conversación y el rostro son piezas separadas, y cambiar una ya no obliga a rehacer la otra.",
    shift: "De dibujar el rostro a recibirlo en vivo",
    diagramLabel: "Conversación y rostro, por separado",
    diagramCaption:
      "El servidor pide la sesión del avatar; el navegador le envía el audio y recibe el video.",
    nodes: [
      {
        id: "app",
        title: "Aplicación web",
        detail: "Micrófono y audio continuos",
        zone: "browser",
        row: 0.5,
      },
      {
        id: "sdk",
        title: "SDK de LiveAvatar",
        detail: "Envía el audio al avatar y muestra el video",
        zone: "browser",
        row: 1.5,
        isNew: true,
      },
      {
        id: "websocket",
        title: "Servidor WebSocket",
        detail: "Retransmite el audio y pide la sesión del avatar",
        zone: "yuni",
        row: 0.5,
      },
      {
        id: "realtime",
        title: "OpenAI Realtime",
        detail: "Ahora también responde en audio",
        zone: "providers",
        row: 0.5,
      },
      {
        id: "liveavatar",
        title: "LiveAvatar",
        detail: "Video del avatar en tiempo real",
        zone: "providers",
        row: 1.5,
        isNew: true,
      },
    ],
    edges: [
      { from: "app", to: "sdk", kind: "media", label: "audio" },
      { from: "app", to: "websocket", kind: "media", label: "WebSocket", bidirectional: true },
      { from: "websocket", to: "realtime", kind: "media", label: "audio", bidirectional: true },
      { from: "websocket", to: "liveavatar", kind: "request", label: "token" },
      { from: "sdk", to: "liveavatar", kind: "media", label: "audio y video", bidirectional: true },
    ],
  },
  {
    id: "conversacion-delegada",
    name: "Conversación delegada y conocimiento en el proveedor",
    shortTitle: "Conversación delegada",
    date: "Junio–agosto 2026",
    question: "¿Qué conviene construir y qué delegar?",
    decision:
      "Adoptamos ElevenLabs Agents, unido a LiveAvatar por un conector del propio LiveAvatar. La voz, los turnos y las interrupciones pasaron a un servicio especializado, y un proceso en segundo plano copia los materiales a su base de conocimiento.",
    learning:
      "El audio dejó de pasar por los servidores de YUNI. Retiramos el servidor WebSocket y la búsqueda propia; un RAG propio más completo quedó como etapa posterior.",
    shift: "De integrar cada pieza a delegar lo que ocurre en tiempo real",
    diagramLabel: "YUNI configura, el proveedor conversa",
    diagramCaption:
      "La API autoriza la llamada y guarda el historial; el worker sincroniza el agente y sus materiales.",
    retired: ["Servidor WebSocket", "Búsqueda propia (RAG)"],
    nodes: [
      { id: "sdk", title: "SDK de LiveAvatar", detail: "Micrófono, video y audio", zone: "browser", row: 0 },
      { id: "app", title: "Aplicación", detail: "Configura agentes y materiales", zone: "browser", row: 1 },
      {
        id: "api",
        title: "API",
        detail: "Autoriza la llamada y guarda el historial",
        zone: "yuni",
        row: 1,
        isNew: true,
      },
      {
        id: "worker",
        title: "Worker",
        detail: "Sincroniza agentes y materiales",
        zone: "yuni",
        row: 2,
        isNew: true,
      },
      {
        id: "liveavatar",
        title: "LiveAvatar",
        detail: "Sesión con conector a ElevenLabs",
        zone: "providers",
        row: 0,
      },
      {
        id: "elevenlabs",
        title: "ElevenLabs Agent",
        detail: "Voz, turnos, interrupciones y base de conocimiento",
        zone: "providers",
        row: 1.5,
        isNew: true,
      },
    ],
    edges: [
      { from: "sdk", to: "liveavatar", kind: "media", label: "audio y video", bidirectional: true },
      { from: "app", to: "api", kind: "request", label: "HTTPS" },
      { from: "api", to: "liveavatar", kind: "request", label: "token" },
      { from: "worker", to: "elevenlabs", kind: "sync", label: "agente y base de conocimiento" },
      { from: "liveavatar", to: "elevenlabs", kind: "media", label: "conector", bidirectional: true },
    ],
  },
  {
    id: "conversacion-grupal",
    name: "Conversación grupal",
    shortTitle: "Conversación grupal",
    date: "Agosto–septiembre 2026",
    question: "¿Cómo reunir dos o tres avatares en una misma llamada?",
    decision:
      "Mantuvimos una sesión por avatar y agregamos una coordinación propia: un director, un control de turnos y una compuerta de audio. Por último, sumamos la posibilidad de que la persona interrumpa.",
    learning:
      "Descartamos que YUNI redactara las respuestas de todos: duplicaba la generación y alejaba la respuesta del agente configurado.",
    shift: "De una llamada individual a una conversación coordinada",
    diagramLabel: "Varias identidades, una conversación",
    diagramCaption: "El director planifica cada ronda; cada agente responde con su voz y su avatar.",
    nodes: [
      {
        id: "scribe",
        title: "Cliente de Scribe",
        detail: "Pasa la voz humana a texto",
        zone: "browser",
        row: 0,
        isNew: true,
      },
      {
        id: "app",
        title: "Aplicación",
        detail: "Envía el turno y aplica la compuerta de audio",
        zone: "browser",
        row: 1,
      },
      {
        id: "sdk",
        title: "SDK de LiveAvatar",
        detail: "Una sesión por avatar (A, B y C)",
        zone: "browser",
        row: 2,
        isNew: true,
      },
      {
        id: "api",
        title: "API",
        detail: "Director (LangGraph) y control de turnos",
        zone: "yuni",
        row: 1,
        isNew: true,
      },
      {
        id: "elevenlabs",
        title: "ElevenLabs",
        detail: "Scribe y un agente por avatar",
        zone: "providers",
        row: 0,
      },
      { id: "openai", title: "OpenAI", detail: "Plan de cada ronda", zone: "providers", row: 1, isNew: true },
      {
        id: "liveavatar",
        title: "LiveAvatar",
        detail: "Una sesión por avatar (A, B y C)",
        zone: "providers",
        row: 2,
      },
    ],
    edges: [
      { from: "scribe", to: "elevenlabs", kind: "media", label: "WebSocket de Scribe", bidirectional: true },
      { from: "scribe", to: "app", kind: "media", label: "texto" },
      { from: "app", to: "api", kind: "request", label: "turno", bidirectional: true },
      { from: "app", to: "sdk", kind: "request", label: "instrucción" },
      { from: "api", to: "openai", kind: "request", label: "plan" },
      { from: "sdk", to: "liveavatar", kind: "media", label: "contexto, audio y video", bidirectional: true },
      {
        from: "liveavatar",
        to: "elevenlabs",
        kind: "media",
        label: "conector",
        bidirectional: true,
        route: "outside",
      },
    ],
  },
];
