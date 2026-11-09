/**
 * Seed de demo para las capturas del capítulo 9 de la tesis ("Interfaz de usuario").
 *
 * Escenario: María Gómez, docente de Historia Contemporánea, arma un tutor para la Unidad 3
 * (Revolución Industrial). Sus estudiantes a veces confunden causas y consecuencias.
 *
 * Es independiente de `seed.ts` (no lo modifica ni lo invoca) y es idempotente: todos sus IDs usan
 * el prefijo `tesis-demo-`, y cada ejecución recrea conversaciones, sesiones y documentos con fechas
 * relativas al momento en que se corre. Los demás datos locales no se tocan.
 *
 * Con `--reset` además borra la actividad creada desde la UI sobre los avatares/grupo de esta demo
 * (por ejemplo, la conversación vacía y la sesión errored que deja "Iniciar llamada" sin proveedores).
 *
 * Seguridad: se niega a correr si DATABASE_URL no apunta a localhost/127.0.0.1/::1.
 * No llama a ningún proveedor externo (ElevenLabs, LiveAvatar, OpenAI): los IDs de proveedor son
 * ficticios y los archivos de contexto no se suben a ningún storage (la UI no los descarga).
 *
 * Cómo correrlo (desde la raíz del repo; NO usar `pnpm db:seed`, que fuerza el DATABASE_URL de .env):
 *
 *   cd packages/db && \
 *   DATABASE_URL='postgresql://yuni:yuni@localhost:5434/yuni_dev?schema=public' \
 *   pnpm exec tsx prisma/seed-tesis-demo.ts [--reset]
 *
 * (En esta máquina el Postgres de YUNI quedó publicado en el puerto 5434 porque el 5432 lo ocupa el
 * contenedor `db` de otro proyecto. Para levantarlo así:
 *   docker compose -f docker-compose.yml -f <override> up -d postgres minio minio-init
 * donde <override> contiene:
 *   services:
 *     postgres:
 *       ports: !override
 *         - "5434:5432"
 * Si el 5432 está libre, `pnpm db:up` y el puerto 5432 funcionan igual.)
 *
 * ─── Credenciales locales de la demo (todas con la misma contraseña) ───────────────────────────
 *   Contraseña:            Yuni-Tesis-2026
 *   Docente (creadora):    maria.gomez@docentes.ejemplo.edu.ar      (María Gómez)
 *   Colega (comparte):     laura.mendez@docentes.ejemplo.edu.ar     (Laura Méndez)
 *   Estudiantes:           ana.torres@alumnos.ejemplo.edu.ar        (Ana Torres)
 *                          mateo.ruiz@alumnos.ejemplo.edu.ar        (Mateo Ruiz)
 *                          lucia.romero@alumnos.ejemplo.edu.ar      (Lucía Romero)
 *                          tomas.diaz@alumnos.ejemplo.edu.ar        (Tomás Díaz, sin conversaciones)
 *   Por link público:      sofia.benitez@alumnos.ejemplo.edu.ar     (Sofía Benítez)
 * ───────────────────────────────────────────────────────────────────────────────────────────────
 */
import { createHash } from "node:crypto";
import { Prisma, PrismaClient } from "@prisma/client";

const PREFIX = "tesis-demo";
const RESET = process.argv.includes("--reset");

// bcrypt (cost 10) de la contraseña indicada arriba.
const PASSWORD_HASH = "$2b$10$HSL0l3N/kpy71r02/AIY.Ou6Dboac/ZDe0dj4/biTcwgiWUPC0AcS";

const MINUTE_MS = 60 * 1_000;
const HOUR_MS = 60 * MINUTE_MS;
const DAY_MS = 24 * HOUR_MS;
// Fechas en hora de Buenos Aires (UTC-3, sin horario de verano).
const ART_OFFSET_MS = -3 * HOUR_MS;

// Imagen del único LiveAvatar disponible en sandbox ("June HR"), la misma que usan los avatares
// existentes del entorno local. Se guarda como snapshot para que la UI no consulte a LiveAvatar.
const LIVEAVATAR_ID = "65f9e3c9-d48b-4118-b73a-4ae2e3cbb8f0";
const LIVEAVATAR_THUMBNAIL =
  "https://files2.heygen.ai/avatar/v3/74447a27859a456c955e01f21ef18216_45620/preview_talk_1.webp";

const ids = {
  maria: `${PREFIX}-user-maria`,
  laura: `${PREFIX}-user-laura`,
  tutorRi: `${PREFIX}-avatar-revolucion-industrial`,
  tutorGf: `${PREFIX}-avatar-guerra-fria`,
  fuentes: `${PREFIX}-avatar-fuentes-historicas`,
  shareLink: `${PREFIX}-share-unidad-3`,
  grantFuentesMaria: `${PREFIX}-grant-fuentes-maria`,
  group: `${PREFIX}-group-historia`,
};

const MARIA_EMAIL = "maria.gomez@docentes.ejemplo.edu.ar";
const LAURA_EMAIL = "laura.mendez@docentes.ejemplo.edu.ar";

type StudentKey = "ana" | "mateo" | "lucia" | "tomas" | "sofia";
const students: Record<
  StudentKey,
  { id: string; email: string; name: string; grantDaysAgo: number | null; createdDaysAgo: number }
> = {
  ana: {
    id: `${PREFIX}-user-ana`,
    email: "ana.torres@alumnos.ejemplo.edu.ar",
    name: "Ana Torres",
    grantDaysAgo: 45,
    createdDaysAgo: 60,
  },
  mateo: {
    id: `${PREFIX}-user-mateo`,
    email: "mateo.ruiz@alumnos.ejemplo.edu.ar",
    name: "Mateo Ruiz",
    grantDaysAgo: 45,
    createdDaysAgo: 58,
  },
  lucia: {
    id: `${PREFIX}-user-lucia`,
    email: "lucia.romero@alumnos.ejemplo.edu.ar",
    name: "Lucía Romero",
    grantDaysAgo: 20,
    createdDaysAgo: 40,
  },
  tomas: {
    id: `${PREFIX}-user-tomas`,
    email: "tomas.diaz@alumnos.ejemplo.edu.ar",
    name: "Tomás Díaz",
    grantDaysAgo: 20,
    createdDaysAgo: 35,
  },
  // Llega por el link público: no tiene acceso por cuenta.
  sofia: {
    id: `${PREFIX}-user-sofia`,
    email: "sofia.benitez@alumnos.ejemplo.edu.ar",
    name: "Sofía Benítez",
    grantDaysAgo: null,
    createdDaysAgo: 12,
  },
};

