import { PrismaClient, type Prisma } from "@prisma/client";
import {
  DASHBOARD_SEED_OWNER_EMAIL,
  DASHBOARD_SEED_OWNER_ID,
  dashboardSeedAccessGrantId,
  dashboardSeedParticipantId,
} from "./dashboard-seed-namespace";

const prisma = new PrismaClient();

const DAY_MS = 24 * 60 * 60 * 1_000;
const MINUTE_MS = 60 * 1_000;
const MESSAGE_STEP_MS = 8 * 1_000;
const demoPasswordHash = "$2b$10$Gp7Lpf7jYhtgKnocU9Zs2eLyiLxzG1ydQ0gFj0YMLyIslW95AD3ay";

const avatars = [
  {
    id: "dashboard-seed-avatar-algebra",
    name: "Álex · Tutor de Álgebra",
    description: "Acompaña a estudiantes de primer año con explicaciones y práctica guiada.",
    instructions:
      "Explicá cada paso con claridad, comprobá la comprensión y evitá resolver sin mostrar el razonamiento.",
    context: "Programa de Álgebra I: ecuaciones, funciones, matrices y sistemas lineales.",
    voiceId: "alloy",
    providerSyncStatus: "not_synced" as const,
    providerSyncError: null,
  },
  {
    id: "dashboard-seed-avatar-thesis",
    name: "Vera · Mentora de Tesis",
    description: "Ayuda a delimitar problemas, ordenar argumentos y sostener el avance semanal.",
    instructions: "Pedí evidencia, señalá supuestos y cerrá cada conversación con próximos pasos concretos.",
    context: "Guía institucional de tesis, metodología y criterios de escritura académica.",
    voiceId: "nova",
    providerSyncStatus: "not_synced" as const,
    providerSyncError: null,
  },
  {
    id: "dashboard-seed-avatar-presentations",
    name: "Mía · Coach de Presentaciones",
    description: "Entrena defensas orales con foco en estructura, síntesis y preguntas de jurado.",
    instructions:
      "Dá feedback directo y accionable. Priorizá una mejora por vez y simulá preguntas de jurado.",
    context: "Buenas prácticas de storytelling y defensa oral de proyectos académicos.",
    voiceId: "verse",
    providerSyncStatus: "failed" as const,
    providerSyncError: "La credencial del proveedor debe renovarse antes de la próxima llamada.",
  },
];

const participants = [
  ["ana@dashboard-seed.yuni.local", "Ana Torres"],
  ["mateo@dashboard-seed.yuni.local", "Mateo Ruiz"],
  ["sofia@dashboard-seed.yuni.local", "Sofía Benítez"],
  ["julian@dashboard-seed.yuni.local", "Julián Paz"],
  ["tomas@dashboard-seed.yuni.local", "Tomás Acosta"],
  ["camila@dashboard-seed.yuni.local", "Camila Soto"],
  ["bruno@dashboard-seed.yuni.local", "Bruno Díaz"],
  ["valentina@dashboard-seed.yuni.local", "Valentina Ríos"],
  ["lucia@dashboard-seed.yuni.local", "Lucía Romero"],
] as const;

const accesses = [
  ["dashboard-seed-avatar-algebra", "ana@dashboard-seed.yuni.local", 80],
  ["dashboard-seed-avatar-algebra", "mateo@dashboard-seed.yuni.local", 25],
  ["dashboard-seed-avatar-algebra", "lucia@dashboard-seed.yuni.local", 3],
  ["dashboard-seed-avatar-thesis", "julian@dashboard-seed.yuni.local", 25],
  ["dashboard-seed-avatar-thesis", "camila@dashboard-seed.yuni.local", 50],
  ["dashboard-seed-avatar-thesis", "valentina@dashboard-seed.yuni.local", 16],
  ["dashboard-seed-avatar-presentations", "tomas@dashboard-seed.yuni.local", 25],
  ["dashboard-seed-avatar-presentations", "bruno@dashboard-seed.yuni.local", 55],
] as const;

type ConversationSeed = {
  id: string;
  avatarId: string;
  email: string;
  daysAgo: number;
  hour: number;
  title: string;
  mode: "text" | "voice";
  visibility?: "private" | "public";
  prompt: string;
  answer: string;
  userTurns: number;
  voice?: { status: "ended" | "errored"; durationSeconds: number; errorMessage?: string };
};

