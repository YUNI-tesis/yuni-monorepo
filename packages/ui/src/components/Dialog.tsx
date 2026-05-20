"use client";

import type { DialogHTMLAttributes, MouseEvent, ReactNode } from "react";
import { forwardRef } from "react";
import { Button } from "./Button";

export type DialogProps = DialogHTMLAttributes<HTMLDialogElement> & {
  title: string;
  description?: string;
  children?: ReactNode;
  closeLabel?: string;
};

export const Dialog = forwardRef<HTMLDialogElement, DialogProps>(function Dialog(
  { title, description, children, closeLabel = "Cerrar", ...props },
  ref
) {
  function onDialogClick(event: MouseEvent<HTMLDialogElement>) {
    if (event.target === event.currentTarget) {
      event.currentTarget.close();
    }
  }

  return (
    <dialog ref={ref} className="yuni-dialog" aria-label={title} onClick={onDialogClick} {...props}>
      <div className="yuni-dialog__body">
        <form method="dialog" className="yuni-dialog__close-form">
          <button className="yuni-dialog__close" type="submit" aria-label="Cerrar modal">
            x
          </button>
        </form>
        <div className="yuni-stack">
          <p className="yuni-eyebrow">Modal</p>
          <h2 className="yuni-page-header__title">{title}</h2>
          {description ? <p className="yuni-text-muted">{description}</p> : null}
        </div>
        {children}
        <form method="dialog">
          <Button variant="secondary" type="submit">
            {closeLabel}
          </Button>
        </form>
      </div>
    </dialog>
  );
});