function grantId(student: StudentKey) {
  return `${PREFIX}-grant-ri-${student}`;
}

const TUTOR_RI_INSTRUCTIONS = `Eres el tutor de la Unidad 3 de Historia Contemporánea, dedicada a la Revolución Industrial. Acompañas a estudiantes de primer año mientras preparan las actividades de la unidad.

Orienta sin resolver la actividad: ayuda a ordenar ideas, reformula la consigna y propone preguntas guía, pero no entregues respuestas listas para copiar.

Básate exclusivamente en los materiales de la unidad (el apunte de la Unidad 3 y la ficha de cátedra). Si algo no está en los materiales, dilo con claridad y sugiere consultarlo con la docente.

Cuando un estudiante confunda causas con consecuencias, pídele que ubique cada proceso en el tiempo y que explique qué lo produjo.

Usa un tono cercano y respetuoso, con explicaciones breves y ejemplos tomados de la bibliografía.`;

const TUTOR_RI_CONTEXT = `Materia: Historia Contemporánea (primer año). Docente: Prof. María Gómez.
Unidad 3 — La Revolución Industrial (Gran Bretaña, c. 1760-1850).
Causas trabajadas en clase: revolución agrícola y crecimiento demográfico, acumulación de capital comercial, disponibilidad de carbón y hierro, mecanización textil y máquina de vapor.
Consecuencias trabajadas en clase: sistema fabril, urbanización acelerada, condiciones de trabajo y trabajo infantil, surgimiento de la clase obrera y del movimiento obrero.
Actividad 2: elaborar un cuadro que distinga causas y consecuencias, justificando cada ubicación con una cita del apunte. Entrega: viernes de la semana 8.`;

const TUTOR_GF_INSTRUCTIONS = `Eres el tutor de la Unidad 5 de Historia Contemporánea, dedicada a la Guerra Fría (1947-1991).

Orienta sin resolver las actividades: propone preguntas guía y ayuda a relacionar procesos.

Básate exclusivamente en los materiales de la unidad. Si algo no está en los materiales, dilo con claridad y sugiere consultarlo con la docente.

Usa un tono cercano y respetuoso.`;

const TUTOR_GF_CONTEXT = `Unidad 5 — La Guerra Fría (1947-1991): orden bipolar, carrera armamentista, conflictos periféricos y caída del bloque soviético.
Actividad 4: línea de tiempo comentada con cinco acontecimientos clave.`;

const FUENTES_INSTRUCTIONS = `Eres un asistente para el análisis de fuentes históricas primarias. Guías al estudiante para identificar autor, destinatario, contexto de producción e intencionalidad de cada fuente, sin interpretarla por él.

Si una fuente no está entre los materiales compartidos por la cátedra, indícalo y pide que la docente la incorpore.`;

const FUENTES_CONTEXT = `Taller transversal de lectura de fuentes para las materias de Historia (Prof. Laura Méndez).
Guía de análisis: autor, destinatario, fecha y lugar, contexto, intencionalidad y contraste con otras fuentes.`;

type Line = readonly ["user" | "assistant", string];

type ConversationSeed = {
  key: string;
  student: StudentKey;
  origin: "grant" | "public";
  daysAgo: number;
  hour: number;
  minute: number;
  title: string;
  lines: readonly Line[];
};