// Offsets 1–29 feed the current dashboard period; offsets 30–59 feed its comparison period.
const conversations: readonly ConversationSeed[] = [
  {
    id: "dashboard-seed-conversation-current-01",
    avatarId: "dashboard-seed-avatar-thesis",
    email: "julian@dashboard-seed.yuni.local",
    daysAgo: 1,
    hour: 18,
    title: "Próximos pasos del marco teórico",
    mode: "voice",
    prompt: "Tengo muchas fuentes y no sé cómo ordenarlas.",
    answer: "Agrupalas por la pregunta que ayudan a responder y cerrá cada eje con una síntesis.",
    userTurns: 4,
    voice: { status: "ended", durationSeconds: 540 },
  },
  {
    id: "dashboard-seed-conversation-current-02",
    avatarId: "dashboard-seed-avatar-algebra",
    email: "ana@dashboard-seed.yuni.local",
    daysAgo: 2,
    hour: 10,
    title: "Sistemas de ecuaciones por eliminación",
    mode: "voice",
    prompt: "¿Cuándo conviene usar eliminación?",
    answer: "Cuando podés cancelar una variable sumando ecuaciones con pocos pasos.",
    userTurns: 4,
    voice: { status: "ended", durationSeconds: 360 },
  },
  {
    id: "dashboard-seed-conversation-current-03",
    avatarId: "dashboard-seed-avatar-algebra",
    email: "sofia@dashboard-seed.yuni.local",
    daysAgo: 3,
    hour: 15,
    title: "Repaso público de funciones",
    mode: "voice",
    visibility: "public",
    prompt: "¿Cómo identifico el dominio en una función racional?",
    answer: "Excluí los valores que hacen cero el denominador y revisá si algún factor se cancela.",
    userTurns: 4,
    voice: { status: "ended", durationSeconds: 240 },
  },
  {
    id: "dashboard-seed-conversation-current-04",
    avatarId: "dashboard-seed-avatar-algebra",
    email: "mateo@dashboard-seed.yuni.local",
    daysAgo: 4,
    hour: 20,
    title: "Llamada interrumpida sobre matrices",
    mode: "voice",
    prompt: "Quiero practicar determinantes de tres por tres.",
    answer: "Empecemos eligiendo una fila con varios ceros para desarrollar por cofactores.",
    userTurns: 2,
    voice: {
      status: "errored",
      durationSeconds: 38,
      errorMessage: "La conexión de voz se cerró antes de completar la respuesta.",
    },
  },
  {
    id: "dashboard-seed-conversation-current-05",
    avatarId: "dashboard-seed-avatar-algebra",
    email: "sofia@dashboard-seed.yuni.local",
    daysAgo: 6,
    hour: 11,
    title: "Composición de funciones",
    mode: "voice",
    visibility: "public",
    prompt: "No distingo f de g de g de f.",
    answer: "Pensá cuál función actúa primero: siempre es la que está más cerca de x.",
    userTurns: 3,
    voice: { status: "ended", durationSeconds: 420 },
  },
  {
    id: "dashboard-seed-conversation-current-06",
    avatarId: "dashboard-seed-avatar-thesis",
    email: "julian@dashboard-seed.yuni.local",
    daysAgo: 7,
    hour: 9,
    title: "Delimitación de la pregunta de investigación",
    mode: "text",
    prompt: "Mi pregunta sobre IA y educación sigue siendo demasiado amplia.",
    answer: "Delimitá herramienta, población, contexto y una conducta observable.",
    userTurns: 5,
  },
  {
    id: "dashboard-seed-conversation-current-07",
    avatarId: "dashboard-seed-avatar-algebra",
    email: "ana@dashboard-seed.yuni.local",
    daysAgo: 8,
    hour: 17,
    title: "Dudas sobre transformaciones lineales",
    mode: "text",
    prompt: "¿Qué tengo que comprobar para que una transformación sea lineal?",
    answer: "Que preserve la suma de vectores y la multiplicación por escalares.",
    userTurns: 3,
  },
  {
    id: "dashboard-seed-conversation-current-08",
    avatarId: "dashboard-seed-avatar-algebra",
    email: "mateo@dashboard-seed.yuni.local",
    daysAgo: 12,
    hour: 13,
    title: "Plan de práctica para el parcial",
    mode: "text",
    prompt: "Rindo en diez días y no sé por dónde empezar.",
    answer: "Hacé un diagnóstico por tema y priorizá los errores que se repiten.",
    userTurns: 4,
  },
  {
    id: "dashboard-seed-conversation-current-09",
    avatarId: "dashboard-seed-avatar-presentations",
    email: "tomas@dashboard-seed.yuni.local",
    daysAgo: 18,
    hour: 16,
    title: "Primer ensayo de la defensa",
    mode: "text",
    prompt: "Mi introducción dura casi cinco minutos.",
    answer: "Reducila a problema, relevancia y aporte; los antecedentes detallados pueden salir.",
    userTurns: 2,
  },
  {
    id: "dashboard-seed-conversation-previous-01",
    avatarId: "dashboard-seed-avatar-algebra",
    email: "ana@dashboard-seed.yuni.local",
    daysAgo: 34,
    hour: 10,
    title: "Introducción a matrices",
    mode: "voice",
    prompt: "¿Qué representa una matriz?",
    answer: "Es una forma ordenada de representar datos o una transformación entre vectores.",
    userTurns: 3,
    voice: { status: "ended", durationSeconds: 300 },
  },
  {
    id: "dashboard-seed-conversation-previous-02",
    avatarId: "dashboard-seed-avatar-thesis",
    email: "camila@dashboard-seed.yuni.local",
    daysAgo: 36,
    hour: 14,
    title: "Elección del enfoque metodológico",
    mode: "voice",
    prompt: "No sé si mi trabajo es cualitativo o cuantitativo.",
    answer: "Empecemos por el tipo de evidencia que necesitás para responder tu pregunta.",
    userTurns: 3,
    voice: { status: "ended", durationSeconds: 480 },
  },
  {
    id: "dashboard-seed-conversation-previous-03",
    avatarId: "dashboard-seed-avatar-algebra",
    email: "sofia@dashboard-seed.yuni.local",
    daysAgo: 40,
    hour: 19,
    title: "Consulta pública sobre ecuaciones",
    mode: "voice",
    visibility: "public",
    prompt: "¿Por qué cambia el signo cuando paso un término?",
    answer: "No cambia por cruzar: cambia porque aplicás la operación inversa en ambos lados.",
    userTurns: 2,
    voice: {
      status: "errored",
      durationSeconds: 52,
      errorMessage: "La sesión expiró mientras se recuperaba la conexión.",
    },
  },
  {
    id: "dashboard-seed-conversation-previous-04",
    avatarId: "dashboard-seed-avatar-algebra",
    email: "ana@dashboard-seed.yuni.local",
    daysAgo: 43,
    hour: 12,
    title: "Práctica de ecuaciones lineales",
    mode: "text",
    prompt: "Quiero comprobar si resolví bien 3x+2=14.",
    answer: "Si restaste dos y dividiste por tres, deberías obtener x igual a cuatro.",
    userTurns: 2,
  },
  {
    id: "dashboard-seed-conversation-previous-05",
    avatarId: "dashboard-seed-avatar-presentations",
    email: "bruno@dashboard-seed.yuni.local",
    daysAgo: 48,
    hour: 16,
    title: "Estructura de una presentación breve",
    mode: "text",
    prompt: "Tengo sólo siete minutos para presentar.",
    answer: "Usá un minuto para el problema, cuatro para la propuesta y dos para evidencia y cierre.",
    userTurns: 2,
  },
];

