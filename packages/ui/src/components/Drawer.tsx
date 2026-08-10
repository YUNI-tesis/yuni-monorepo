"use client";

import type { DialogHTMLAttributes, MouseEvent, ReactNode } from "react";
import { forwardRef } from "react";
import { cn } from "../utils";
import { Button } from "./Button";

export type DrawerProps = DialogHTMLAttributes<HTMLDialogElement> & {
  title: string;
  description?: string;
  children?: ReactNode;
  footer?: ReactNode;
  closeLabel?: string;
};

export const Drawer = forwardRef<HTMLDialogElement, DrawerProps>(function Drawer(
  { title, description, children, footer, closeLabel = "Cerrar", className, ...props },
  ref
) {
  function onDrawerClick(event: MouseEvent<HTMLDialogElement>) {
    if (event.target === event.currentTarget) {
      event.currentTarget.close();
    }
  }

  return (
    <dialog
      ref={ref}
      className={cn("yuni-drawer", className)}
      aria-label={title}
      onClick={onDrawerClick}
      {...props}
    >
      <div className="yuni-drawer__panel">
        <header className="yuni-drawer__header">
          <div>
            <h2 className="yuni-drawer__title">{title}</h2>
            {description ? <p className="yuni-text-muted">{description}</p> : null}
          </div>
          <form method="dialog">
            <button className="yuni-drawer__close" type="submit" aria-label="Cerrar">
              ×
            </button>
          </form>
        </header>

        <div className="yuni-drawer__content">{children}</div>

        <footer className="yuni-drawer__footer">
          {footer}
          <form method="dialog">
            <Button variant="secondary" type="submit">
              {closeLabel}
            </Button>
          </form>
        </footer>
      </div>
    </dialog>
  );
});
