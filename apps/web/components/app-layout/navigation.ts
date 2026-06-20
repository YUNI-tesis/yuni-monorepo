export type PrivateNavItemId = "dashboard" | "avatars" | "create-avatar" | "interact";

export type PrivateNavItem = {
  id: PrivateNavItemId;
  label: string;
  href: string;
};

const privateRoutePrefixes = ["/dashboard", "/avatars", "/interact"] as const;

export const privateNavItems: PrivateNavItem[] = [
  { id: "dashboard", label: "Dashboard", href: "/dashboard" },
  { id: "avatars", label: "Avatares", href: "/avatars" },
  { id: "create-avatar", label: "Crear avatar", href: "/avatars/new" },
  { id: "interact", label: "Interact", href: "/interact" },
];

export function isPrivatePathname(pathname: string) {
  return privateRoutePrefixes.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`));
}

export function getPrivatePageMaxWidth(pathname: string) {
  if (pathname === "/avatars/new" || (pathname.startsWith("/avatars/") && pathname.endsWith("/edit"))) {
    return "1180px";
  }

  if (pathname.startsWith("/interact/")) {
    return "1440px";
  }

  return "1280px";
}

export function isPrivateNavItemActive(pathname: string, item: PrivateNavItem) {
  if (item.id === "dashboard") {
    return pathname === item.href;
  }

  if (item.id === "create-avatar") {
    return pathname === item.href;
  }

  if (item.id === "avatars") {
    return pathname === item.href || (pathname.startsWith("/avatars/") && pathname !== "/avatars/new");
  }

  return pathname === item.href || pathname.startsWith(`${item.href}/`);
}

export function getActivePrivateNavItem(pathname: string) {
  return privateNavItems.find((item) => isPrivateNavItemActive(pathname, item)) ?? null;
}
