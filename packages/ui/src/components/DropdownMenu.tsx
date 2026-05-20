"use client";

import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { cn } from "../utils";

export type DropdownMenuItem = {
  label: string;
  onSelect?: () => void;
};

export type DropdownMenuProps = {
  label: string;
  items: DropdownMenuItem[];
  triggerContent?: ReactNode;
};

export function DropdownMenu({ label, items, triggerContent }: DropdownMenuProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [align, setAlign] = useState<"start" | "end">("start");
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    if (!isOpen || !triggerRef.current || !panelRef.current) {
      return;
    }

    const triggerRect = triggerRef.current.getBoundingClientRect();
    const panelWidth = panelRef.current.offsetWidth;
    const viewportWidth = window.innerWidth;
    const viewportPadding = 12;
    const overflowsRight = triggerRect.left + panelWidth > viewportWidth - viewportPadding;
    const overflowsLeftWhenEndAligned = triggerRect.right - panelWidth < viewportPadding;

    setAlign(overflowsRight && !overflowsLeftWhenEndAligned ? "end" : "start");
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    function onPointerDown(event: PointerEvent) {
      if (!rootRef.current?.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setIsOpen(false);
      }
    }

    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);

    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [isOpen]);

  return (
    <div className="yuni-dropdown" ref={rootRef}>
      <button
        ref={triggerRef}
        type="button"
        className={cn("yuni-dropdown__summary", "yuni-button", "yuni-button--secondary", "yuni-button--md")}
        aria-haspopup="menu"
        aria-expanded={isOpen}
        onClick={() => setIsOpen((currentValue) => !currentValue)}
      >
        {triggerContent ?? label}
      </button>
      {isOpen ? (
        <div ref={panelRef} className={cn("yuni-dropdown__menu", `yuni-dropdown__menu--${align}`)} role="menu">
          {items.map((item) => (
            <button
              key={item.label}
              className="yuni-dropdown__item"
              type="button"
              role="menuitem"
              onClick={() => {
                item.onSelect?.();
                setIsOpen(false);
              }}
            >
              {item.label}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
