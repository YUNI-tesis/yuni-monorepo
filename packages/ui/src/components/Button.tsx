import type { ButtonHTMLAttributes, ReactNode } from "react";
import { cn } from "../utils";

export type ButtonVariant = "primary" | "secondary" | "ghost" | "danger";
export type ButtonSize = "sm" | "md" | "lg";

export type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
  icon?: ReactNode;
};

export function Button({
  className,
  type = "button",
  variant = "primary",
  size = "md",
  loading = false,
  disabled,
  icon,
  children,
  ...props
}: ButtonProps) {
  return (
    <button
      type={type}
      className={cn("yuni-button", `yuni-button--${variant}`, `yuni-button--${size}`, className)}
      disabled={disabled || loading}
      aria-busy={loading}
      {...props}
    >
      {icon}
      <span>{loading ? "Cargando..." : children}</span>
    </button>
  );
}
