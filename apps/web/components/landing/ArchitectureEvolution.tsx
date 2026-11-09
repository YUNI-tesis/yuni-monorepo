"use client";

import { motion } from "motion/react";
import React, { useEffect, useRef, useState, type CSSProperties } from "react";
import {
  evolutionCriterion,
  evolutionLinkKinds,
  evolutionStages,
  evolutionZones,
  type EvolutionEdge,
  type EvolutionNode,
  type EvolutionStage,
  type EvolutionZone,
} from "./evolution-content";
import styles from "./ArchitectureEvolution.module.css";

const STAGE_COUNT = evolutionStages.length;
const COUNT_WORDS: Record<number, string> = { 5: "Cinco", 6: "Seis", 7: "Siete", 8: "Ocho", 9: "Nueve" };

/** Horizontal centre of each zone, as a percentage of the diagram width. */
const ZONE_X: Record<EvolutionZone, number> = { browser: 17, yuni: 50, providers: 83 };
/** SVG units of the connection layer; it is stretched to the diagram box. */
const VIEW_WIDTH = 1000;
const VIEW_HEIGHT = 440;

export function formatStageNumber(value: number) {
  return String(value).padStart(2, "0");
}

export function nodePosition(node: Pick<EvolutionNode, "zone" | "row">) {
  return { x: ZONE_X[node.zone], y: 22 + node.row * 30 };
}

export function connectionPath(from: EvolutionNode, to: EvolutionNode, route?: EvolutionEdge["route"]) {
  const a = nodePosition(from);
  const b = nodePosition(to);
  const x1 = (a.x / 100) * VIEW_WIDTH;
  const y1 = (a.y / 100) * VIEW_HEIGHT;
  const x2 = (b.x / 100) * VIEW_WIDTH;
  const y2 = (b.y / 100) * VIEW_HEIGHT;

  if (route === "outside") {
    const bend = 0.2 * VIEW_WIDTH;
    return `M ${x1} ${y1} C ${x1 + bend} ${y1}, ${x2 + bend} ${y2}, ${x2} ${y2}`;
  }
  if (x1 === x2) {
    return `M ${x1} ${y1} C ${x1} ${y1}, ${x2} ${y2}, ${x2} ${y2}`;
  }
  if (route === "vertical") {
    return `M ${x1} ${y1} C ${x1} ${y2}, ${x1} ${y2}, ${x2} ${y2}`;
  }
  const middle = (x1 + x2) / 2;
  return `M ${x1} ${y1} C ${middle} ${y1}, ${middle} ${y2}, ${x2} ${y2}`;
}

export function describeDiagram(stage: EvolutionStage) {
  const byId = new Map(stage.nodes.map((node) => [node.id, node]));
  const zones = evolutionZones
    .map((zone) => {
      const nodes = stage.nodes.filter((node) => node.zone === zone.id);
      if (nodes.length === 0) return null;
      const list = nodes
        .map((node) => `${node.title}${node.isNew ? " (nuevo)" : ""}: ${node.detail}`)
        .join("; ");
      return `${zone.label}: ${list}.`;
    })
    .filter(Boolean)
    .join(" ");
  const links = stage.edges
    .map((edge) => {
      const from = byId.get(edge.from)?.title ?? edge.from;
      const to = byId.get(edge.to)?.title ?? edge.to;
      return `${from} ${edge.bidirectional ? "con" : "hacia"} ${to}, ${edge.label}`;
    })
    .join("; ");
  const retired = stage.retired?.length ? ` Ya no se usan: ${stage.retired.join(" y ")}.` : "";
  return `${stage.diagramLabel}. ${zones} Conexiones: ${links}.${retired}`;
}

