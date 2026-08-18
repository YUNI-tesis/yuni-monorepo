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

export const capabilities = [
  {
    number: "01",
    title: "Multiagente",
    description: "Múltiples identidades con propósitos y configuraciones independientes.",
  },
  {
    number: "02",
    title: "Voz natural",
    description: "Conversaciones expresivas que suceden en tiempo real.",
  },
  {
    number: "03",
    title: "Avatares vivos",
    description: "Apariencia, gesto y voz reunidos en una misma presencia.",
  },
  {
    number: "04",
    title: "Contexto propio",
    description: "Conocimiento y documentos que vuelven relevante cada respuesta.",
  },
  {
    number: "05",
    title: "Sharing seguro",
    description: "Links e invitaciones con identidad y permisos explícitos.",
  },
  {
    number: "06",
    title: "Actividad",
    description: "Señales para entender uso, recurrencia y conversaciones.",
  },
  {
    number: "07",
    title: "Guardrails",
    description: "Límites y controles que protegen el alcance de cada avatar.",
  },
  {
    number: "08",
    title: "Costos visibles",
    description: "Uso y consumo convertidos en información para decidir mejor.",
  },
] as const;
