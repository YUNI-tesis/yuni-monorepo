export const yuniTokens = {
  colors: {
    bg: "#08030f",
    bgElevated: "#10081b",
    surface: "#171021",
    surfaceMuted: "#21172e",
    border: "rgba(255, 255, 255, 0.12)",
    borderStrong: "rgba(255, 255, 255, 0.2)",
    text: "#f7f2ff",
    textMuted: "#b9aec8",
    primary: "#be6adc",
    primaryHover: "#d583ef",
    accent: "#64c3d7",
    accentHover: "#8ad9e8",
    danger: "#ff7272",
    success: "#65d6a2",
    warning: "#ffc15a",
  },
  radius: {
    xs: "4px",
    sm: "6px",
    md: "8px",
  },
  spacing: {
    1: "4px",
    2: "8px",
    3: "12px",
    4: "16px",
    5: "20px",
    6: "24px",
    8: "32px",
    10: "40px",
    12: "48px",
  },
  typography: {
    fontFamily:
      'Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    sizes: {
      xs: "0.75rem",
      sm: "0.875rem",
      md: "1rem",
      lg: "1.125rem",
      xl: "1.5rem",
      "2xl": "2rem",
      "3xl": "3rem",
    },
  },
  shadows: {
    sm: "0 8px 24px rgba(0, 0, 0, 0.24)",
    md: "0 18px 60px rgba(0, 0, 0, 0.32)",
  },
  zIndex: {
    dropdown: 20,
    dialog: 50,
  },
} as const;

export type YuniTokens = typeof yuniTokens;
