import React from "react";
import Link from "next/link";
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
