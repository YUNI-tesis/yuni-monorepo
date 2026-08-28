"use client";

import { motion } from "motion/react";
import React, { type CSSProperties, useRef, useState } from "react";
import styles from "./ArchitectureSystem.module.css";

type ArchitectureNodeId = "user" | "web" | "core" | "data" | "orchestrator" | "live";

type ArchitectureIconName = "person" | "browser" | "core" | "database" | "direction" | "avatar";

type FlowTone = "control" | "knowledge" | "conversation";

type CircuitPoint = readonly [u: number, v: number];

type ArchitectureNode = {
  id: ArchitectureNodeId;
  title: string;
  technology: string;
  description: string;
  icon: ArchitectureIconName;
  grid: CircuitPoint;
  portX: number;
  portY: number;
  portGap: number;
  portAlign: number;
  accent: string;
  featured?: boolean;
  compact?: boolean;
  wide?: boolean;
};

type ArchitectureFlow = {
  id: string;
  d: string;
  label: string;
  tone: FlowTone;
  nodes: readonly ArchitectureNodeId[];
  bidirectional?: boolean;
  pulse?: boolean;
};

type ArchitectureTrack = {
  id: string;
  points: readonly CircuitPoint[];
  tone: FlowTone;
  nodes: readonly ArchitectureNodeId[];
  pulse?: boolean;
};

const CIRCUIT_ORIGIN = { x: 350, y: 24 } as const;
const CIRCUIT_U = { x: 82, y: 22 } as const;
const CIRCUIT_V = { x: -56, y: 43 } as const;

function circuitPoint(u: number, v: number): CircuitPoint {
  return [u, v] as const;
}

function projectCircuitPoint([u, v]: CircuitPoint) {
  return {
    x: Number((CIRCUIT_ORIGIN.x + CIRCUIT_U.x * u + CIRCUIT_V.x * v).toFixed(1)),
    y: Number((CIRCUIT_ORIGIN.y + CIRCUIT_U.y * u + CIRCUIT_V.y * v).toFixed(1)),
  };
}

function circuitPath(points: readonly CircuitPoint[], close = false) {
  const commands = points.map((point, index) => {
    const { x, y } = projectCircuitPoint(point);
    return `${index === 0 ? "M" : "L"}${x} ${y}`;
  });

  return `${commands.join(" ")}${close ? " Z" : ""}`;
}

function isAxisAlignedCircuitRoute(points: readonly CircuitPoint[]) {
  return points.every((point, index) => {
    if (index === 0) return true;
    const previousPoint = points[index - 1];
    return previousPoint !== undefined && (previousPoint[0] === point[0] || previousPoint[1] === point[1]);
  });
}

const nodeGrid = {
  user: circuitPoint(1.65, 3.15),
  web: circuitPoint(3.85, 3.15),
  core: circuitPoint(6.15, 3.15),
  data: circuitPoint(6.15, 0.95),
  orchestrator: circuitPoint(6.15, 5.6),
  live: circuitPoint(8.75, 3.15),
} satisfies Record<ArchitectureNodeId, CircuitPoint>;

const circuitJunctions = {
  orchestratorExit: circuitPoint(8.75, 5.6),
} as const;

function positionedNode(
  node: Omit<ArchitectureNode, "portX" | "portY" | "portGap" | "portAlign"> & {
    portGap?: number;
    portAlign?: number;
  }
): ArchitectureNode {
  const { x: portX, y: portY } = projectCircuitPoint(node.grid);
  return { ...node, portX, portY, portGap: node.portGap ?? 24, portAlign: node.portAlign ?? 50 };
}