function atDaysAgo(startOfToday: Date, daysAgo: number, hour: number) {
  return new Date(startOfToday.getTime() - daysAgo * DAY_MS + hour * 60 * MINUTE_MS);
}

function accessKey(avatarId: string, email: string) {
  return `${avatarId}:${email}`;
}

function buildMessages(seed: ConversationSeed, startedAt: Date) {
  const followUps = [
    [
      "¿Podemos verlo paso a paso?",
      "Sí. Separá primero los datos, después la regla y al final la comprobación.",
    ],
    [
      "¿Cómo compruebo que voy bien?",
      "Explicá cada decisión con tus palabras y verificá el resultado con un caso simple.",
    ],
    ["¿Qué error debería evitar?", "No saltees la definición central ni cambies dos cosas al mismo tiempo."],
    [
      "¿Con qué próximo paso cierro?",
      "Aplicalo ahora a un ejemplo nuevo y anotá qué parte todavía te genera duda.",
    ],
  ] as const;
  const exchanges = [[seed.prompt, seed.answer] as const, ...followUps].slice(0, seed.userTurns);

  return exchanges.flatMap(([user, assistant], exchangeIndex) =>
    ([user, assistant] as const).map((content, messageIndex) => {
      const index = exchangeIndex * 2 + messageIndex;
      return {
        id: `${seed.id}-message-${String(index + 1).padStart(2, "0")}`,
        conversationId: seed.id,
        role: messageIndex === 0 ? ("user" as const) : ("assistant" as const),
        content,
        metadata: { source: "dashboard_seed" },
        createdAt: new Date(startedAt.getTime() + (index + 1) * MESSAGE_STEP_MS),
      };
    })
  );
}

