import type { ButtonHTMLAttributes } from "react";

export const yuniTokens = {
  colors: {
    background: "#090112",
    accent: "#BE6ADC",
    cyan: "#64C3D7",
  },
  radius: {
    sm: "8px",
    md: "12px",
  },
} as const;

export function Button({
  className = "",
  type = "button",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      type={type}
      className={`yuni-button ${className}`}
      style={{
        border: 0,
        borderRadius: yuniTokens.radius.sm,
        padding: "12px 18px",
        background: `linear-gradient(135deg, ${yuniTokens.colors.accent}, ${yuniTokens.colors.cyan})`,
        color: "white",
        fontWeight: 700,
        cursor: "pointer",
      }}
      {...props}
    />
  );
}