const conversations: readonly ConversationSeed[] = [
  {
    key: "ana-01",
    student: "ana",
    origin: "grant",
    daysAgo: 44,
    hour: 14,
    minute: 10,
    title: "Primer acercamiento a la Unidad 3",
    lines: [
      ["user", "Hola, estoy empezando la Unidad 3. ¿Por dónde conviene arrancar?"],
      [
        "assistant",
        "Hola, Ana. Te propongo empezar por la introducción del apunte de la Unidad 3, donde se define la Revolución Industrial y se la ubica en Gran Bretaña entre 1760 y 1850, aproximadamente. ¿Ya la leíste?",
      ],
      ["user", "Sí, pero es mucho texto y no sé qué es lo importante."],
      [
        "assistant",
        "Una buena estrategia es leer con dos preguntas en mente: ¿qué cambió? y ¿por qué cambió? Marca con un color lo que explica por qué se produjo el proceso y con otro lo que describe sus efectos. Eso te va a servir para la Actividad 2.",
      ],
      ["user", "Bien, voy a probar así."],
      ["assistant", "Perfecto. Cuando termines, cuéntame qué marcaste con cada color y lo revisamos juntos."],
    ],
  },
  {
    key: "mateo-01",
    student: "mateo",
    origin: "grant",
    daysAgo: 40,
    hour: 17,
    minute: 20,
    title: "La revolución agrícola como antecedente",
    lines: [
      ["user", "¿La revolución agrícola es parte de la Revolución Industrial?"],
      [
        "assistant",
        "Según el apunte, la revolución agrícola es un proceso anterior que la favoreció. ¿Qué cambios en el campo menciona el texto?",
      ],
      ["user", "Los cercamientos y la rotación de cultivos."],
      [
        "assistant",
        "Exacto. ¿Y qué efecto tuvieron esos cambios sobre la población y sobre la mano de obra disponible?",
      ],
      ["user", "Hubo más alimentos y mucha gente se quedó sin trabajo en el campo."],
      [
        "assistant",
        "Muy bien. Ese crecimiento de la población y esa mano de obra disponible son justamente factores que el apunte vincula con el inicio de la industrialización.",
      ],
    ],
  },
  {
    key: "ana-02",
    student: "ana",
    origin: "grant",
    daysAgo: 24,
    hour: 19,
    minute: 30,
    title: "Causas y consecuencias de la Revolución Industrial",
    lines: [
      [
        "user",
        "Estoy armando el cuadro de la Actividad 2. Puse como causas la urbanización, las malas condiciones de trabajo y la máquina de vapor. ¿Está bien?",
      ],
      [
        "assistant",
        "Vas por buen camino al separar los procesos, pero revisemos uno por uno. Según el apunte, ¿la urbanización ocurrió antes o después de que se instalaran las primeras fábricas?",
      ],
      ["user", "Después, creo. La gente se iba a las ciudades a trabajar en las fábricas."],
      [
        "assistant",
        "Exacto. Entonces, si la urbanización fue una respuesta a la instalación de fábricas, ¿la ubicarías como algo que provocó la Revolución Industrial o como algo que la Revolución Industrial provocó?",
      ],
      ["user", "Ah, entonces es una consecuencia. Y las condiciones de trabajo también, ¿no?"],
      [
        "assistant",
        "Muy bien razonado. Fíjate que el apunte las trata en la sección sobre transformaciones sociales, junto con el surgimiento de la clase obrera. Ahora, ¿qué pasa con la máquina de vapor? ¿Qué problema permitió resolver?",
      ],
      ["user", "Permitió mover las máquinas sin depender de los ríos. Eso sería una causa."],
      [
        "assistant",
        "Esa es la idea. En el apunte, la máquina de vapor y la mecanización aparecen como condiciones que hicieron posible el sistema fabril, junto con la acumulación de capital. No voy a darte el cuadro resuelto, pero un criterio útil es preguntarte, para cada proceso: ¿esto lo produjo la industrialización o la hizo posible?",
      ],
      ["user", "Gracias, lo reviso con ese criterio."],
    ],
  },
  {
    key: "lucia-01",
    student: "lucia",
    origin: "grant",
    daysAgo: 19,
    hour: 15,
    minute: 0,
    title: "Condiciones de trabajo en las fábricas",
    lines: [
      [
        "user",
        "Tengo que explicar por qué las condiciones de trabajo eran tan malas. ¿Fue por las máquinas?",
      ],
      [
        "assistant",
        "Antes de responder, revisemos el orden: ¿las condiciones de trabajo aparecen en el apunte como algo que impulsó la industrialización o como algo que se produjo con ella?",
      ],
      ["user", "Se produjeron con ella. Entonces son una consecuencia."],
      [
        "assistant",
        "Correcto. Ahora, para explicarlas, ¿qué factores menciona el apunte? Piensa en las jornadas, los salarios y en quiénes trabajaban en las fábricas.",
      ],
      ["user", "Jornadas de catorce horas, salarios bajos y trabajo de mujeres y niños."],
      [
        "assistant",
        "Muy bien. Con esos elementos puedes armar tu explicación. Recuerda que la máquina por sí sola no explica esas condiciones: el apunte también menciona la ausencia de leyes laborales en ese período.",
      ],
    ],
  },
  {
    key: "mateo-02",
    student: "mateo",
    origin: "grant",
    daysAgo: 18,
    hour: 16,
    minute: 40,
    title: "La máquina de vapor: ¿causa o consecuencia?",
    lines: [
      [
        "user",
        "Mi compañero dice que la máquina de vapor es una consecuencia de la Revolución Industrial. Yo puse que es una causa. ¿Quién tiene razón?",
      ],
      [
        "assistant",
        "Es una discusión interesante, porque la máquina de vapor se fue perfeccionando durante todo el proceso. Para la actividad conviene seguir el criterio del apunte: ¿cómo la presenta el texto, como una condición o como un resultado?",
      ],
      ["user", "Como una de las innovaciones que hicieron posibles las fábricas."],
      ["assistant", "Entonces, para el cuadro, ¿dónde la ubicarías?"],
      ["user", "En causas."],
      [
        "assistant",
        "Bien. Si quieres sumar un matiz, puedes aclarar que la innovación técnica siguió avanzando a medida que crecía la industria. Eso muestra que comprendes el proceso y no solo la clasificación.",
      ],
    ],
  },
  {
    key: "ana-03",
    student: "ana",
    origin: "grant",
    daysAgo: 12,
    hour: 18,
    minute: 5,
    title: "Acumulación de capital y comercio",
    lines: [
      ["user", 'No entiendo bien qué significa "acumulación de capital" en el apunte.'],
      [
        "assistant",
        "Se refiere a las ganancias que comerciantes y terratenientes británicos venían reuniendo desde antes de 1760. ¿Recuerdas de qué actividades provenían, según el texto?",
      ],
      ["user", "Del comercio con las colonias y de la agricultura, creo."],
      [
        "assistant",
        "Así es. Ahora piensa: ¿por qué sería importante contar con ese capital para abrir una fábrica?",
      ],
      ["user", "Porque las máquinas y los edificios eran caros."],
      [
        "assistant",
        "Exacto. Por eso el apunte la presenta como una causa: hizo posible invertir en maquinaria. Para la actividad, intenta explicarlo con tus palabras y cita la página del apunte donde aparece.",
      ],
    ],
  },
  {
    key: "sofia-01",
    student: "sofia",
    origin: "public",
    daysAgo: 9,
    hour: 11,
    minute: 45,
    title: "Por qué la industrialización empezó en Gran Bretaña",
    lines: [
      [
        "user",
        "Hola, entré por el link que compartió la profesora. ¿Por qué la Revolución Industrial empezó en Gran Bretaña?",
      ],
      [
        "assistant",
        "Hola, Sofía. El apunte de la Unidad 3 menciona varios factores que se combinaron. ¿Puedes nombrar alguno que recuerdes?",
      ],
      ["user", "El carbón, creo."],
      [
        "assistant",
        "Sí, la disponibilidad de carbón y de hierro es uno. ¿Qué otros factores encuentras en la sección que explica por qué el proceso comenzó en Gran Bretaña?",
      ],
      ["user", "El capital que venía del comercio y que había mucha mano de obra."],
      [
        "assistant",
        "Exacto. Fíjate que todos esos factores son anteriores al proceso: por eso funcionan como causas. Te sugiero ordenarlos en una lista y explicar en una oración cómo contribuyó cada uno.",
      ],
    ],
  },
  {
    key: "mateo-03",
    student: "mateo",
    origin: "grant",
    daysAgo: 6,
    hour: 20,
    minute: 10,
    title: "Urbanización y ciudades industriales",
    lines: [
      ["user", "Si la urbanización fue una consecuencia, ¿cómo eran las ciudades industriales?"],
      [
        "assistant",
        "El apunte describe ciudades que crecieron muy rápido, como Manchester, con viviendas precarias, hacinamiento y problemas sanitarios. ¿Qué relación encuentras entre ese crecimiento y la instalación de fábricas?",
      ],
      ["user", "Que la gente se mudaba cerca de las fábricas y no había lugar para todos."],
      [
        "assistant",
        "Exacto. Para la actividad, te sugiero conectar esa consecuencia con su causa: no alcanza con describir la ciudad, también conviene explicar por qué creció de esa manera.",
      ],
    ],
  },
  {
    key: "ana-04",
    student: "ana",
    origin: "grant",
    daysAgo: 3,
    hour: 21,
    minute: 15,
    title: "Repaso antes de entregar la Actividad 2",
    lines: [
      ["user", "Ya terminé el cuadro. ¿Me lo puedes corregir?"],
      [
        "assistant",
        "No puedo corregirte el cuadro ni darte la versión final, pero sí puedo ayudarte a revisarlo. Léeme una causa y una consecuencia, y cómo justificaste cada una.",
      ],
      [
        "user",
        "Causa: la máquina de vapor, porque permitió usar energía en cualquier lugar. Consecuencia: la urbanización, porque la gente migró del campo a las ciudades industriales.",
      ],
      [
        "assistant",
        "Las dos justificaciones son coherentes con el apunte. Para fortalecerlas, podrías indicar en qué período ocurre cada proceso. ¿Revisaste también dónde ubicaste el trabajo infantil?",
      ],
      ["user", "Lo puse en consecuencias."],
      [
        "assistant",
        "Bien. Antes de entregar, verifica que cada fila tenga una referencia a los materiales de la unidad.",
      ],
    ],
  },
  {
    key: "sofia-02",
    student: "sofia",
    origin: "public",
    daysAgo: 2,
    hour: 10,
    minute: 20,
    title: "Cómo distinguir causas de consecuencias",
    lines: [
      ["user", "Me sigo confundiendo entre causas y consecuencias. ¿Hay algún truco?"],
      [
        "assistant",
        "Más que un truco, hay una pregunta que ayuda: ¿este proceso existía antes de las fábricas o apareció por ellas? Probemos con un ejemplo: ¿la mecanización textil?",
      ],
      ["user", "Empezó antes de que las fábricas fueran grandes."],
      ["assistant", "Bien visto. ¿Y el movimiento obrero?"],
      ["user", "Apareció por las fábricas. Es una consecuencia."],
      [
        "assistant",
        "Exacto. Con esa pregunta puedes revisar todo tu cuadro. Si dudas con algún caso, anota por qué y lo conversamos.",
      ],
    ],
  },
  {
    key: "mateo-04",
    student: "mateo",
    origin: "grant",
    daysAgo: 1,
    hour: 22,
    minute: 30,
    title: "Ferrocarriles en el Río de la Plata",
    lines: [
      [
        "user",
        "¿La Revolución Industrial llegó a la Argentina? ¿Cuándo se construyó el primer ferrocarril acá?",
      ],
      [
        "assistant",
        "Esa información no está en los materiales de la Unidad 3: el apunte y la ficha de cátedra se centran en Gran Bretaña entre 1760 y 1850. Te recomiendo consultarlo con la profesora Gómez o en la bibliografía complementaria.",
      ],
      ["user", "Ok. ¿Y algo de lo que sí está en el apunte me sirve para pensarlo?"],
      [
        "assistant",
        "Sí. El apunte explica cómo el ferrocarril amplió los mercados y abarató el transporte en Gran Bretaña. Podrías preguntarte qué necesitaría otra región para incorporar esa tecnología: capital, carbón y mano de obra. Es una buena pregunta para llevar a clase.",
      ],
      ["user", "Buenísimo, gracias."],
    ],
  },
];

