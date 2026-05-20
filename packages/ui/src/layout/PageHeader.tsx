import type { ReactNode } from "react";

export type PageHeaderProps = {
  eyebrow?: string;
  title: string;
  description?: string;
  actions?: ReactNode;
};

export function PageHeader({ eyebrow, title, description, actions }: PageHeaderProps) {
  return (
    <header className="yuni-page-header">
      <div className="yuni-page-header__content">
        {eyebrow ? <p className="yuni-page-header__eyebrow">{eyebrow}</p> : null}
        <h1 className="yuni-page-header__title">{title}</h1>
        {description ? <p className="yuni-page-header__description">{description}</p> : null}
      </div>
      {actions ? <div className="yuni-cluster">{actions}</div> : null}
    </header>
  );
}
