"use client";

import { motion, useReducedMotion } from "motion/react";
import React, { useRef, type PointerEvent as ReactPointerEvent } from "react";
import { YuniLogo } from "../brand/YuniLogo";
import styles from "./LivingYuniLogo.module.css";

type LivingYuniLogoProps = {
  className?: string | undefined;
  interactive?: boolean;
  mood?: "calm" | "awake";
};

export function LivingYuniLogo({ className = "", interactive = true, mood = "calm" }: LivingYuniLogoProps) {
  const rootRef = useRef<HTMLDivElement>(null);
  const reducedMotion = useReducedMotion() ?? false;

  const resetGaze = () => {
    const root = rootRef.current;
    if (!root) return;

    root.style.setProperty("--yuni-look-x", "0px");
    root.style.setProperty("--yuni-look-y", "0px");
    root.style.setProperty("--yuni-body-x", "0px");
    root.style.setProperty("--yuni-body-y", "0px");
  };

  const handlePointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!interactive || reducedMotion || event.pointerType === "touch") return;

    const rect = event.currentTarget.getBoundingClientRect();
    const normalizedX = ((event.clientX - rect.left) / rect.width - 0.5) * 2;
    const normalizedY = ((event.clientY - rect.top) / rect.height - 0.5) * 2;
    const root = rootRef.current;

    if (!root) return;

    root.style.setProperty("--yuni-look-x", `${normalizedX * 4.2}px`);
    root.style.setProperty("--yuni-look-y", `${normalizedY * 3.2}px`);
    root.style.setProperty("--yuni-body-x", `${normalizedX * 1.5}px`);
    root.style.setProperty("--yuni-body-y", `${normalizedY * 1.1}px`);
  };

  return (
    <motion.div
      ref={rootRef}
      className={`${styles.root} ${styles[mood]} ${className}`}
      data-interactive={interactive && !reducedMotion ? "true" : "false"}
      onPointerMove={handlePointerMove}
      onPointerLeave={resetGaze}
      onPointerCancel={resetGaze}
      {...(interactive && !reducedMotion
        ? {
            whileHover: { scaleX: 1.045, scaleY: 0.975 },
            whileTap: { scaleX: 0.84, scaleY: 1.16, rotate: -2 },
          }
        : {})}
      transition={{ type: "spring", stiffness: 290, damping: 13, mass: 0.68 }}
      aria-hidden="true"
    >
      <YuniLogo className={styles.logo} focusable="false" />
    </motion.div>
  );
}
