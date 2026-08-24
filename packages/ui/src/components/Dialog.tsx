"use client";

import type { DialogHTMLAttributes, MouseEvent, ReactNode } from "react";
import { forwardRef } from "react";
import { cn } from "../utils";
import { Button } from "./Button";

export type DialogProps = DialogHTMLAttributes<HTMLDialogElement> & {
  title: string;
  description?: string;
  children?: ReactNode;
  footer?: ReactNode;
  closeLabel?: string;
};

export const Dialog = forwardRef<HTMLDialogElement, DialogProps>(function Dialog(
  { title, description, children, footer, closeLabel = "Cerrar", className, ...props },
  ref
) {
  function onDialogClick(event: MouseEvent<HTMLDialogElement>) {
    if (event.target === event.currentTarget) {
      event.currentTarget.close();
    }
  }

  return (
    <dialog
      ref={ref}
      className={cn("yuni-dialog", className)}
      aria-label={title}
      onClick={onDialogClick}
      {...props}
    >
      <div className="yuni-dialog__body">
        <form method="dialog" className="yuni-dialog__close-form">
          <button className="yuni-dialog__close" type="submit" aria-label="Cerrar">
            x
          </button>
        </form>
        <div className="yuni-dialog__header">
          <h2 className="yuni-dialog__title">{title}</h2>
          {description ? <p className="yuni-text-muted">{description}</p> : null}
        </div>
        {children}
        <footer className="yuni-dialog__footer">
          <form method="dialog">
            <Button variant="secondary" type="submit">
              {closeLabel}
            </Button>
          </form>
          {footer}
        </footer>
      </div>
    </dialog>
  );
});
