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
    title: "Experiencia",
    description: "Creación, interacción y lectura de actividad en una interfaz continua.",
    tags: ["Next.js", "React", "Motion"],
  },
  {
    number: "02",
    title: "Dominio",
    description: "Identidades, permisos, conversaciones y reglas que mantienen coherencia.",
    tags: ["API", "TypeScript", "Contratos"],
  },
  {
    number: "03",
    title: "Presencia",
    description: "Inteligencia, voz y avatar sincronizados durante cada encuentro.",
    tags: ["OpenAI", "ElevenLabs", "LiveAvatar"],
  },
  {
    number: "04",
    title: "Memoria",
    description: "Datos, contexto y procesamiento para aprender de cada interacción.",
    tags: ["PostgreSQL", "Workers", "Observabilidad"],
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
