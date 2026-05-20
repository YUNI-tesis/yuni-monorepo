import type { HTMLAttributes } from "react";
import { cn } from "../utils";

export type CardProps = HTMLAttributes<HTMLElement> & {
  as?: "section" | "article" | "div";
  padding?: "sm" | "md" | "lg";
  muted?: boolean;
};

export function Card({
  as: Component = "section",
  padding = "md",
  muted = false,
  className,
  ...props
}: CardProps) {
  return (
    <Component
      className={cn("yuni-card", `yuni-card--padding-${padding}`, muted && "yuni-card--muted", className)}
      {...props}
    />
  );
}