const architectureNodes: readonly ArchitectureNode[] = [
  positionedNode({
    id: "user",
    title: "Usuario",
    technology: "Punto de entrada",
    description: "Inicia la interacción y recibe voz, rostro y video.",
    icon: "person",
    grid: nodeGrid.user,
    accent: "var(--landing-accent)",
  }),
  positionedNode({
    id: "web",
    title: "Aplicación web",
    technology: "Next.js + React",
    description: "Permite configurar avatares, compartir accesos e iniciar conversaciones.",
    icon: "browser",
    grid: nodeGrid.web,
    accent: "var(--landing-accent)",
  }),
  positionedNode({
    id: "core",
    title: "Núcleo YUNI",
    technology: "API",
    description: "Autentica, valida permisos y coordina sesiones y servicios externos.",
    icon: "core",
    grid: nodeGrid.core,
    accent: "var(--landing-primary-bright)",
    portGap: 30,
    portAlign: 60,
    featured: true,
  }),
  positionedNode({
    id: "data",
    title: "Historia y estado",
    technology: "PostgreSQL",
    description: "Guarda usuarios, avatares, sesiones, mensajes y transcripciones.",
    icon: "database",
    grid: nodeGrid.data,
    accent: "var(--landing-accent)",
  }),
  positionedNode({
    id: "orchestrator",
    title: "Orquestador grupal",
    technology: "OpenAI + LangGraph",
    description: "Solo en conversaciones grupales, decide qué avatar interviene y en qué orden.",
    icon: "direction",
    grid: nodeGrid.orchestrator,
    accent: "var(--landing-primary)",
    portAlign: 65,
    compact: true,
  }),
  positionedNode({
    id: "live",
    title: "Conversación en vivo",
    technology: "ElevenLabs Agent + LiveAvatar",
    description:
      "ElevenLabs genera la respuesta y la voz; LiveAvatar suma rostro, gestos y video en tiempo real.",
    icon: "avatar",
    grid: nodeGrid.live,
    accent: "var(--landing-coral)",
    portAlign: 45,
  }),
] as const;

/*
 * The detailed flow remains available below for assistive technology. Desktop
 * is drawn as a direct PCB network. Every logical relationship owns its
 * physical track, so colors never compete for the same segment.
 */
const architectureTracks: readonly ArchitectureTrack[] = [
  {
    id: "user-web",
    points: [nodeGrid.user, nodeGrid.web],
    tone: "control",
    nodes: ["user", "web"],
    pulse: true,
  },
  {
    id: "web-core",
    points: [nodeGrid.web, nodeGrid.core],
    tone: "control",
    nodes: ["web", "core"],
    pulse: true,
  },
  {
    id: "core-data",
    points: [nodeGrid.core, nodeGrid.data],
    tone: "control",
    nodes: ["core", "data"],
  },
  {
    id: "core-live",
    points: [nodeGrid.core, nodeGrid.live],
    tone: "conversation",
    nodes: ["core", "live"],
    pulse: true,
  },
  {
    id: "core-orchestrator",
    points: [nodeGrid.core, nodeGrid.orchestrator],
    tone: "knowledge",
    nodes: ["core", "orchestrator"],
  },
  {
    id: "orchestrator-live",
    points: [nodeGrid.orchestrator, circuitJunctions.orchestratorExit, nodeGrid.live],
    tone: "knowledge",
    nodes: ["orchestrator", "live"],
    pulse: true,
  },
] as const;

if (!architectureTracks.every((track) => isAxisAlignedCircuitRoute(track.points))) {
  throw new Error("Architecture circuit routes must follow one of the two projected plane axes.");
}

