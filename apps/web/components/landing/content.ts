export const presenceStages = [
  {
    number: "01",
    title: "Identidad",
    eyebrow: "Primero, alguien",
    description:
      "Cada avatar nace con una personalidad, un propósito y una forma propia de habitar la conversación.",
  },
  {
    number: "02",
    title: "Contexto",
    eyebrow: "Después, memoria",
    description:
      "El conocimiento deja de estar disperso y se convierte en una base desde la que responder con intención.",
  },
  {
    number: "03",
    title: "Voz",
    eyebrow: "Entonces, presencia",
    description:
      "La respuesta se vuelve tiempo real: voz, gestos y una experiencia que se siente cercana, no mecánica.",
  },
  {
    number: "04",
    title: "Vínculo",
    eyebrow: "Finalmente, relación",
    description:
      "YUNI permite compartir esa presencia y comprender qué sucede en cada encuentro con otras personas.",
  },
] as const;

export const productMoments = [
  {
    number: "01",
    action: "Creá",
    title: "Diseñá una identidad, no un formulario.",
    description:
      "Definí nombre, propósito, personalidad, voz y apariencia dentro de un flujo que transforma decisiones en una presencia coherente.",
    scene: "builder",
  },
  {
    number: "02",
    action: "Compartí",
    title: "Una experiencia preparada para encontrarse.",
    description:
      "Publicá un acceso o invitá personas concretas sin perder el control sobre quién entra y cómo participa.",
    scene: "share",
  },
  {
    number: "03",
    action: "Conversá",
    title: "La inteligencia sucede en tiempo real.",
    description:
      "La voz, el avatar y el contexto trabajan juntos para que la interacción se perciba continua, expresiva y humana.",
    scene: "voice",
  },
  {
    number: "04",
    action: "Comprendé",
    title: "Cada conversación deja una señal.",
    description:
      "Actividad, recurrencia y transcripciones convierten los encuentros en evidencia para observar, aprender y mejorar.",
    scene: "insights",
  },
] as const;

export const architectureLayers = [
  {
    number: "01",
    title: "Aplicación web",
    description:
      "Creadores y participantes configuran avatares, comparten accesos y conversan desde una misma interfaz.",
    tags: ["Next.js", "React", "TypeScript"],
  },
  {
    number: "02",
    title: "Núcleo YUNI",
    description: "La API autentica, valida permisos y coordina avatares, sesiones y servicios externos.",
    tags: ["Hono", "Zod", "Prisma"],
  },
  {
    number: "03",
    title: "Datos y procesos",
    description: "El estado queda persistido y los documentos se procesan en segundo plano, con reintentos.",
    tags: ["PostgreSQL", "S3 / MinIO", "Worker"],
  },
  {
    number: "04",
    title: "Conversación en vivo",
    description:
      "ElevenLabs y LiveAvatar producen voz y presencia; OpenAI + LangGraph dirigen los turnos grupales.",
    tags: ["ElevenLabs Agents", "LiveAvatar", "OpenAI + LangGraph"],
  },
] as const;

export type CapabilityIconName =
  | "identity"
  | "voice"
  | "avatar"
  | "context"
  | "sharing"
  | "activity"
  | "group"
  | "privacy";

export const capabilities = [
  {
    number: "01",
    icon: "identity",
    title: "Identidad configurable",
    description: "Propósito, personalidad, voz y apariencia para cada avatar.",
  },
  {
    number: "02",
    icon: "voice",
    title: "Voz en tiempo real",
    description: "Conversaciones por voz con respuesta e interrupciones naturales.",
  },
  {
    number: "03",
    icon: "avatar",
    title: "Avatar en vivo",
    description: "Rostro, gesto y voz sincronizados durante cada interacción.",
  },
  {
    number: "04",
    icon: "context",
    title: "Contexto documental",
    description: "Texto y documentos procesados como conocimiento propio.",
  },
  {
    number: "05",
    icon: "sharing",
    title: "Compartir con control",
    description: "Links e invitaciones que se pueden activar, revocar y administrar.",
  },
  {
    number: "06",
    icon: "activity",
    title: "Actividad y transcripciones",
    description: "Participantes, conversaciones y mensajes listos para revisar.",
  },
  {
    number: "07",
    icon: "group",
    title: "Conversaciones grupales",
    description: "Dos o tres avatares coordinan sus turnos en una misma llamada.",
  },
  {
    number: "08",
    icon: "privacy",
    title: "Privacidad y límites",
    description: "Consentimiento, permisos y límites de sesión para cuidar cada acceso.",
  },
] as const satisfies ReadonlyArray<{
  number: string;
  icon: CapabilityIconName;
  title: string;
  description: string;
}>;
