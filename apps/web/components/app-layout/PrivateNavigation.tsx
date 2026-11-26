import React from "react";
import Link from "next/link";
import { YuniIcon } from "@yuni/ui";
import { isPrivateNavItemActive, privateNavItems } from "./navigation";
import styles from "./PrivateAreaLayout.module.css";

export function PrivateNavigation({ pathname }: { pathname: string }) {
  return (
    <nav className={styles.nav} aria-label="Secciones privadas">
      {privateNavItems.map((item) => {
        const isActive = isPrivateNavItemActive(pathname, item);

        return (
          <Link
            key={item.id}
            className={`${styles.navLink} ${isActive ? styles.navLinkActive : ""}`}
            href={item.href}
            aria-current={isActive ? "page" : undefined}
          >
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}

/**
 * Bottom tab bar for phones. Only one of the two navigations is displayed at a
 * time (CSS), so assistive tech never sees both.
 */
export function PrivateTabBar({ pathname }: { pathname: string }) {
  return (
    <nav className={styles.tabBar} aria-label="Secciones privadas">
      {privateNavItems.map((item) => {
        const isActive = isPrivateNavItemActive(pathname, item);

        return (
          <Link
            key={item.id}
            className={`${styles.tabLink} ${isActive ? styles.tabLinkActive : ""}`}
            href={item.href}
            aria-current={isActive ? "page" : undefined}
          >
            <YuniIcon name={item.icon} size={24} />
            <span>{item.shortLabel}</span>
          </Link>
        );
      })}
    </nav>
  );
}