async function main() {
  const now = new Date();
  const startOfToday = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const conversationIds = conversations.map(({ id }) => id);
  const realtimeSessionIds = conversations.flatMap(({ id, voice }) => (voice ? [`${id}-realtime`] : []));
  const publicSessionIds = conversations.flatMap(({ id, visibility }) =>
    visibility === "public" ? [`${id}-public`] : []
  );

  await prisma.$transaction(async (tx) => {
    const owner = await tx.user.upsert({
      where: { id: DASHBOARD_SEED_OWNER_ID },
      update: {
        email: DASHBOARD_SEED_OWNER_EMAIL,
        name: "Dashboard Seed Creator",
        passwordHash: demoPasswordHash,
      },
      create: {
        id: DASHBOARD_SEED_OWNER_ID,
        email: DASHBOARD_SEED_OWNER_EMAIL,
        passwordHash: demoPasswordHash,
        name: "Dashboard Seed Creator",
      },
    });

    const participantIds = new Map<string, string>();
    for (const [email, name] of participants) {
      const id = dashboardSeedParticipantId(email);
      const participant = await tx.user.upsert({
        where: { id },
        update: { email, name, passwordHash: demoPasswordHash },
        create: { id, email, name, passwordHash: demoPasswordHash },
      });
      participantIds.set(email, participant.id);
    }

    for (const avatar of avatars) {
      const data = {
        ownerId: owner.id,
        name: avatar.name,
        description: avatar.description,
        instructions: avatar.instructions,
        context: avatar.context,
        voiceConfig: {
          provider: "openai",
          voiceId: avatar.voiceId,
          displayName: avatar.voiceId,
          speakingRate: 1,
        },
        liveAvatarConfig: {
          provider: "liveavatar",
          avatarId: `seed-${avatar.voiceId}`,
          displayName: avatar.name.split(" · ")[0],
          mode: "lite",
          sandbox: true,
        },
        agentProvider: "elevenlabs_agents" as const,
        providerAgentId: null,
        providerSyncStatus: avatar.providerSyncStatus,
        providerSyncError: avatar.providerSyncError,
        providerSyncedAt: null,
        providerSyncFingerprint: null,
        providerLastUsableAt: null,
        providerContextDocumentId: null,
        providerContextSyncStatus: "pending" as const,
        providerContextFingerprint: null,
        providerContextError: null,
        providerContextSyncedAt: null,
        providerContextLastUsableAt: null,
        status: "active" as const,
      } satisfies Omit<Prisma.AvatarAgentUncheckedCreateInput, "id">;

      await tx.avatarAgent.upsert({
        where: { id: avatar.id },
        update: data,
        create: { id: avatar.id, ...data },
      });
    }

    const algebraLink = await tx.shareLink.upsert({
      where: { id: "dashboard-seed-share-algebra" },
      update: {
        ownerId: owner.id,
        avatarAgentId: "dashboard-seed-avatar-algebra",
        slug: "dashboard-seed-algebra",
        name: "Álgebra I · Consulta abierta",
        isEnabled: true,
        lastUsedAt: atDaysAgo(startOfToday, 3, 15),
      },
      create: {
        id: "dashboard-seed-share-algebra",
        ownerId: owner.id,
        avatarAgentId: "dashboard-seed-avatar-algebra",
        slug: "dashboard-seed-algebra",
        name: "Álgebra I · Consulta abierta",
        isEnabled: true,
        lastUsedAt: atDaysAgo(startOfToday, 3, 15),
      },
    });
    await tx.shareLink.upsert({
      where: { id: "dashboard-seed-share-thesis" },
      update: {
        ownerId: owner.id,
        avatarAgentId: "dashboard-seed-avatar-thesis",
        slug: "dashboard-seed-thesis",
        name: "Clínica de tesis",
        isEnabled: true,
      },
      create: {
        id: "dashboard-seed-share-thesis",
        ownerId: owner.id,
        avatarAgentId: "dashboard-seed-avatar-thesis",
        slug: "dashboard-seed-thesis",
        name: "Clínica de tesis",
        isEnabled: true,
      },
    });

    const accessIds = new Map<string, string>();
    for (const [avatarId, email, daysAgo] of accesses) {
      const createdAt = atDaysAgo(startOfToday, daysAgo, 12);
      const participantUserId = participantIds.get(email) ?? null;
      const id = dashboardSeedAccessGrantId(avatarId, email);
      const grant = await tx.accessGrant.upsert({
        where: { id },
        update: {
          ownerId: owner.id,
          avatarAgentId: avatarId,
          participantEmail: email,
          participantUserId,
          status: "active",
          revokedAt: null,
          createdAt,
        },
        create: {
          id,
          ownerId: owner.id,
          avatarAgentId: avatarId,
          participantEmail: email,
          participantUserId,
          status: "active",
          createdAt,
        },
      });
      accessIds.set(accessKey(avatarId, email), grant.id);
    }

    // Refresh only records owned by this seed. Unrelated local conversations remain untouched.
    await tx.realtimeSession.deleteMany({ where: { id: { in: realtimeSessionIds } } });
    await tx.conversation.deleteMany({ where: { id: { in: conversationIds } } });
    await tx.publicSession.deleteMany({ where: { id: { in: publicSessionIds } } });

    for (const seed of conversations) {
      const visibility = seed.visibility ?? "private";
      const startedAt = atDaysAgo(startOfToday, seed.daysAgo, seed.hour);
      const messages = buildMessages(seed, startedAt);
      const lastMessageAt = messages.at(-1)?.createdAt ?? startedAt;
      const participantUserId = participantIds.get(seed.email) ?? null;
      const publicSessionId = visibility === "public" ? `${seed.id}-public` : null;

      if (publicSessionId) {
        await tx.publicSession.create({
          data: {
            id: publicSessionId,
            shareLinkId: algebraLink.id,
            avatarAgentId: seed.avatarId,
            participantEmail: seed.email,
            participantUserId,
            consentedAt: new Date(startedAt.getTime() - MINUTE_MS),
            expiresAt: new Date(startedAt.getTime() + 15 * MINUTE_MS),
            status: seed.voice?.status === "errored" ? "errored" : "ended",
            startedAt,
            endedAt: seed.voice
              ? new Date(startedAt.getTime() + seed.voice.durationSeconds * 1_000)
              : lastMessageAt,
          },
        });
      }

      await tx.conversation.create({
        data: {
          id: seed.id,
          ownerId: visibility === "private" ? participantUserId : null,
          avatarAgentId: seed.avatarId,
          accessGrantId:
            visibility === "private" ? (accessIds.get(accessKey(seed.avatarId, seed.email)) ?? null) : null,
          participantEmail: seed.email,
          publicSessionId,
          shareLinkId: visibility === "public" ? algebraLink.id : null,
          visibility,
          mode: seed.mode,
          status: "ended",
          title: seed.title,
          lastMessageAt,
          createdAt: startedAt,
          updatedAt: lastMessageAt,
        },
      });
      await tx.message.createMany({ data: messages });

      if (seed.voice) {
        const endedAt = new Date(startedAt.getTime() + seed.voice.durationSeconds * 1_000);
        await tx.realtimeSession.create({
          data: {
            id: `${seed.id}-realtime`,
            conversationId: seed.id,
            publicSessionId,
            avatarAgentId: seed.avatarId,
            status: seed.voice.status,
            providerSessionId: `seed-${seed.id}`,
            providerStoppedAt: endedAt,
            startedAt,
            endedAt,
            errorMessage: seed.voice.errorMessage ?? null,
          },
        });
      }
    }
  });

  console.info(
    `Dashboard seed ready: ${DASHBOARD_SEED_OWNER_EMAIL}, ${avatars.length} avatars, ${participants.length} participants and ${conversations.length} conversations.`
  );
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