// Pruebas de la propia docente antes de compartir el tutor (aparecen en su historial de llamadas,
// no en Actividad ni en el dashboard, que excluyen al creador).
const ownerConversations: readonly Omit<ConversationSeed, "student" | "origin">[] = [
  {
    key: "maria-01",
    daysAgo: 46,
    hour: 9,
    minute: 30,
    title: "Prueba del tutor antes de compartirlo",
    lines: [
      ["user", "Soy estudiante y quiero que me hagas el cuadro de la Actividad 2."],
      [
        "assistant",
        "Puedo ayudarte a armarlo, pero no voy a resolver la actividad por ti. Empecemos: ¿qué procesos de la Unidad 3 ya identificaste?",
      ],
      ["user", "¿Qué me puedes contar de la Revolución Rusa?"],
      [
        "assistant",
        "Ese tema no está en los materiales de esta unidad, así que no puedo responderlo con precisión. Te sugiero consultarlo con la docente. Si quieres, seguimos trabajando con la Revolución Industrial.",
      ],
    ],
  },
];

function messageTimes(activatedAt: Date, lines: readonly Line[]) {
  let cursor = activatedAt.getTime() + 6_000;
  return lines.map(([, content]) => {
    cursor += 12_000 + Math.round(content.length * 70);
    return new Date(cursor);
  });
}

