export type PrivateNavItemId = "dashboard" | "avatars" | "groups";
export type PrivatePageLayoutVariant = "standard" | "focus";

export type PrivateNavItem = {
  id: PrivateNavItemId;
  label: string;
  href: string;
};

const privateRoutePrefixes = ["/dashboard", "/avatars", "/groups", "/interact"] as const;

export const privateNavItems: PrivateNavItem[] = [
  { id: "dashboard", label: "Dashboard", href: "/dashboard" },
  { id: "avatars", label: "Mis avatares", href: "/avatars" },
  { id: "groups", label: "Grupos", href: "/groups" },
];

export function isPrivatePathname(pathname: string) {
  return privateRoutePrefixes.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`));
}

export function getPrivatePageMaxWidth(pathname: string) {
  if (pathname === "/avatars/new" || (pathname.startsWith("/avatars/") && pathname.endsWith("/edit"))) {
    return "1180px";
  }

  if (pathname.startsWith("/interact/") || pathname.startsWith("/groups/")) {
    return "1440px";
  }

  return "1280px";
}

export function getPrivatePageLayoutVariant(pathname: string): PrivatePageLayoutVariant {
  return pathname.startsWith("/interact/") || pathname.startsWith("/groups/") ? "focus" : "standard";
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