const platformTopPath = circuitPath(
  [circuitPoint(0, 0), circuitPoint(10, 0), circuitPoint(10, 6.5), circuitPoint(0, 6.5)],
  true
);
const platformInnerPath = circuitPath(
  [circuitPoint(0.45, 0.45), circuitPoint(9.55, 0.45), circuitPoint(9.55, 6.05), circuitPoint(0.45, 6.05)],
  true
);
const platformCircuitPaths = [
  circuitPath(
    [circuitPoint(0.8, 0.8), circuitPoint(9.2, 0.8), circuitPoint(9.2, 5.7), circuitPoint(0.8, 5.7)],
    true
  ),
  circuitPath(
    [circuitPoint(1.2, 1.2), circuitPoint(8.8, 1.2), circuitPoint(8.8, 5.3), circuitPoint(1.2, 5.3)],
    true
  ),
] as const;
const platformGridPaths = [
  ...Array.from({ length: 6 }, (_, index) =>
    circuitPath([circuitPoint(0, index + 1), circuitPoint(10, index + 1)])
  ),
  ...Array.from({ length: 9 }, (_, index) =>
    circuitPath([circuitPoint(index + 1, 0), circuitPoint(index + 1, 6.5)])
  ),
] as const;
const platformBoltPoints = [
  circuitPoint(0.28, 0.28),
  circuitPoint(9.72, 0.28),
  circuitPoint(9.72, 6.22),
  circuitPoint(0.28, 6.22),
] as const;
const platformLeft = projectCircuitPoint(circuitPoint(0, 6.5));
const platformBottom = projectCircuitPoint(circuitPoint(10, 6.5));
const platformRight = projectCircuitPoint(circuitPoint(10, 0));
const PLATFORM_DEPTH = 22;
const platformFrontPath = `M${platformLeft.x} ${platformLeft.y} L${platformBottom.x} ${platformBottom.y} L${platformBottom.x} ${platformBottom.y + PLATFORM_DEPTH} L${platformLeft.x} ${platformLeft.y + PLATFORM_DEPTH} Z`;
const platformSidePath = `M${platformBottom.x} ${platformBottom.y} L${platformRight.x} ${platformRight.y} L${platformRight.x} ${platformRight.y + PLATFORM_DEPTH} L${platformBottom.x} ${platformBottom.y + PLATFORM_DEPTH} Z`;
const platformSeamPath = `M${platformLeft.x} ${platformLeft.y + PLATFORM_DEPTH} L${platformBottom.x} ${platformBottom.y + PLATFORM_DEPTH} L${platformRight.x} ${platformRight.y + PLATFORM_DEPTH}`;
const nodeGridKeys = new Set(Object.values(nodeGrid).map(([u, v]) => `${u}:${v}`));

const architectureFlows: readonly ArchitectureFlow[] = [
  {
    id: "user-web",
    d: "",
    label: "El usuario inicia la experiencia desde la aplicación web.",
    tone: "control",
    nodes: ["user", "web"],
  },
  {
    id: "web-core",
    d: "",
    label:
      "La aplicación web y el núcleo de YUNI intercambian operaciones para configurar avatares, compartir accesos e iniciar conversaciones.",
    tone: "control",
    nodes: ["web", "core"],
    bidirectional: true,
    pulse: true,
  },
  {
    id: "core-data",
    d: "",
    label:
      "El núcleo guarda y consulta usuarios, avatares, sesiones, mensajes y transcripciones en PostgreSQL.",
    tone: "control",
    nodes: ["core", "data"],
    bidirectional: true,
  },
  {
    id: "core-live",
    d: "",
    label: "El núcleo inicia la conversación mediante ElevenLabs y LiveAvatar.",
    tone: "conversation",
    nodes: ["core", "live"],
  },
  {
    id: "core-orchestrator",
    d: "",
    label:
      "Solo en conversaciones grupales, el núcleo y el orquestador intercambian el estado de los turnos.",
    tone: "knowledge",
    nodes: ["core", "orchestrator"],
    bidirectional: true,
  },
  {
    id: "orchestrator-live",
    d: "",
    label: "El orquestador indica el orden de intervención; cada agente genera su propia respuesta.",
    tone: "knowledge",
    nodes: ["orchestrator", "live"],
  },
] as const;

const toneClass: Record<FlowTone, string> = {
  control: styles.control ?? "",
  knowledge: styles.knowledge ?? "",
  conversation: styles.conversation ?? "",
};

type NodePositionStyle = CSSProperties & {
  "--node-x": string;
  "--node-y": string;
  "--node-accent": string;
  "--node-gap": string;
  "--node-port-x": string;
  "--node-shift-x": string;
};