function Arrow({ back = false }: { back?: boolean }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" style={back ? { transform: "rotate(180deg)" } : undefined}>
      <path
        d="M5 12h14m-6-6 6 6-6 6"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function EvolutionDiagram({
  stage,
  index,
  reducedMotion,
}: {
  stage: EvolutionStage;
  index: number;
  reducedMotion: boolean;
}) {
  const byId = new Map(stage.nodes.map((node) => [node.id, node]));

  return (
    <figure className={styles.figure}>
      <div className={styles.diagramTopline} aria-hidden="true">
        <span>{stage.diagramLabel}</span>
        <span>
          {formatStageNumber(index + 1)} / {formatStageNumber(STAGE_COUNT)}
        </span>
      </div>
      <div className={styles.diagram} role="img" aria-label={describeDiagram(stage)}>
        {evolutionZones.map((zone) => (
          <div
            key={zone.id}
            className={styles.zone}
            data-zone={zone.id}
            style={{ "--zone-x": `${ZONE_X[zone.id]}%` } as CSSProperties}
            aria-hidden="true"
          >
            <span className={styles.zoneLabel}>{zone.label}</span>
            <span className={styles.zoneShortLabel}>{zone.shortLabel}</span>
          </div>
        ))}
        <svg
          className={styles.connections}
          viewBox={`0 0 ${VIEW_WIDTH} ${VIEW_HEIGHT}`}
          preserveAspectRatio="none"
          aria-hidden="true"
        >
          {stage.edges.map((edge) => {
            const from = byId.get(edge.from);
            const to = byId.get(edge.to);
            if (!from || !to) return null;
            const d = connectionPath(from, to, edge.route);
            return (
              <motion.path
                key={`${edge.from}-${edge.to}-${edge.kind}`}
                data-kind={edge.kind}
                d={d}
                initial={false}
                animate={{ d }}
                transition={{ duration: reducedMotion ? 0 : 0.65, ease: [0.16, 1, 0.3, 1] }}
                className={styles[edge.kind]}
                vectorEffect="non-scaling-stroke"
              />
            );
          })}
        </svg>
        {stage.nodes.map((node) => {
          const position = nodePosition(node);
          return (
            <div
              key={node.id}
              className={styles.node}
              data-zone={node.zone}
              data-new={node.isNew ? "true" : undefined}
              style={{ "--node-x": `${position.x}%`, "--node-y": `${position.y}%` } as CSSProperties}
              aria-hidden="true"
            >
              {node.isNew ? <em className={styles.badge}>nuevo</em> : null}
              <strong>{node.title}</strong>
              <small>{node.detail}</small>
            </div>
          );
        })}
      </div>
      <p className={styles.retired} aria-hidden="true">
        {stage.retired?.length ? (
          <>
            <span>Ya no se usan</span>
            {stage.retired.map((item) => (
              <s key={item}>{item}</s>
            ))}
          </>
        ) : null}
      </p>
      <figcaption>{stage.diagramCaption}</figcaption>
      <div className={styles.legend} aria-hidden="true">
        {evolutionLinkKinds.map((kind) => (
          <span key={kind.id} className={styles[kind.id]}>
            {kind.label}
          </span>
        ))}
        <span className={styles.legendNew}>
          <em className={styles.badge}>nuevo</em> se suma en esta etapa
        </span>
      </div>
    </figure>
  );
}

export function ArchitectureEvolution({
  reducedMotion,
  scrollToPosition,
}: {
  reducedMotion: boolean;
  scrollToPosition?: (top: number) => void;
}) {
  const [activeIndex, setActiveIndex] = useState(0);
  const [scrollEnabled, setScrollEnabled] = useState(false);
  const trackRef = useRef<HTMLDivElement>(null);
  const stickyRef = useRef<HTMLDivElement>(null);
  const indexRef = useRef(0);
  const stage = evolutionStages[activeIndex]!;

  useEffect(() => {
    if (reducedMotion) {
      setScrollEnabled(false);
      return;
    }

    let enabled = false;
    let frame = 0;
    const update = () => {
      frame = 0;
      const track = trackRef.current;
      const sticky = stickyRef.current;
      if (!enabled || !track || !sticky) return;

      const top = parseFloat(getComputedStyle(sticky).top) || 0;
      const distance = track.offsetHeight - sticky.offsetHeight;
      if (distance <= 0) return;
      const progress = Math.max(0, Math.min(1, (top - track.getBoundingClientRect().top) / distance));
      const next = Math.min(STAGE_COUNT - 1, Math.floor(progress * STAGE_COUNT));
      if (next !== indexRef.current) {
        indexRef.current = next;
        setActiveIndex(next);
      }
    };
    const schedule = () => {
      if (!frame) frame = requestAnimationFrame(update);
    };
    const measure = () => {
      if (!trackRef.current) return;
      // CSS owns the viewport constraints so the sticky layout and scroll math agree.
      enabled =
        getComputedStyle(trackRef.current).getPropertyValue("--evolution-scroll-enabled").trim() === "1";
      setScrollEnabled(enabled);
      schedule();
    };

    measure();
    window.addEventListener("scroll", schedule, { passive: true });
    window.addEventListener("resize", measure);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("scroll", schedule);
      window.removeEventListener("resize", measure);
    };
  }, [reducedMotion]);

  const selectStage = (index: number) => {
    const track = trackRef.current;
    const sticky = stickyRef.current;
    if (!scrollEnabled || !track || !sticky) {
      indexRef.current = index;
      setActiveIndex(index);
      return;
    }

    const top = parseFloat(getComputedStyle(sticky).top) || 0;
    const distance = track.offsetHeight - sticky.offsetHeight;
    const target =
      window.scrollY + track.getBoundingClientRect().top - top + ((index + 0.25) / STAGE_COUNT) * distance;
    if (scrollToPosition) scrollToPosition(target);
    else window.scrollTo({ top: target, behavior: "smooth" });
  };

  const countWord = COUNT_WORDS[STAGE_COUNT] ?? String(STAGE_COUNT);

  return (
    <section
      id="evolucion"
      className={styles.section}
      aria-labelledby="evolution-title"
      data-reduced-motion={reducedMotion}
      style={{ "--stage-count": STAGE_COUNT } as CSSProperties}
    >
      <div className={styles.heading}>
        <div>
          <p className={styles.eyebrow}>Evolución de la arquitectura</p>
          <h3 id="evolution-title">
            De la primera voz a <span>una conversación compartida.</span>
          </h3>
        </div>
        <div className={styles.introduction}>
          <span>Enero — septiembre 2026</span>
          <p>
            La arquitectura no se diseñó completa desde el inicio. Pasó por {countWord.toLowerCase()} etapas,
            cada una motivada por una limitación de la anterior.
          </p>
        </div>
      </div>

      <div ref={trackRef} className={styles.scrollTrack} data-scroll={scrollEnabled}>
        <div ref={stickyRef} className={styles.sticky}>
          <ol className={styles.timeline} aria-label="Etapas de la evolución de YUNI">
            {evolutionStages.map((item, index) => (
              <li key={item.id}>
                <button
                  type="button"
                  className={styles.milestone}
                  aria-label={`${item.date}: ${item.name}`}
                  aria-pressed={index === activeIndex}
                  aria-controls="evolution-detail"
                  onClick={() => selectStage(index)}
                >
                  <span className={styles.milestoneMarker} aria-hidden="true">
                    {formatStageNumber(index + 1)}
                  </span>
                  <span className={styles.milestoneDate}>{item.date}</span>
                  <span className={styles.milestoneTitle}>{item.shortTitle}</span>
                </button>
              </li>
            ))}
          </ol>

          <div
            id="evolution-detail"
            className={styles.detail}
            role="region"
            aria-label="Detalle de la etapa"
            aria-live="polite"
            aria-atomic="true"
          >
            <EvolutionDiagram stage={stage} index={activeIndex} reducedMotion={reducedMotion} />
            <div className={styles.story} key={stage.id}>
              <p className={styles.stageDate}>
                Etapa {formatStageNumber(activeIndex + 1)} <span /> {stage.date}
              </p>
              <h4>{stage.name}</h4>
              <p className={styles.question}>{stage.question}</p>
              <p className={styles.decision}>{stage.decision}</p>
              <div className={styles.learning}>
                <span>Lo que aprendimos</span>
                <p>{stage.learning}</p>
              </div>
              <p className={styles.shift}>
                <Arrow />
                {stage.shift}
              </p>
            </div>
          </div>

          <div className={styles.footer}>
            {scrollEnabled ? (
              <p className={styles.scrollHint}>
                <span aria-hidden="true">↓</span> Scrolleá para recorrer la evolución
              </p>
            ) : (
              <p>
                {countWord} etapas de una misma búsqueda.
                <br />
                <span>De enero a septiembre de 2026.</span>
              </p>
            )}
            <div className={styles.controls} aria-label="Recorrer la evolución">
              <button
                type="button"
                aria-label="Etapa anterior"
                disabled={activeIndex === 0}
                onClick={() => selectStage(activeIndex - 1)}
              >
                <Arrow back />
              </button>
              <span>
                {formatStageNumber(activeIndex + 1)} <span>/ {formatStageNumber(STAGE_COUNT)}</span>
              </span>
              <button
                type="button"
                aria-label="Etapa siguiente"
                disabled={activeIndex === STAGE_COUNT - 1}
                onClick={() => selectStage(activeIndex + 1)}
              >
                <Arrow />
              </button>
            </div>
          </div>
        </div>
      </div>

      <div className={styles.criterion}>
        <span>El criterio que se repite</span>
        <p>{evolutionCriterion}</p>
      </div>
    </section>
  );
}
