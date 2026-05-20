import type { ButtonHTMLAttributes, ReactNode } from "react";
import { cn } from "../utils";
import type { ButtonSize, ButtonVariant } from "./Button";

export type IconButtonProps = Omit<ButtonHTMLAttributes<HTMLButtonElement>, "children" | "aria-label"> & {
  "aria-label": string;
  icon: ReactNode;
  variant?: ButtonVariant;
  size?: ButtonSize;
};

export function IconButton({
  className,
  type = "button",
  variant = "secondary",
  size = "md",
  icon,
  ...props
}: IconButtonProps) {
  return (
    <button
      type={type}
      className={cn(
        "yuni-icon-button",
        `yuni-button--${variant}`,
        size !== "md" && `yuni-icon-button--${size}`,
        className
      )}
      {...props}
    >
      {icon}
    </button>
  );
}
