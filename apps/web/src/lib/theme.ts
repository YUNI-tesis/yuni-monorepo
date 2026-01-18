/**
 * YUNI Theme Configuration
 * Centralized color scheme and theme utilities
 */

export const theme = {
  colors: {
    bg: {
      primary: "#0E0418",
      secondary: "rgba(255, 255, 255, 0.05)",
      hover: "rgba(255, 255, 255, 0.1)",
    },
    gradient: {
      start: "#BE6ADC",
      end: "#64C3D7",
    },
    purple: "#784EAB",
    blueGray: "#333F55",
    gray: "#868D99",
    accent: "#D365FF",
    text: {
      primary: "#FFFFFF",
      secondary: "#868D99",
      muted: "#666666",
    },
    border: {
      default: "rgba(255, 255, 255, 0.1)",
      hover: "rgba(255, 255, 255, 0.2)",
      focus: "#D365FF",
    },
  },
  spacing: {
    xs: "0.25rem",
    sm: "0.5rem",
    md: "1rem",
    lg: "1.5rem",
    xl: "2rem",
    "2xl": "3rem",
  },
  borderRadius: {
    sm: "6px",
    md: "8px",
    lg: "12px",
    xl: "16px",
    full: "9999px",
  },
  shadows: {
    sm: "0 2px 4px rgba(0, 0, 0, 0.2)",
    md: "0 4px 8px rgba(0, 0, 0, 0.3)",
    lg: "0 8px 16px rgba(0, 0, 0, 0.4)",
    glow: "0 0 20px rgba(211, 101, 255, 0.3)",
  },
} as const;

export type Theme = typeof theme;

/**
 * Get gradient CSS value
 */
export const getGradient = (direction: "vertical" | "horizontal" = "vertical") => {
  const dir = direction === "vertical" ? "180deg" : "90deg";
  return `linear-gradient(${dir}, ${theme.colors.gradient.start} 0%, ${theme.colors.gradient.end} 100%)`;
};