function ArchitectureIcon({ name }: { name: ArchitectureIconName }) {
  const sharedProps = {
    fill: "none",
    stroke: "currentColor",
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    strokeWidth: 1.6,
  };

  if (name === "person") {
    return (
      <svg viewBox="0 0 32 32" aria-hidden="true">
        <circle cx="16" cy="10" r="4" {...sharedProps} />
        <path d="M8.5 25c.8-5 3.2-7.5 7.5-7.5s6.7 2.5 7.5 7.5" {...sharedProps} />
        <path d="M5 27h22" {...sharedProps} />
      </svg>
    );
  }

  if (name === "browser") {
    return (
      <svg viewBox="0 0 32 32" aria-hidden="true">
        <rect x="4" y="6" width="24" height="20" rx="3" {...sharedProps} />
        <path d="M4 12h24" {...sharedProps} />
        <path d="M8 9h.1M11.5 9h.1" {...sharedProps} />
        <path d="m12 20 3 2.5 5-6" {...sharedProps} />
      </svg>
    );
  }

  if (name === "core") {
    return (
      <svg viewBox="0 0 32 32" aria-hidden="true">
        <path d="M11 4v4M21 4v4M11 24v4M21 24v4M4 11h4M24 11h4M4 21h4M24 21h4" {...sharedProps} />
        <rect x="8" y="8" width="16" height="16" rx="4" {...sharedProps} />
        <path d="m12 17 3 3 5-7" {...sharedProps} />
      </svg>
    );
  }

  if (name === "database") {
    return (
      <svg viewBox="0 0 32 32" aria-hidden="true">
        <ellipse cx="16" cy="8" rx="10" ry="4" {...sharedProps} />
        <path d="M6 8v8c0 2.2 4.5 4 10 4s10-1.8 10-4V8" {...sharedProps} />
        <path d="M6 16v8c0 2.2 4.5 4 10 4s10-1.8 10-4v-8" {...sharedProps} />
      </svg>
    );
  }

  if (name === "direction") {
    return (
      <svg viewBox="0 0 32 32" aria-hidden="true">
        <circle cx="7" cy="16" r="3" {...sharedProps} />
        <circle cx="25" cy="8" r="3" {...sharedProps} />
        <circle cx="25" cy="24" r="3" {...sharedProps} />
        <path d="M10 16h5c4 0 4-8 7-8M15 16c4 0 4 8 7 8" {...sharedProps} />
      </svg>
    );
  }

  return (
    <svg viewBox="0 0 32 32" aria-hidden="true">
      <path d="M7 15c0-6 3.5-10 9-10s9 4 9 10v3c0 5.5-3.5 9-9 9s-9-3.5-9-9z" {...sharedProps} />
      <circle cx="12.5" cy="15" r="1" fill="currentColor" />
      <circle cx="19.5" cy="15" r="1" fill="currentColor" />
      <path d="M12.5 21c2.2 1.5 4.8 1.5 7 0M3.5 14v5M28.5 14v5" {...sharedProps} />
    </svg>
  );
}

