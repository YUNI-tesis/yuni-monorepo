"use client";

import Lenis from "lenis";
import { motion, useReducedMotion, useScroll, useSpring, useTransform, type MotionValue } from "motion/react";
import dynamic from "next/dynamic";
import Link from "next/link";
import React, {
  useEffect,
  useRef,
  type CSSProperties,
  type MouseEvent as ReactMouseEvent,
  type ReactNode,
} from "react";
import { YuniLogo } from "../brand/YuniLogo";
import { ArchitectureSystem } from "./ArchitectureSystem";
import { architectureLayers, capabilities, presenceStages, productMoments } from "./content";
import { CapabilityIcon } from "./CapabilityIcon";
import styles from "./Landing.module.css";
import { LivingYuniLogo } from "./LivingYuniLogo";
import { SpotlightCard } from "./SpotlightCard";

const Threads = dynamic(() => import("./Threads").then((module) => module.Threads), {
  ssr: false,
  loading: () => <div className={styles.threadPlaceholder} aria-hidden="true" />,
});

const navigation = [
  { label: "Idea", href: "#idea" },
  { label: "Experiencia", href: "#experiencia" },
  { label: "Arquitectura", href: "#arquitectura" },
  { label: "Tesis", href: "#tesis" },
] as const;

type RevealProps = {
  children: ReactNode;
  className?: string | undefined;
  delay?: number;
  reducedMotion: boolean;
};

function Reveal({ children, className = "", delay = 0, reducedMotion }: RevealProps) {
  return (
    <motion.div
      className={className}
      initial={reducedMotion ? false : { opacity: 0, y: 44 }}
      viewport={{ once: true, margin: "-12% 0px -8%" }}
      transition={{ duration: 0.9, delay, ease: [0.16, 1, 0.3, 1] }}
      {...(reducedMotion ? {} : { whileInView: { opacity: 1, y: 0 } })}
    >
      {children}
    </motion.div>
  );
}

function ArrowIcon() {
  return (
    <svg viewBox="0 0 20 20" aria-hidden="true">
      <path d="M4 10h11M11 5l5 5-5 5" fill="none" stroke="currentColor" strokeLinecap="round" />
    </svg>
  );
}

function MarkIcon() {
  return (
    <svg viewBox="0 0 20 20" aria-hidden="true">
      <path d="m4.5 10.5 3.2 3.1 7.8-8" fill="none" stroke="currentColor" strokeLinecap="round" />
    </svg>
  );
}

function useSmoothScroll(disabled: boolean) {
  useEffect(() => {
    const coarsePointer = window.matchMedia("(pointer: coarse)");
    if (disabled || coarsePointer.matches) return;

    const lenis = new Lenis({
      duration: 1.05,
      smoothWheel: true,
      syncTouch: false,
      wheelMultiplier: 0.92,
    });
    let frameId = 0;
    const frame = (time: number) => {
      lenis.raf(time);
      frameId = requestAnimationFrame(frame);
    };
    frameId = requestAnimationFrame(frame);

    return () => {
      cancelAnimationFrame(frameId);
      lenis.destroy();
    };
  }, [disabled]);
}

