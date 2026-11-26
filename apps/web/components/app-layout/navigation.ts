export type PrivateNavItemId = "dashboard" | "avatars" | "groups";
export type PrivatePageLayoutVariant = "standard" | "focus";

export type PrivateNavItem = {
  id: PrivateNavItemId;
  label: string;
  /** Label for the mobile tab bar, where space is tight. */
  shortLabel: string;
  icon: "chart" | "user" | "users";
  href: string;
};

const privateRoutePrefixes = ["/dashboard", "/avatars", "/groups", "/interact"] as const;

export const privateNavItems: PrivateNavItem[] = [
  { id: "dashboard", label: "Dashboard", shortLabel: "Dashboard", icon: "chart", href: "/dashboard" },
  { id: "avatars", label: "Mis avatares", shortLabel: "Avatares", icon: "user", href: "/avatars" },
  { id: "groups", label: "Grupos", shortLabel: "Grupos", icon: "users", href: "/groups" },
];

export function isPrivatePathname(pathname: string) {
  return privateRoutePrefixes.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`));
}

export function getPrivatePageMaxWidth(pathname: string) {
  if (pathname === "/avatars/new" || (pathname.startsWith("/avatars/") && pathname.endsWith("/edit"))) {
    return "1180px";
  }

  if (pathname.startsWith("/interact/") || isGroupCallPath(pathname)) {
    return "1440px";
  }

  return "1280px";
}

export function getPrivatePageLayoutVariant(pathname: string): PrivatePageLayoutVariant {
  return pathname.startsWith("/interact/") || isGroupCallPath(pathname) ? "focus" : "standard";
}

/**
 * Focused tasks (creating or editing an avatar) keep their own action bar at
 * the bottom on mobile, so the tab bar steps aside.
 */
export function isFocusedTaskPath(pathname: string) {
  return pathname === "/avatars/new" || /^\/avatars\/[^/]+\/edit\/?$/.test(pathname);
}

function isGroupCallPath(pathname: string) {
  return /^\/groups\/[^/]+\/?$/.test(pathname);
}

export function isPrivateNavItemActive(pathname: string, item: PrivateNavItem) {
  if (item.id === "dashboard") {
    return pathname === item.href;
  }

  if (item.id === "avatars") {
    return pathname === item.href || pathname.startsWith("/avatars/");
  }

  if (item.id === "groups") {
    return pathname === item.href || pathname.startsWith("/groups/");
  }

  return false;
}

export function getActivePrivateNavItem(pathname: string) {
  return privateNavItems.find((item) => isPrivateNavItemActive(pathname, item)) ?? null;
}
