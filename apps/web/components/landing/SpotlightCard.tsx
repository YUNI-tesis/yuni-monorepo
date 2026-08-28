"use client";

/**
 * Adapted from the MIT-licensed React Bits "Spotlight Card" interaction.
 * Source inspiration: https://reactbits.dev/components/spotlight-card
 */

import React, { type CSSProperties, type HTMLAttributes, type PointerEvent } from "react";
import styles from "./SpotlightCard.module.css";

type SpotlightCardProps = HTMLAttributes<HTMLElement> & {
  as?: "article" | "div";
  spotlightColor?: string;
};

export function SpotlightCard({
  as: Element = "article",
  className = "",
  spotlightColor = "var(--landing-spotlight-primary)",
  onPointerMove,
  onPointerLeave,
  style,
  ...props
}: SpotlightCardProps) {
  const handlePointerMove = (event: PointerEvent<HTMLElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    event.currentTarget.style.setProperty("--spotlight-x", `${event.clientX - rect.left}px`);
    event.currentTarget.style.setProperty("--spotlight-y", `${event.clientY - rect.top}px`);
    onPointerMove?.(event);
  };

  const handlePointerLeave = (event: PointerEvent<HTMLElement>) => {
    event.currentTarget.style.setProperty("--spotlight-x", "50%");
    event.currentTarget.style.setProperty("--spotlight-y", "50%");
    onPointerLeave?.(event);
  };

  const spotlightStyle = {
    ...style,
    "--spotlight-color": spotlightColor,
  } as CSSProperties;

  return (
    <Element
      className={`${styles.card} ${className}`}
      onPointerMove={handlePointerMove}
      onPointerLeave={handlePointerLeave}
      style={spotlightStyle}
      {...props}
    />
  );
}