function ProductScene({ type }: { type: (typeof productMoments)[number]["scene"] }) {
  if (type === "builder") {
    return (
      <div className={`${styles.productScene} ${styles.builderScene}`} aria-hidden="true">
        <div className={styles.sceneTopline}>
          <span>Identidad del avatar</span>
          <span>01 / 05</span>
        </div>
        <div className={styles.avatarComposer}>
          <div className={styles.avatarMiniature}>
            <YuniLogo />
          </div>
          <div className={styles.composerFields}>
            <span className={styles.fieldLabel}>Propósito</span>
            <span className={styles.fieldValue}>Mentor de aprendizaje</span>
            <span className={styles.fieldLabel}>Personalidad</span>
            <span className={styles.pillRow}>
              <i>Curiosa</i>
              <i>Clara</i>
              <i>Cercana</i>
            </span>
          </div>
        </div>
        <div className={styles.sceneProgress}>
          <span />
        </div>
      </div>
    );
  }

  if (type === "share") {
    return (
      <div className={`${styles.productScene} ${styles.shareScene}`} aria-hidden="true">
        <div className={styles.sceneTopline}>
          <span>Compartir presencia</span>
          <span className={styles.liveDot}>Activo</span>
        </div>
        <div className={styles.linkPreview}>
          <span>yuni.ai/a/mentor-luna</span>
          <span>Copiar</span>
        </div>
        <div className={styles.accessList}>
          <div>
            <span className={styles.personInitial}>MA</span>
            <p>
              <strong>Martina Acosta</strong>
              <small>Acceso personal</small>
            </p>
            <MarkIcon />
          </div>
          <div>
            <span className={styles.personInitial}>JL</span>
            <p>
              <strong>Julián López</strong>
              <small>Invitación enviada</small>
            </p>
            <span className={styles.pendingMark} />
          </div>
        </div>
      </div>
    );
  }

  if (type === "voice") {
    return (
      <div className={`${styles.productScene} ${styles.voiceScene}`} aria-hidden="true">
        <div className={styles.callStatus}>
          <span className={styles.livePulse} />
          Conversación en vivo
        </div>
        <div className={styles.callAvatar}>
          <span className={styles.callRing} />
          <LivingYuniLogo className={styles.callCreature} interactive={false} mood="awake" />
        </div>
        <div className={styles.waveform}>
          {Array.from({ length: 22 }, (_, index) => (
            <i key={index} style={{ "--bar": `${(index % 7) + 2}` } as CSSProperties} />
          ))}
        </div>
        <div className={styles.callFooter}>
          <span>02:14</span>
          <span>Escuchando</span>
        </div>
      </div>
    );
  }

  return (
    <div className={`${styles.productScene} ${styles.insightScene}`} aria-hidden="true">
      <div className={styles.sceneTopline}>
        <span>Actividad</span>
        <span>Últimos 30 días</span>
      </div>
      <div className={styles.metricLine}>
        <div>
          <small>Conversaciones</small>
          <strong>128</strong>
        </div>
        <div>
          <small>Recurrencia</small>
          <strong>64%</strong>
        </div>
      </div>
      <div className={styles.miniChart}>
        {[38, 52, 44, 66, 58, 78, 68, 88, 76, 92].map((height, index) => (
          <span key={index}>
            <i style={{ height: `${height}%` }} />
          </span>
        ))}
      </div>
      <div className={styles.chartLegend}>
        <span>Semana 1</span>
        <span>Hoy</span>
      </div>
    </div>
  );
}

function PresenceVisual({
  progress,
  reducedMotion,
}: {
  progress: MotionValue<number>;
  reducedMotion: boolean;
}) {
  const scale = useTransform(progress, [0, 0.36, 0.72, 1], [0.82, 0.94, 1.05, 1.13]);
  const rotate = useTransform(progress, [0, 1], [-6, 5]);
  const glow = useTransform(
    progress,
    [0, 0.45, 1],
    ["0 0 38px rgba(190,106,220,0.16)", "0 0 86px rgba(190,106,220,0.34)", "0 0 118px rgba(100,195,215,0.38)"]
  );
  const threadOpacity = useTransform(progress, [0, 0.35, 0.78, 1], [0.15, 0.48, 0.86, 1]);

  return (
    <div className={styles.presenceVisual} aria-hidden="true">
      <motion.div
        className={styles.presenceThreads}
        style={{ opacity: reducedMotion ? 0.55 : threadOpacity }}
      >
        <Threads amplitude={0.1} enableMouseInteraction={false} />
      </motion.div>
      <span className={`${styles.orbit} ${styles.orbitOne}`} />
      <span className={`${styles.orbit} ${styles.orbitTwo}`} />
      <span className={`${styles.orbit} ${styles.orbitThree}`} />
      <span className={`${styles.signalNode} ${styles.nodeOne}`} />
      <span className={`${styles.signalNode} ${styles.nodeTwo}`} />
      <span className={`${styles.signalNode} ${styles.nodeThree}`} />
      <motion.div
        className={styles.presenceLogo}
        {...(reducedMotion ? {} : { style: { scale, rotate, boxShadow: glow } })}
      >
        <LivingYuniLogo className={styles.presenceCreature} dragEnabled mood="awake" />
      </motion.div>
      <div className={styles.voiceBars}>
        {Array.from({ length: 28 }, (_, index) => (
          <i key={index} />
        ))}
      </div>
    </div>
  );
}

