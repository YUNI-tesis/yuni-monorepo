import type { ReactNode } from "react";

export type SidebarLayoutProps = {
  sidebar: ReactNode;
  children: ReactNode;
};

export function SidebarLayout({ sidebar, children }: SidebarLayoutProps) {
  return (
    <div className="yuni-sidebar-layout">
      <aside className="yuni-sidebar-layout__sidebar">{sidebar}</aside>
      <section className="yuni-sidebar-layout__content">{children}</section>
    </div>
  );
}
