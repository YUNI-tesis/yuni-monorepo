"use client";

import { motion, useReducedMotion, useSpring, type PanInfo } from "motion/react";
import React, { useRef, type PointerEvent as ReactPointerEvent } from "react";
import { YuniLogo } from "../brand/YuniLogo";
import styles from "./LivingYuniLogo.module.css";

type LivingYuniLogoProps = {
  className?: string | undefined;
  dragEnabled?: boolean;
  interactive?: boolean;
  mood?: "calm" | "awake";
};

const clamp = (value: number, min: number, max: number) => Math.min(Math.max(value, min), max);

export function LivingYuniLogo({
  className = "",
  dragEnabled = false,
  interactive = true,
  mood = "calm",
}: LivingYuniLogoProps) {
  const rootRef = useRef<HTMLDivElement>(null);
  const reducedMotion = useReducedMotion() ?? false;
  const canInteract = interactive && !reducedMotion;
  const canDrag = canInteract && dragEnabled;
  const dragScaleX = useSpring(1, { stiffness: 340, damping: 15, mass: 0.42 });
  const dragScaleY = useSpring(1, { stiffness: 340, damping: 15, mass: 0.42 });
  const dragRotate = useSpring(0, { stiffness: 280, damping: 17, mass: 0.48 });

  const resetGaze = () => {
    const root = rootRef.current;
    if (!root) return;

    root.style.setProperty("--yuni-look-x", "0px");
    root.style.setProperty("--yuni-look-y", "0px");
    root.style.setProperty("--yuni-body-x", "0px");
    root.style.setProperty("--yuni-body-y", "0px");
  };

  const resetDeformation = () => {
    dragScaleX.set(1);
    dragScaleY.set(1);
    dragRotate.set(0);
  };

  const setDraggingState = (isDragging: boolean) => {
    rootRef.current?.setAttribute("data-dragging", isDragging ? "true" : "false");
  };

  const handlePointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!canInteract || event.pointerType === "touch") return;

    const rect = event.currentTarget.getBoundingClientRect();
    const normalizedX = clamp(((event.clientX - rect.left) / rect.width - 0.5) * 2, -1, 1);
    const normalizedY = clamp(((event.clientY - rect.top) / rect.height - 0.5) * 2, -1, 1);
    const root = rootRef.current;

    if (!root) return;

    root.style.setProperty("--yuni-look-x", `${normalizedX * 6}px`);
    root.style.setProperty("--yuni-look-y", `${normalizedY * 4.5}px`);
    root.style.setProperty("--yuni-body-x", `${normalizedX * 3.4}px`);
    root.style.setProperty("--yuni-body-y", `${normalizedY * 2.6}px`);
  };

  const handleDrag = (_event: MouseEvent | TouchEvent | PointerEvent, info: PanInfo) => {
    const horizontalSpeed = Math.abs(info.velocity.x);
    const verticalSpeed = Math.abs(info.velocity.y);
    const energy = clamp(Math.hypot(info.velocity.x, info.velocity.y) / 1400, 0, 1);
    const root = rootRef.current;

    dragScaleX.set(horizontalSpeed >= verticalSpeed ? 1 + energy * 0.16 : 1 - energy * 0.08);
    dragScaleY.set(verticalSpeed > horizontalSpeed ? 1 + energy * 0.16 : 1 - energy * 0.08);
    dragRotate.set(clamp(info.velocity.x / 110, -8, 8));

    if (!root) return;

    root.style.setProperty("--yuni-look-x", `${clamp(info.offset.x * 0.14, -7, 7)}px`);
    root.style.setProperty("--yuni-look-y", `${clamp(info.offset.y * 0.1, -5, 5)}px`);
    root.style.setProperty("--yuni-body-x", `${clamp(info.velocity.x * 0.004, -5, 5)}px`);
    root.style.setProperty("--yuni-body-y", `${clamp(info.velocity.y * 0.004, -4, 4)}px`);
  };

  return (
    <motion.div
      ref={rootRef}
      className={`${styles.root} ${mood === "awake" ? styles.awake : ""} ${className}`}
      data-draggable={canDrag ? "true" : "false"}
      data-dragging="false"
      data-interactive={canInteract ? "true" : "false"}
      drag={canDrag}
      dragConstraints={{ top: -44, right: 44, bottom: 44, left: -44 }}
      dragElastic={0.72}
      dragMomentum={false}
      dragSnapToOrigin={canDrag}
      onDrag={handleDrag}
      onDragStart={() => setDraggingState(true)}
      onDragEnd={() => {
        setDraggingState(false);
        resetGaze();
        resetDeformation();
      }}
      onPointerMove={handlePointerMove}
      onPointerLeave={() => {
        resetGaze();
        resetDeformation();
      }}
      onPointerCancel={() => {
        setDraggingState(false);
        resetGaze();
        resetDeformation();
      }}
      {...(canInteract
        ? {
            whileHover: { scaleX: 1.065, scaleY: 0.96 },
            whileTap: { scaleX: 0.84, scaleY: 1.16, rotate: -2 },
            whileDrag: { scale: 1.08 },
          }
        : {})}
      transition={{ type: "spring", stiffness: 290, damping: 13, mass: 0.68 }}
      aria-hidden="true"
      tabIndex={-1}
    >
      <motion.span
        className={styles.logoShell}
        style={{ scaleX: dragScaleX, scaleY: dragScaleY, rotate: dragRotate }}
      >
        <YuniLogo className={styles.logo} focusable="false" />
      </motion.span>
    </motion.div>
  );
}