function ThesisConvergence({ reducedMotion }: { reducedMotion: boolean }) {
  const lineMotion = reducedMotion
    ? {}
    : {
        initial: { pathLength: 0, opacity: 0 },
        whileInView: { pathLength: 1, opacity: 1 },
        viewport: { once: true, amount: 0.55 },
        transition: { duration: 1.2, ease: [0.16, 1, 0.3, 1] as const },
      };

  return (
    <div className={styles.thesisConvergence}>
      <div className={styles.convergenceAuthors} aria-label="Autores de la tesis">
        <p>Una tesis de</p>
        <article className={styles.convergenceAuthorLucas}>
          <span aria-hidden="true" />
          <h3>Lucas Lovaglio</h3>
        </article>
        <article className={styles.convergenceAuthorSantiago}>
          <span aria-hidden="true" />
          <h3>Santiago Peres</h3>
        </article>
      </div>

      <svg
        className={styles.convergenceLines}
        viewBox="0 0 760 460"
        preserveAspectRatio="none"
        aria-hidden="true"
      >
        <defs>
          <linearGradient id="thesis-lucas" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0" stopColor="#71d0de" stopOpacity="0.24" />
            <stop offset="0.72" stopColor="#71d0de" />
            <stop offset="1" stopColor="#c776e4" />
          </linearGradient>
          <linearGradient id="thesis-santiago" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0" stopColor="#f09a87" stopOpacity="0.24" />
            <stop offset="0.72" stopColor="#f09a87" />
            <stop offset="1" stopColor="#c776e4" />
          </linearGradient>
          <filter id="thesis-glow" x="-20%" y="-80%" width="140%" height="260%">
            <feGaussianBlur stdDeviation="7" />
          </filter>
        </defs>

        <path
          className={styles.convergenceGuide}
          d="M150 135 C340 135 350 220 536 230 C586 233 616 230 660 230"
        />
        <path
          className={styles.convergenceGuide}
          d="M150 330 C340 330 350 244 536 230 C586 226 616 230 660 230"
        />
        <path
          className={`${styles.convergenceGlow} ${styles.convergenceGlowLucas}`}
          d="M150 135 C340 135 350 220 536 230 C586 233 616 230 660 230"
        />
        <path
          className={`${styles.convergenceGlow} ${styles.convergenceGlowSantiago}`}
          d="M150 330 C340 330 350 244 536 230 C586 226 616 230 660 230"
        />
        <motion.path
          className={`${styles.convergenceLine} ${styles.convergenceLineLucas}`}
          d="M150 135 C340 135 350 220 536 230 C586 233 616 230 660 230"
          {...lineMotion}
        />
        <motion.path
          className={`${styles.convergenceLine} ${styles.convergenceLineSantiago}`}
          d="M150 330 C340 330 350 244 536 230 C586 226 616 230 660 230"
          {...lineMotion}
        />
      </svg>

      <span className={`${styles.convergenceSignal} ${styles.convergenceSignalOne}`} aria-hidden="true" />
      <span className={`${styles.convergenceSignal} ${styles.convergenceSignalTwo}`} aria-hidden="true" />
      <span className={styles.convergenceMeeting} aria-hidden="true" />

      <div className={styles.convergenceCore} aria-hidden="true">
        <span />
        <LivingYuniLogo className={styles.convergenceCreature} dragEnabled mood="awake" />
        <strong>YUNI</strong>
      </div>
    </div>
  );
}

function FinalSignal() {
  return (
    <div className={styles.finalSignal} aria-hidden="true">
      <div className={styles.finalSignalFrame}>
        <span className={`${styles.finalSignalCorner} ${styles.finalSignalCornerTopLeft}`} />
        <span className={`${styles.finalSignalCorner} ${styles.finalSignalCornerTopRight}`} />
        <span className={`${styles.finalSignalCorner} ${styles.finalSignalCornerBottomLeft}`} />
        <span className={`${styles.finalSignalCorner} ${styles.finalSignalCornerBottomRight}`} />
      </div>
      <div className={styles.finalSignalHorizon}>
        <span className={styles.finalSignalLabel}>Señal en vivo</span>
        <span className={styles.finalSignalStatus}>Lista para conversar</span>
        <span className={styles.finalSignalAxis} />
        <div className={styles.finalSignalWave}>
          {Array.from({ length: 64 }, (_, index) => {
            const height = 18 + ((index * 17 + index * index * 7) % 70);
            return (
              <i
                key={index}
                style={
                  {
                    "--final-bar-height": `${height}%`,
                    "--final-bar-delay": `${index * -0.071}s`,
                  } as CSSProperties
                }
              />
            );
          })}
        </div>
      </div>
    </div>
  );
}

