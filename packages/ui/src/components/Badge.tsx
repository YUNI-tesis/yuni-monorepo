import type { HTMLAttributes } from "react";
import { cn } from "../utils";

export type BadgeTone = "neutral" | "success" | "warning" | "danger";

export type BadgeProps = HTMLAttributes<HTMLSpanElement> & {
  tone?: BadgeTone;
};

export function Badge({ tone = "neutral", className, ...props }: BadgeProps) {
  return <span className={cn("yuni-badge", `yuni-badge--${tone}`, className)} {...props} />;
}