export function ArchitectureSystem({ reducedMotion }: { reducedMotion: boolean }) {
  const [hoveredNodeId, setHoveredNodeId] = useState<ArchitectureNodeId | null>(null);
  const [focusedNodeId, setFocusedNodeId] = useState<ArchitectureNodeId | null>(null);
  const [selectedNodeId, setSelectedNodeId] = useState<ArchitectureNodeId | null>(null);
  const lastPointerTypeRef = useRef<string | null>(null);
  const activeNodeId = hoveredNodeId ?? focusedNodeId ?? selectedNodeId;
  const activeNode = architectureNodes.find((node) => node.id === activeNodeId);
  const connectedNodeIds = activeNodeId
    ? new Set(
        architectureFlows.filter((flow) => flow.nodes.includes(activeNodeId)).flatMap((flow) => flow.nodes)
      )
    : null;

  return (
    <section className={styles.section} aria-labelledby="architecture-system-title">
      <div className={styles.inner}>
        <div className={styles.heading}>
          <motion.div
            initial={false}
            viewport={{ once: true, amount: 0.7 }}
            transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1] }}
            {...(reducedMotion ? {} : { whileInView: { opacity: 1, y: 0 } })}
          >
            <p className={styles.eyebrow}>El sistema en movimiento</p>
            <h2 id="architecture-system-title">
              De una intención
              <br />a una conversación.
            </h2>
          </motion.div>

          <div
            id="architecture-system-readout"
            className={styles.readout}
            aria-live="polite"
            aria-atomic="true"
          >
            <span>{activeNode ? activeNode.technology : "Un recorrido coordinado"}</span>
            <p>
              {activeNode
                ? activeNode.description
                : "Recorré el circuito para ver cómo YUNI coordina una conversación de principio a fin."}
            </p>
          </div>
        </div>

        <div className={styles.stage}>
          <svg
            className={styles.platform}
            viewBox="0 0 1200 560"
            preserveAspectRatio="none"
            aria-hidden="true"
          >
            <defs>
              <linearGradient id="architecture-platform" x1="0" y1="0" x2="1" y2="1">
                <stop offset="0" stopColor="var(--landing-platform-high)" />
                <stop offset="0.48" stopColor="var(--landing-platform-mid)" />
                <stop offset="1" stopColor="var(--landing-platform-low)" />
              </linearGradient>
              <linearGradient id="architecture-platform-front" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0" stopColor="var(--landing-platform-front-high)" />
                <stop offset="1" stopColor="var(--landing-platform-front-low)" />
              </linearGradient>
              <linearGradient id="architecture-platform-side" x1="0" y1="0" x2="1" y2="1">
                <stop offset="0" stopColor="var(--landing-platform-side-high)" />
                <stop offset="1" stopColor="var(--landing-platform-side-low)" />
              </linearGradient>
              <linearGradient id="architecture-rim" x1="0" y1="0" x2="1" y2="0">
                <stop offset="0" stopColor="var(--landing-accent)" stopOpacity="0.55" />
                <stop offset="0.52" stopColor="var(--landing-primary)" stopOpacity="0.32" />
                <stop offset="1" stopColor="var(--landing-coral)" stopOpacity="0.5" />
              </linearGradient>
              <filter id="architecture-glow" x="-30%" y="-30%" width="160%" height="160%">
                <feGaussianBlur stdDeviation="5" />
              </filter>
              <filter id="architecture-shadow" x="-25%" y="-40%" width="150%" height="190%">
                <feGaussianBlur stdDeviation="18" />
              </filter>
              <clipPath id="architecture-platform-clip">
                <path d={platformTopPath} />
              </clipPath>
            </defs>

            <path className={styles.platformShadow} d={platformTopPath} />
            <path className={styles.platformFront} d={platformFrontPath} />
            <path className={styles.platformSide} d={platformSidePath} />
            <path className={styles.platformTop} d={platformTopPath} />
            <path className={styles.platformInner} d={platformInnerPath} />
            <g clipPath="url(#architecture-platform-clip)">
              {platformGridPaths.map((path, index) => (
                <path key={`platform-grid-${index}`} className={styles.platformGrid} d={path} />
              ))}
              {platformCircuitPaths.map((path, index) => (
                <path key={`platform-circuit-${index}`} className={styles.platformCircuit} d={path} />
              ))}
            </g>

            <path className={styles.platformRim} d={platformTopPath} />
            <path className={styles.platformSeam} d={platformSeamPath} />
            <g className={styles.platformBolts}>
              {platformBoltPoints.map((point, index) => {
                const { x, y } = projectCircuitPoint(point);
                return <circle key={`platform-bolt-${index}`} cx={x} cy={y} r="3" />;
              })}
            </g>

            {architectureTracks.map((track, index) => {
              const muted = activeNodeId !== null && !track.nodes.includes(activeNodeId);
              const trackPath = circuitPath(track.points);
              return (
                <g
                  key={track.id}
                  className={`${styles.track} ${toneClass[track.tone]}`}
                  data-track-id={track.id}
                  data-grid-route={track.points.map(([u, v]) => `${u}:${v}`).join("|")}
                  data-muted={muted ? "true" : undefined}
                  data-active={!muted && activeNodeId ? "true" : undefined}
                  style={{ "--track-delay": `${index * -0.72}s` } as CSSProperties}
                >
                  <path className={styles.trackBed} d={trackPath} />
                  <path className={styles.trackEdge} d={trackPath} />
                  <path className={styles.trackLine} d={trackPath} />
                  {track.pulse && !reducedMotion ? (
                    <path className={styles.trackPulse} d={trackPath} pathLength="1" />
                  ) : null}
                  {track.points.slice(1, -1).map((point, pointIndex) => {
                    const gridKey = `${point[0]}:${point[1]}`;
                    if (nodeGridKeys.has(gridKey)) return null;
                    const { x, y } = projectCircuitPoint(point);
                    return (
                      <g key={`${track.id}-via-${pointIndex}`} className={styles.trackVia}>
                        <circle className={styles.trackViaRing} cx={x} cy={y} r="4.2" />
                        <circle className={styles.trackViaCore} cx={x} cy={y} r="1.6" />
                      </g>
                    );
                  })}
                </g>
              );
            })}
          </svg>

          <div className={styles.nodes}>
            {architectureNodes.map((node) => (
              <div
                key={node.id}
                className={styles.nodeSlot}
                data-node-id={node.id}
                data-active={activeNodeId === node.id ? "true" : undefined}
                data-muted={connectedNodeIds !== null && !connectedNodeIds.has(node.id) ? "true" : undefined}
                style={
                  {
                    "--node-y": `${(node.portY / 560) * 100}%`,
                    "--node-x": `${(node.portX / 1200) * 100}%`,
                    "--node-accent": node.accent,
                    "--node-gap": `${node.portGap}px`,
                    "--node-port-x": `${node.portAlign}%`,
                    "--node-shift-x": `${-node.portAlign}%`,
                  } as NodePositionStyle
                }
              >
                <button
                  type="button"
                  className={`${styles.node} ${node.featured ? styles.featuredNode : ""} ${node.compact ? styles.compactNode : ""} ${node.wide ? styles.wideNode : ""}`}
                  aria-controls="architecture-system-readout"
                  aria-pressed={selectedNodeId === node.id}
                  data-active={activeNodeId === node.id ? "true" : undefined}
                  data-muted={
                    connectedNodeIds !== null && !connectedNodeIds.has(node.id) ? "true" : undefined
                  }
                  onPointerDown={(event) => {
                    lastPointerTypeRef.current = event.pointerType;
                    if (event.pointerType === "mouse") event.preventDefault();
                  }}
                  onPointerEnter={(event) => {
                    if (event.pointerType === "mouse") setHoveredNodeId(node.id);
                  }}
                  onPointerLeave={(event) => {
                    if (event.pointerType !== "mouse") return;
                    setHoveredNodeId((currentNodeId) => (currentNodeId === node.id ? null : currentNodeId));
                  }}
                  onPointerCancel={() => {
                    lastPointerTypeRef.current = null;
                  }}
                  onClick={(event) => {
                    const pointerType = lastPointerTypeRef.current;
                    const keyboardOrAssistiveClick = event.detail === 0;
                    lastPointerTypeRef.current = null;

                    if (!keyboardOrAssistiveClick && pointerType === "mouse") return;

                    setSelectedNodeId((currentNodeId) => (currentNodeId === node.id ? null : node.id));
                    if (pointerType === "touch" || pointerType === "pen") event.currentTarget.blur();
                  }}
                  onKeyDown={() => {
                    lastPointerTypeRef.current = null;
                  }}
                  onFocus={() => setFocusedNodeId(node.id)}
                  onBlur={() =>
                    setFocusedNodeId((currentNodeId) => (currentNodeId === node.id ? null : currentNodeId))
                  }
                >
                  <span className={styles.nodeIcon}>
                    <ArchitectureIcon name={node.icon} />
                  </span>
                  <span className={styles.nodeCopy}>
                    <strong>{node.title}</strong>
                    <small>{node.technology}</small>
                    <span className={styles.mobileDescription}>{node.description}</span>
                  </span>
                  <span
                    className={styles.nodePort}
                    data-node-port={node.id}
                    data-port-grid={`${node.grid[0]}:${node.grid[1]}`}
                    data-port-x={node.portX}
                    data-port-y={node.portY}
                    aria-hidden="true"
                  />
                </button>
              </div>
            ))}
          </div>
        </div>

        <div className={styles.legend} aria-hidden="true">
          <span className={styles.control}>Interacción y control</span>
          <span className={styles.knowledge}>Orquestación grupal</span>
          <span className={styles.conversation}>Conversación en vivo</span>
        </div>

        <div className={styles.semanticSummary}>
          <p>
            El usuario se comunica con la aplicación web; el núcleo de YUNI coordina los datos, la
            conversación en vivo y, cuando corresponde, los turnos grupales.
          </p>
          <ol>
            {architectureFlows.map((flow) => (
              <li key={flow.id}>{flow.label}</li>
            ))}
          </ol>
        </div>
      </div>
    </section>
  );
}