export function LandingExperience() {
  const reducedMotion = useReducedMotion() ?? false;
  const presenceRef = useRef<HTMLDivElement>(null);
  const { scrollYProgress: pageProgress } = useScroll();
  const { scrollYProgress: presenceProgress } = useScroll({
    target: presenceRef,
    offset: ["start start", "end end"],
  });
  const smoothProgress = useSpring(pageProgress, { stiffness: 120, damping: 24, mass: 0.18 });

  useSmoothScroll(reducedMotion);

  const scrollToAnchor = (event: ReactMouseEvent<HTMLAnchorElement>, href: string) => {
    if (!href.startsWith("#")) return;
    const target = document.querySelector(href);
    if (!target) return;
    event.preventDefault();
    target.scrollIntoView({ behavior: reducedMotion ? "auto" : "smooth", block: "start" });
  };

  return (
    <div className={styles.root}>
      <a className={styles.skipLink} href="#contenido">
        Saltar al contenido
      </a>

      <header className={styles.header}>
        <div className={styles.headerInner}>
          <Link className={styles.brand} href="/" aria-label="YUNI, inicio">
            <YuniLogo />
            <span>YUNI</span>
          </Link>
          <nav className={styles.nav} aria-label="Secciones de la presentación">
            {navigation.map((item) => (
              <a key={item.href} href={item.href} onClick={(event) => scrollToAnchor(event, item.href)}>
                {item.label}
              </a>
            ))}
          </nav>
          <Link className={`${styles.button} ${styles.headerCta}`} href="/dashboard" prefetch={false}>
            Explorar demo
            <ArrowIcon />
          </Link>
        </div>
        <motion.span className={styles.readingProgress} style={{ scaleX: smoothProgress }} />
      </header>

      <main id="contenido">
        <section className={styles.hero} aria-labelledby="hero-title">
          <Threads />
          <div className={styles.heroGrain} aria-hidden="true" />
          <div className={styles.heroHalo} aria-hidden="true">
            <span />
            <LivingYuniLogo className={styles.heroCreature} interactive={false} />
          </div>
          <div className={styles.heroGrid}>
            <motion.p
              className={styles.heroEyebrow}
              initial={reducedMotion ? false : { opacity: 0, y: 18 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.65, delay: 0.1, ease: [0.16, 1, 0.3, 1] }}
            >
              Tesis de grado <span /> YUNI · 2026
            </motion.p>
            <h1 id="hero-title" className={styles.heroTitle}>
              <motion.span
                initial={reducedMotion ? false : { y: "115%" }}
                animate={{ y: 0 }}
                transition={{ duration: 1, delay: 0.18, ease: [0.16, 1, 0.3, 1] }}
              >
                La IA deja de
              </motion.span>
              <motion.span
                initial={reducedMotion ? false : { y: "115%" }}
                animate={{ y: 0 }}
                transition={{ duration: 1, delay: 0.28, ease: [0.16, 1, 0.3, 1] }}
              >
                ser una ventana.
              </motion.span>
              <motion.span
                className={styles.heroAccent}
                initial={reducedMotion ? false : { y: "115%" }}
                animate={{ y: 0 }}
                transition={{ duration: 1, delay: 0.38, ease: [0.16, 1, 0.3, 1] }}
              >
                Se convierte en presencia.
              </motion.span>
            </h1>
            <motion.div
              className={styles.heroFooter}
              initial={reducedMotion ? false : { opacity: 0, y: 24 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.8, delay: 0.72, ease: [0.16, 1, 0.3, 1] }}
            >
              <p>
                YUNI es una plataforma para crear avatares de IA con identidad, contexto y voz; compartirlos y
                comprender cada interacción.
              </p>
            </motion.div>
            <motion.div
              className={styles.scrollCue}
              initial={reducedMotion ? false : { opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.7, delay: 1.1 }}
              aria-hidden="true"
            >
              <span>Scroll para entrar</span>
              <i />
            </motion.div>
          </div>
        </section>

        <section id="idea" className={styles.problemSection} aria-labelledby="problem-title">
          <div className={styles.sectionGrid}>
            <Reveal className={styles.problemContent} delay={0.08} reducedMotion={reducedMotion}>
              <p className={styles.eyebrow}>La oportunidad</p>
              <h2 id="problem-title" aria-label="Conversar no alcanza.">
                <span>Conversar</span>
                <span className={styles.problemAccent}>no alcanza.</span>
              </h2>
            </Reveal>
            <div className={styles.problemLower}>
              <Reveal className={styles.problemLead} delay={0.12} reducedMotion={reducedMotion}>
                <p>
                  La inteligencia artificial ya sabe responder. El desafío es lograr que también pueda
                  representar una identidad, sostener su contexto y construir una relación.
                </p>
              </Reveal>
              <Reveal className={styles.problemAside} delay={0.16} reducedMotion={reducedMotion}>
                <span className={styles.quoteMark}>“</span>
                <p>¿Qué cambia cuando una respuesta tiene una voz, un rostro y una memoria compartida?</p>
                <small>La pregunta que guía YUNI</small>
              </Reveal>
            </div>
          </div>
        </section>

        <section
          id="experiencia"
          ref={presenceRef}
          className={styles.presenceSection}
          aria-labelledby="presence-title"
        >
          <div className={styles.presenceSticky}>
            <div className={styles.presenceIntro}>
              <p className={styles.eyebrow}>El sistema cobra vida</p>
              <h2 id="presence-title">
                De una idea
                <br />a una experiencia.
              </h2>
              <p>Cuatro decisiones convierten una configuración en alguien con quien encontrarse.</p>
            </div>
            <PresenceVisual progress={presenceProgress} reducedMotion={reducedMotion} />
          </div>
          <div className={styles.stageList}>
            {presenceStages.map((stage) => (
              <motion.article
                key={stage.number}
                className={styles.stage}
                initial={reducedMotion ? false : { opacity: 0.28, y: 30 }}
                viewport={{ amount: 0.65 }}
                transition={{ duration: 0.72, ease: [0.16, 1, 0.3, 1] }}
                {...(reducedMotion ? {} : { whileInView: { opacity: 1, y: 0 } })}
              >
                <span>{stage.number}</span>
                <p>{stage.eyebrow}</p>
                <h3>{stage.title}</h3>
                <div />
                <p>{stage.description}</p>
              </motion.article>
            ))}
          </div>
        </section>

        <section className={styles.productSection} aria-labelledby="product-title">
          <div className={styles.sectionHeading}>
            <Reveal reducedMotion={reducedMotion}>
              <p className={styles.eyebrow}>La experiencia completa</p>
              <h2 id="product-title" aria-label="Creá. Compartí. Conversá. Comprendé.">
                <span>Creá.</span>
                <span>Compartí.</span>
                <span>Conversá.</span>
                <span>Comprendé.</span>
              </h2>
            </Reveal>
          </div>

          <div className={styles.productMoments}>
            {productMoments.map((moment, index) => (
              <Reveal
                key={moment.number}
                className={`${styles.productMoment} ${index % 2 ? styles.productMomentReverse : ""}`}
                reducedMotion={reducedMotion}
              >
                <div className={styles.productCopy}>
                  <span className={styles.momentNumber}>{moment.number}</span>
                  <p className={styles.eyebrow}>{moment.action}</p>
                  <h3>{moment.title}</h3>
                  <p>{moment.description}</p>
                </div>
                <ProductScene type={moment.scene} />
              </Reveal>
            ))}
          </div>
        </section>

        <section
          id="arquitectura"
          className={styles.architectureSection}
          aria-labelledby="architecture-title"
        >
          <div className={styles.architectureHeading}>
            <Reveal className={styles.architectureTitle} delay={0.08} reducedMotion={reducedMotion}>
              <p className={styles.eyebrow}>Arquitectura del producto</p>
              <h2 id="architecture-title">
                Detrás de cada conversación,
                <br />
                YUNI coordina un sistema completo.
              </h2>
            </Reveal>
          </div>

          <div className={styles.architectureDiagram}>
            <div className={styles.architectureSignal} aria-hidden="true">
              <span />
            </div>
            {architectureLayers.map((layer, index) => (
              <Reveal key={layer.number} delay={index * 0.07} reducedMotion={reducedMotion}>
                <article className={styles.architectureLayer}>
                  <span>{layer.number}</span>
                  <div>
                    <h3>{layer.title}</h3>
                    <p>{layer.description}</p>
                  </div>
                  <ul aria-label={`Tecnologías de ${layer.title}`}>
                    {layer.tags.map((tag) => (
                      <li key={tag}>{tag}</li>
                    ))}
                  </ul>
                </article>
              </Reveal>
            ))}
          </div>
        </section>

        <ArchitectureSystem reducedMotion={reducedMotion} />

        <section className={styles.capabilitySection} aria-labelledby="capability-title">
          <div className={styles.capabilityHeading}>
            <Reveal reducedMotion={reducedMotion}>
              <p className={styles.eyebrow}>La visión</p>
              <h2 id="capability-title">
                <span>Una plataforma.</span>
                <span>Muchas formas de conectar.</span>
              </h2>
            </Reveal>
          </div>

          <div className={styles.capabilityGrid}>
            {capabilities.map((capability, index) => (
              <Reveal key={capability.number} delay={(index % 4) * 0.05} reducedMotion={reducedMotion}>
                <SpotlightCard
                  className={styles.capabilityCard}
                  spotlightColor={index % 2 ? "rgba(100, 195, 215, 0.18)" : "rgba(190, 106, 220, 0.2)"}
                >
                  <div className={styles.capabilityCardHeader}>
                    <span className={styles.capabilityIcon}>
                      <CapabilityIcon name={capability.icon} />
                    </span>
                    <span className={styles.capabilityNumber}>{capability.number}</span>
                  </div>
                  <h3>{capability.title}</h3>
                  <p>{capability.description}</p>
                </SpotlightCard>
              </Reveal>
            ))}
          </div>
        </section>

        <section id="tesis" className={styles.thesisSection} aria-labelledby="thesis-title">
          <div className={styles.thesisInner}>
            <Reveal className={styles.thesisMeta} reducedMotion={reducedMotion}>
              <span>Proyecto final</span>
              <span>2026</span>
            </Reveal>
            <div className={styles.thesisStage}>
              <Reveal className={styles.thesisTitle} delay={0.06} reducedMotion={reducedMotion}>
                <p className={styles.eyebrow}>La tesis detrás del producto</p>
                <h2 id="thesis-title">
                  Dos autores.
                  <br />
                  Una pregunta.
                </h2>
                <p className={styles.thesisQuestion}>¿Qué hace que una IA se sienta viva?</p>
                <p className={styles.thesisAnswer}>
                  YUNI fue nuestra forma de responderla: identidad, contexto y voz reunidos en una experiencia
                  real.
                </p>
              </Reveal>
              <Reveal className={styles.thesisVisual} delay={0.12} reducedMotion={reducedMotion}>
                <ThesisConvergence reducedMotion={reducedMotion} />
              </Reveal>
            </div>
          </div>
        </section>

        <section className={styles.finalCta} aria-labelledby="cta-title">
          <FinalSignal />
          <Reveal className={styles.finalContent} reducedMotion={reducedMotion}>
            <p className={styles.eyebrow}>El próximo capítulo es en vivo</p>
            <h2 id="cta-title">
              Ahora, conocé
              <br />
              <span className={styles.finalWordmark}>YUNI</span> en acción.
            </h2>
            <Link className={`${styles.button} ${styles.finalButton}`} href="/dashboard" prefetch={false}>
              Explorar la demo
              <ArrowIcon />
            </Link>
          </Reveal>
          <footer className={styles.footer}>
            <div className={styles.footerHeading}>
              <p>Trabajo final de grado</p>
              <span>2026</span>
            </div>

            <div className={styles.footerDetails} aria-label="Datos académicos de la tesis">
              <p className={styles.footerAuthors}>
                Lucas Lovaglio <span aria-hidden="true">×</span> Santiago Peres
              </p>
              <p>Ingeniería Informática</p>
              <p>
                Facultad de Ingeniería <span aria-hidden="true">·</span> Universidad Austral
              </p>
            </div>
          </footer>
        </section>
      </main>
    </div>
  );
}