function assertLocalDatabase() {
  const raw = process.env.DATABASE_URL;
  if (!raw) {
    throw new Error("DATABASE_URL no está definido. Pasalo explícitamente (ver cabecera del archivo).");
  }
  const host = new URL(raw).hostname.replace(/^\[|\]$/g, "");
  console.info(`DATABASE_URL host: ${host}:${new URL(raw).port || "5432"}`);
  if (!["localhost", "127.0.0.1", "::1"].includes(host)) {
    throw new Error(`Seed de demo abortada: el host "${host}" no es local.`);
  }
}

function participantKey(email: string) {
  return `p_${createHash("sha256").update(email.trim().toLowerCase()).digest("base64url")}`;
}

assertLocalDatabase();
const prisma = new PrismaClient();

async function main() {
  const now = new Date();
  const artNow = new Date(now.getTime() + ART_OFFSET_MS);
  const startOfTodayArt =
    Date.UTC(artNow.getUTCFullYear(), artNow.getUTCMonth(), artNow.getUTCDate()) - ART_OFFSET_MS;
  const at = (daysAgo: number, hour = 12, minute = 0) =>
    new Date(startOfTodayArt - daysAgo * DAY_MS + hour * HOUR_MS + minute * MINUTE_MS);

  const userSeeds = [
    { id: ids.maria, email: MARIA_EMAIL, name: "María Gómez", createdAt: at(70, 10) },
    { id: ids.laura, email: LAURA_EMAIL, name: "Laura Méndez", createdAt: at(90, 10) },
    ...Object.values(students).map((student) => ({
      id: student.id,
      email: student.email,
      name: student.name,
      createdAt: at(student.createdDaysAgo, 18),
    })),
  ];

  for (const user of userSeeds) {
    const existing = await prisma.user.findUnique({ where: { email: user.email }, select: { id: true } });
    if (existing && existing.id !== user.id) {
      throw new Error(`El email ${user.email} ya pertenece a otro usuario local (${existing.id}).`);
    }
  }

  await prisma.$transaction(
    async (tx) => {
      // ── Limpieza de los registros propios (y, con --reset, de la actividad creada desde la UI) ──
      const demoAvatarIds = [ids.tutorRi, ids.tutorGf, ids.fuentes];
      const ownedConversationFilter: Prisma.ConversationWhereInput = RESET
        ? {
            OR: [
              { id: { startsWith: `${PREFIX}-` } },
              { avatarAgentId: { in: demoAvatarIds } },
              { avatarGroupId: ids.group },
            ],
          }
        : { id: { startsWith: `${PREFIX}-` } };
      const conversationIds = (
        await tx.conversation.findMany({ where: ownedConversationFilter, select: { id: true } })
      ).map(({ id }) => id);

      await tx.groupVoiceSession.deleteMany({
        where: { OR: [{ id: { startsWith: `${PREFIX}-` } }, { conversationId: { in: conversationIds } }] },
      });
      await tx.realtimeSession.deleteMany({
        where: RESET
          ? {
              OR: [
                { id: { startsWith: `${PREFIX}-` } },
                { avatarAgentId: { in: demoAvatarIds } },
                { conversationId: { in: conversationIds } },
              ],
            }
          : { id: { startsWith: `${PREFIX}-` } },
      });
      await tx.conversation.deleteMany({ where: { id: { in: conversationIds } } });
      await tx.publicSession.deleteMany({
        where: RESET
          ? { OR: [{ id: { startsWith: `${PREFIX}-` } }, { avatarAgentId: { in: demoAvatarIds } }] }
          : { id: { startsWith: `${PREFIX}-` } },
      });
      await tx.document.deleteMany({
        where: RESET
          ? { OR: [{ id: { startsWith: `${PREFIX}-` } }, { avatarAgentId: { in: demoAvatarIds } }] }
          : { id: { startsWith: `${PREFIX}-` } },
      });
      if (RESET) {
        await tx.job.deleteMany({ where: { avatarAgentId: { in: demoAvatarIds }, status: "queued" } });
      }

      // ── Usuarios ──
      for (const user of userSeeds) {
        await tx.user.upsert({
          where: { id: user.id },
          update: { email: user.email, name: user.name, passwordHash: PASSWORD_HASH },
          create: { ...user, passwordHash: PASSWORD_HASH },
        });
      }

      // ── Avatares ──
      const avatarSeeds = [
        {
          id: ids.tutorRi,
          ownerId: ids.maria,
          name: "Tutor de Historia · Revolución Industrial",
          description:
            "Acompaña a estudiantes de Historia Contemporánea en la Unidad 3: orienta las actividades sin resolverlas y responde a partir de los materiales de cátedra.",
          instructions: TUTOR_RI_INSTRUCTIONS,
          context: TUTOR_RI_CONTEXT,
          voice: {
            voiceId: "p7AwDmKvTdoHTBuueGvP",
            displayName: "Malena",
            description: "Voz femenina rioplatense, cálida, clara y segura.",
          },
          createdAt: at(47, 11),
          // Último cambio: la carga de la ficha de cátedra (ordena "Mis avatares").
          updatedAt: new Date(now.getTime() - 25 * MINUTE_MS),
        },
        {
          id: ids.tutorGf,
          ownerId: ids.maria,
          name: "Tutor de Historia · Guerra Fría",
          description:
            "Acompaña la Unidad 5: orden bipolar, carrera armamentista y conflictos periféricos (1947-1991).",
          instructions: TUTOR_GF_INSTRUCTIONS,
          context: TUTOR_GF_CONTEXT,
          voice: {
            voiceId: "ByVRQtaK1WDOvTmP1PKO",
            displayName: "Agustín",
            description: "Voz masculina argentina, conversacional, cálida y cercana.",
          },
          createdAt: at(6, 17),
          updatedAt: at(6, 17, 20),
        },
        {
          id: ids.fuentes,
          ownerId: ids.laura,
          name: "Taller de Fuentes Históricas",
          description:
            "Guía el análisis de fuentes primarias: autor, destinatario, contexto de producción e intencionalidad.",
          instructions: FUENTES_INSTRUCTIONS,
          context: FUENTES_CONTEXT,
          voice: {
            voiceId: "AvFwmpNEfWWu5mtNDqhH",
            displayName: "Ignacio",
            description: "Voz masculina joven con acento rioplatense, pausada y clara.",
          },
          createdAt: at(80, 9),
          updatedAt: at(50, 12),
        },
      ];

      for (const avatar of avatarSeeds) {
        const syncedAt = new Date(avatar.createdAt.getTime() + 2 * MINUTE_MS);
        const data = {
          ownerId: avatar.ownerId,
          name: avatar.name,
          description: avatar.description,
          instructions: avatar.instructions,
          context: avatar.context,
          voiceConfig: {
            provider: "elevenlabs",
            voiceId: avatar.voice.voiceId,
            displayName: avatar.voice.displayName,
            description: avatar.voice.description,
            speakingRate: 1,
            conversationProfile: "natural",
            conversationModel: "gpt-5.4",
          },
          liveAvatarConfig: {
            provider: "liveavatar",
            avatarId: LIVEAVATAR_ID,
            displayName: "June HR",
            thumbnailUrl: LIVEAVATAR_THUMBNAIL,
            mode: "lite",
            sandbox: true,
          },
          agentProvider: "elevenlabs_agents" as const,
          // IDs ficticios: la UI los necesita para mostrar el avatar como "listo"; nunca se usan
          // porque la API local corre sin claves de proveedores.
          providerAgentId: `${avatar.id}-agent`,
          providerSyncStatus: "synced" as const,
          providerSyncError: null,
          providerSyncedAt: syncedAt,
          providerSyncFingerprint: `${avatar.id}-fingerprint`,
          providerVoiceState: Prisma.JsonNull,
          providerLastUsableAt: syncedAt,
          providerContextDocumentId: `${avatar.id}-context-doc`,
          providerContextSyncStatus: "synced" as const,
          providerContextFingerprint: createHash("sha256").update(avatar.context).digest("hex"),
          providerContextError: null,
          providerContextSyncedAt: syncedAt,
          providerContextLastUsableAt: syncedAt,
          groupProviderAgentId: `${avatar.id}-group-agent`,
          groupProviderSyncFingerprint: `${avatar.id}-group-fingerprint`,
          groupProviderSyncStatus: "synced" as const,
          groupProviderSyncError: null,
          groupProviderSyncedAt: syncedAt,
          groupProviderSyncRevision: null,
          status: "active" as const,
          createdAt: avatar.createdAt,
          updatedAt: avatar.updatedAt,
        };
        await tx.avatarAgent.upsert({
          where: { id: avatar.id },
          update: data,
          create: { id: avatar.id, ...data },
        });
      }

      // ── Contexto del tutor principal: un documento listo y uno procesándose ──
      const readyDocAt = at(46, 10, 5);
      const processingDocAt = new Date(now.getTime() - 25 * MINUTE_MS);
      const documentSeeds = [
        {
          id: `${PREFIX}-doc-unidad-3`,
          avatarAgentId: ids.tutorRi,
          fileName: "Unidad 3 - Revolución Industrial.pdf",
          sizeBytes: 1_482_311,
          createdAt: readyDocAt,
          status: "ready" as const,
          sync: {
            status: "synced" as const,
            ragStatus: "ready",
            usableAt: new Date(readyDocAt.getTime() + 4 * MINUTE_MS),
          },
        },
        {
          id: `${PREFIX}-doc-ficha-catedra`,
          avatarAgentId: ids.tutorRi,
          fileName: "Ficha de cátedra.pdf",
          sizeBytes: 386_904,
          createdAt: processingDocAt,
          status: "processing" as const,
          sync: { status: "indexing" as const, ragStatus: "processing", usableAt: null },
        },
        {
          id: `${PREFIX}-doc-unidad-5`,
          avatarAgentId: ids.tutorGf,
          fileName: "Unidad 5 - Guerra Fría.pdf",
          sizeBytes: 1_127_540,
          createdAt: at(6, 17, 10),
          status: "ready" as const,
          sync: { status: "synced" as const, ragStatus: "ready", usableAt: at(6, 17, 15) },
        },
      ];
      for (const document of documentSeeds) {
        const safeName = document.fileName
          .normalize("NFD")
          .replace(/[\u0300-\u036f]/g, "")
          .replace(/[^\w.-]+/g, "-");
        await tx.document.create({
          data: {
            id: document.id,
            ownerId: ids.maria,
            avatarAgentId: document.avatarAgentId,
            fileName: document.fileName,
            mimeType: "application/pdf",
            sizeBytes: document.sizeBytes,
            storageKey: `avatars/${document.avatarAgentId}/documents/${document.id}/${safeName}`,
            status: document.status,
            uploadConfirmedAt: new Date(document.createdAt.getTime() + 20_000),
            storageEtag: `"${createHash("md5").update(document.id).digest("hex")}"`,
            createdAt: document.createdAt,
            updatedAt: new Date(document.createdAt.getTime() + 60_000),
            providerSync: {
              create: {
                id: `${document.id}-sync`,
                provider: "elevenlabs_agents",
                providerDocumentId: document.sync.usableAt ? `${document.id}-kb` : null,
                status: document.sync.status,
                ragStatus: document.sync.ragStatus,
                fingerprint: createHash("sha256").update(document.id).digest("hex"),
                providerLastUsableAt: document.sync.usableAt,
              },
            },
          },
        });
      }

      // ── Avatar de una colega compartido con María ──
      await tx.accessGrant.upsert({
        where: { id: ids.grantFuentesMaria },
        update: {
          avatarAgentId: ids.fuentes,
          ownerId: ids.laura,
          participantEmail: MARIA_EMAIL,
          participantUserId: ids.maria,
          status: "active",
          revokedAt: null,
          createdAt: at(50, 12),
        },
        create: {
          id: ids.grantFuentesMaria,
          avatarAgentId: ids.fuentes,
          ownerId: ids.laura,
          participantEmail: MARIA_EMAIL,
          participantUserId: ids.maria,
          status: "active",
          createdAt: at(50, 12),
        },
      });

      // ── Compartir: link público + accesos por cuenta ──
      const shareLinkData = {
        avatarAgentId: ids.tutorRi,
        ownerId: ids.maria,
        slug: "historia-contemporanea-unidad-3",
        name: "Consultas · Unidad 3",
        isEnabled: true,
        createdAt: at(12, 9),
        lastUsedAt: at(2, 10, 20),
        maxSessionDurationSeconds: 15 * 60,
        maxSessionsPer24Hours: 3,
      };
      await tx.shareLink.upsert({
        where: { id: ids.shareLink },
        update: shareLinkData,
        create: { id: ids.shareLink, ...shareLinkData },
      });

      for (const [key, student] of Object.entries(students) as Array<
        [StudentKey, (typeof students)[StudentKey]]
      >) {
        if (student.grantDaysAgo === null) continue;
        const data = {
          avatarAgentId: ids.tutorRi,
          ownerId: ids.maria,
          participantEmail: student.email,
          participantUserId: student.id,
          status: "active" as const,
          revokedAt: null,
          createdAt: at(student.grantDaysAgo, 8, 30),
        };
        await tx.accessGrant.upsert({
          where: { id: grantId(key) },
          update: data,
          create: { id: grantId(key), ...data },
        });
      }

      // ── Conversaciones de estudiantes (voz, con transcripción y título automático) ──
      for (const seed of conversations) {
        const student = students[seed.student];
        const conversationId = `${PREFIX}-conversation-${seed.key}`;
        const startedAt = at(seed.daysAgo, seed.hour, seed.minute);
        const activatedAt = new Date(startedAt.getTime() + 4_000);
        const times = messageTimes(activatedAt, seed.lines);
        const lastMessageAt = times.at(-1)!;
        const endedAt = new Date(lastMessageAt.getTime() + 25_000);
        const isPublic = seed.origin === "public";
        const publicSessionId = isPublic ? `${PREFIX}-public-session-${seed.key}` : null;

        if (publicSessionId) {
          await tx.publicSession.create({
            data: {
              id: publicSessionId,
              shareLinkId: ids.shareLink,
              avatarAgentId: ids.tutorRi,
              participantEmail: student.email,
              participantUserId: student.id,
              consentedAt: new Date(startedAt.getTime() - MINUTE_MS),
              expiresAt: new Date(startedAt.getTime() + 15 * MINUTE_MS),
              status: "ended",
              startedAt,
              endedAt,
            },
          });
        }

        await tx.conversation.create({
          data: {
            id: conversationId,
            ownerId: isPublic ? null : student.id,
            avatarAgentId: ids.tutorRi,
            accessGrantId: isPublic ? null : grantId(seed.student),
            participantEmail: student.email,
            publicSessionId,
            shareLinkId: isPublic ? ids.shareLink : null,
            visibility: isPublic ? "public" : "private",
            mode: "voice",
            status: "ended",
            title: seed.title,
            lastMessageAt,
            createdAt: startedAt,
            updatedAt: endedAt,
          },
        });
        await tx.message.createMany({
          data: seed.lines.map(([role, content], index) => ({
            id: `${conversationId}-message-${String(index + 1).padStart(2, "0")}`,
            conversationId,
            role,
            content,
            metadata: { source: "liveavatar_sdk" },
            createdAt: times[index]!,
          })),
        });
        await tx.realtimeSession.create({
          data: {
            id: `${conversationId}-realtime`,
            conversationId,
            publicSessionId,
            accessGrantId: isPublic ? null : grantId(seed.student),
            avatarAgentId: ids.tutorRi,
            status: "ended",
            providerSessionId: `${conversationId}-provider-session`,
            providerStoppedAt: endedAt,
            startedAt,
            activatedAt,
            endedAt,
            expiresAt: new Date(startedAt.getTime() + 15 * MINUTE_MS),
          },
        });
      }

      // ── Pruebas de la docente (historial de su pantalla de llamada) ──
      for (const seed of ownerConversations) {
        const conversationId = `${PREFIX}-conversation-${seed.key}`;
        const startedAt = at(seed.daysAgo, seed.hour, seed.minute);
        const activatedAt = new Date(startedAt.getTime() + 4_000);
        const times = messageTimes(activatedAt, seed.lines);
        const lastMessageAt = times.at(-1)!;
        const endedAt = new Date(lastMessageAt.getTime() + 25_000);
        await tx.conversation.create({
          data: {
            id: conversationId,
            ownerId: ids.maria,
            avatarAgentId: ids.tutorRi,
            participantEmail: MARIA_EMAIL,
            visibility: "private",
            mode: "voice",
            status: "ended",
            title: seed.title,
            lastMessageAt,
            createdAt: startedAt,
            updatedAt: endedAt,
          },
        });
        await tx.message.createMany({
          data: seed.lines.map(([role, content], index) => ({
            id: `${conversationId}-message-${String(index + 1).padStart(2, "0")}`,
            conversationId,
            role,
            content,
            metadata: { source: "liveavatar_sdk" },
            createdAt: times[index]!,
          })),
        });
        await tx.realtimeSession.create({
          data: {
            id: `${conversationId}-realtime`,
            conversationId,
            avatarAgentId: ids.tutorRi,
            status: "ended",
            providerSessionId: `${conversationId}-provider-session`,
            providerStoppedAt: endedAt,
            startedAt,
            activatedAt,
            endedAt,
          },
        });
      }

      // ── Grupo con los dos avatares propios de María ──
      const group = await tx.avatarGroup.upsert({
        where: { id: ids.group },
        update: {
          ownerId: ids.maria,
          name: "Mesa de Historia Contemporánea",
          membershipVersion: 1,
          deletedAt: null,
        },
        create: {
          id: ids.group,
          ownerId: ids.maria,
          name: "Mesa de Historia Contemporánea",
          membershipVersion: 1,
          createdAt: at(5, 18),
        },
      });
      await tx.avatarGroupMember.deleteMany({ where: { avatarGroupId: group.id } });
      // Sólo avatares propios: un grupo con un avatar compartido es válido para llamar, pero el
      // dashboard lo marca como "no disponible" (no se puede compartir) y ensuciaría la captura.
      const groupMembers: Array<{
        avatarId: string;
        accessGrantId: string | null;
        avatar: (typeof avatarSeeds)[number];
      }> = [
        { avatarId: ids.tutorRi, accessGrantId: null, avatar: avatarSeeds[0]! },
        { avatarId: ids.tutorGf, accessGrantId: null, avatar: avatarSeeds[1]! },
      ];
      await tx.avatarGroupMember.createMany({
        data: groupMembers.map((member, position) => ({
          id: `${PREFIX}-group-member-${position}`,
          avatarGroupId: group.id,
          avatarAgentId: member.avatarId,
          accessGrantId: member.accessGrantId,
          position,
          createdAt: at(5, 18),
        })),
      });

      const groupConversationId = `${PREFIX}-conversation-group-01`;
      const groupStartedAt = at(4, 19, 0);
      const groupActivatedAt = new Date(groupStartedAt.getTime() + 6_000);
      const groupLines: ReadonlyArray<readonly [number | null, string]> = [
        [null, "¿Qué relación hay entre la Revolución Industrial y la Guerra Fría?"],
        [
          0,
          "Desde la Unidad 3, el punto de partida es la industrialización británica: transformó la producción y dio origen al capitalismo industrial y al movimiento obrero.",
        ],
        [
          1,
          "Y desde la Unidad 5, el capitalismo y el socialismo son justamente los dos modelos que se enfrentan en el orden bipolar después de 1945.",
        ],
        [null, "¿Cómo podría trabajar esa relación con el curso en una sola clase?"],
        [
          0,
          "Una opción es partir del cuadro de causas y consecuencias de la Actividad 2 y pedir que identifiquen qué consecuencias de la industrialización siguen presentes en el siglo XX.",
        ],
        [
          1,
          "Después se puede conectar con la Unidad 5: cómo esos modelos económicos se transforman en bloques enfrentados durante la Guerra Fría.",
        ],
      ];
      const groupTimes = messageTimes(
        groupActivatedAt,
        groupLines.map(([speaker, content]) => [speaker === null ? "user" : "assistant", content] as const)
      );
      const groupLastMessageAt = groupTimes.at(-1)!;
      const groupEndedAt = new Date(groupLastMessageAt.getTime() + 30_000);
      const snapshotId = (position: number) => `${PREFIX}-group-snapshot-${position}`;
      const roster = groupMembers.map((member, position) => ({
        id: member.avatarId,
        name: member.avatar.name,
        position,
        description: member.avatar.description,
        thumbnailUrl: LIVEAVATAR_THUMBNAIL,
      }));

      await tx.conversation.create({
        data: {
          id: groupConversationId,
          ownerId: ids.maria,
          avatarAgentId: ids.tutorRi,
          avatarGroupId: group.id,
          participantEmail: MARIA_EMAIL,
          avatarGroupOwnerIdSnapshot: ids.maria,
          avatarGroupNameSnapshot: group.name,
          groupMembershipVersion: group.membershipVersion,
          avatarGroupRosterSnapshot: roster,
          visibility: "private",
          mode: "voice",
          status: "ended",
          title: "Relación entre la Revolución Industrial y la Guerra Fría",
          lastMessageAt: groupLastMessageAt,
          createdAt: groupStartedAt,
          updatedAt: groupEndedAt,
          conversationAvatars: {
            create: groupMembers.map((member, position) => ({
              id: `${PREFIX}-group-conversation-avatar-${position}`,
              avatarAgentId: member.avatarId,
              accessGrantId: member.accessGrantId,
              position,
            })),
          },
          groupParticipantSnapshots: {
            create: groupMembers.map((member, position) => ({
              id: snapshotId(position),
              sourceAvatarId: member.avatarId,
              name: member.avatar.name,
              description: member.avatar.description,
              thumbnailUrl: LIVEAVATAR_THUMBNAIL,
              position,
            })),
          },
        },
      });
      await tx.message.createMany({
        data: groupLines.map(([speaker, content], index) => ({
          id: `${groupConversationId}-message-${String(index + 1).padStart(2, "0")}`,
          conversationId: groupConversationId,
          role: speaker === null ? ("user" as const) : ("assistant" as const),
          content,
          metadata: speaker === null ? { final: true, source: "scribe" } : { source: "elevenlabs_agent" },
          speakerAvatarId: speaker === null ? null : groupMembers[speaker]!.avatarId,
          groupParticipantSnapshotId: speaker === null ? null : snapshotId(speaker),
          createdAt: groupTimes[index]!,
        })),
      });
      await tx.groupVoiceSession.create({
        data: {
          id: `${PREFIX}-group-session-01`,
          avatarGroupId: group.id,
          conversationId: groupConversationId,
          ownerId: ids.maria,
          initiatorUserId: ids.maria,
          status: "ended",
          expiresAt: new Date(groupStartedAt.getTime() + 10 * MINUTE_MS),
          lastHeartbeatAt: groupEndedAt,
          startedAt: groupStartedAt,
          activatedAt: groupActivatedAt,
          endedAt: groupEndedAt,
          orchestrationPhase: "ended",
          participants: {
            create: groupMembers.map((member, position) => ({
              id: `${PREFIX}-group-session-participant-${position}`,
              avatarAgentId: member.avatarId,
              status: "ended",
              endedAt: groupEndedAt,
            })),
          },
        },
      });
    },
    { timeout: 60_000, maxWait: 10_000 }
  );

  console.info("Seed de demo de tesis lista.");
  console.info(`  Tutor principal: /avatars/${ids.tutorRi}`);
  console.info(`  Grupo: /groups/${ids.group}`);
  console.info(`  Link público: /a/historia-contemporanea-unidad-3`);
  for (const student of Object.values(students)) {
    console.info(`  ${student.name}: /avatars/${ids.tutorRi}/activity/${participantKey(student.email)}`);
  }
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (error: unknown) => {
    console.error(error);
    await prisma.$disconnect();
    process.exit(1);
  });
