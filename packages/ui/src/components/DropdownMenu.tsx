"use client";

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type ReactNode,
} from "react";
import { cn } from "../utils";

export type DropdownMenuItem = {
  label: string;
  icon?: ReactNode;
  onSelect?: () => void;
  disabled?: boolean;
  tone?: "default" | "danger";
};

export type DropdownMenuProps = {
  label: string;
  items: DropdownMenuItem[];
  triggerContent?: ReactNode;
  compact?: boolean;
  disabled?: boolean;
};

export function DropdownMenu({
  label,
  items,
  triggerContent,
  compact = false,
  disabled = false,
}: DropdownMenuProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [menuPosition, setMenuPosition] = useState({ left: 0, top: 0 });
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const itemRefs = useRef<Array<HTMLButtonElement | null>>([]);

  const focusItem = useCallback((index: number) => {
    const enabledItems = itemRefs.current.filter(
      (item): item is HTMLButtonElement => Boolean(item && !item.disabled)
    );

    if (enabledItems.length === 0) return;

    const normalizedIndex = (index + enabledItems.length) % enabledItems.length;
    enabledItems[normalizedIndex]?.focus();
  }, []);

  useLayoutEffect(() => {
    if (!isOpen || !triggerRef.current || !panelRef.current) {
      return;
    }

    function updatePosition() {
      if (!triggerRef.current || !panelRef.current) return;

      const triggerRect = triggerRef.current.getBoundingClientRect();
      const panelWidth = panelRef.current.offsetWidth;
      const panelHeight = panelRef.current.offsetHeight;
      const viewportPadding = 12;
      const menuGap = 8;
      const left = Math.min(
        Math.max(triggerRect.right - panelWidth, viewportPadding),
        window.innerWidth - panelWidth - viewportPadding
      );
      const fitsBelow = triggerRect.bottom + menuGap + panelHeight <= window.innerHeight - viewportPadding;
      const top = fitsBelow
        ? triggerRect.bottom + menuGap
        : Math.max(viewportPadding, triggerRect.top - panelHeight - menuGap);

      setMenuPosition({ left, top });
    }

    updatePosition();
    window.addEventListener("resize", updatePosition);
    window.addEventListener("scroll", updatePosition, true);

    return () => {
      window.removeEventListener("resize", updatePosition);
      window.removeEventListener("scroll", updatePosition, true);
    };
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    const focusFrame = window.requestAnimationFrame(() => focusItem(0));

    function onPointerDown(event: PointerEvent) {
      if (!rootRef.current?.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setIsOpen(false);
        triggerRef.current?.focus();
      }
    }

    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);

    return () => {
      window.cancelAnimationFrame(focusFrame);
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [focusItem, isOpen]);

  function onMenuKeyDown(event: ReactKeyboardEvent<HTMLDivElement>) {
    const enabledItems = itemRefs.current.filter(
      (item): item is HTMLButtonElement => Boolean(item && !item.disabled)
    );
    const currentIndex = enabledItems.findIndex((item) => item === document.activeElement);

    if (event.key === "ArrowDown") {
      event.preventDefault();
      focusItem(currentIndex + 1);
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      focusItem(currentIndex <= 0 ? enabledItems.length - 1 : currentIndex - 1);
    } else if (event.key === "Home") {
      event.preventDefault();
      focusItem(0);
    } else if (event.key === "End") {
      event.preventDefault();
      focusItem(enabledItems.length - 1);
    }
  }

  return (
    <div className="yuni-dropdown" ref={rootRef}>
      <button
        ref={triggerRef}
        type="button"
        className={cn(
          "yuni-dropdown__summary",
          compact && "yuni-dropdown__summary--compact",
          "yuni-button",
          "yuni-button--secondary",
          compact ? "yuni-button--sm" : "yuni-button--md"
        )}
        aria-label={triggerContent ? label : undefined}
        aria-haspopup="menu"
        aria-expanded={isOpen}
        disabled={disabled}
        onClick={() => setIsOpen((currentValue) => !currentValue)}
      >
        {triggerContent ?? label}
      </button>
      {isOpen ? (
        <div
          ref={panelRef}
          className="yuni-dropdown__menu"
          role="menu"
          style={menuPosition}
          onKeyDown={onMenuKeyDown}
        >
          {items.map((item, index) => (
            <button
              key={item.label}
              ref={(element) => {
                itemRefs.current[index] = element;
              }}
              className={cn("yuni-dropdown__item", item.tone === "danger" && "yuni-dropdown__item--danger")}
              type="button"
              role="menuitem"
              tabIndex={-1}
              disabled={item.disabled}
              onClick={() => {
                item.onSelect?.();
                setIsOpen(false);
                triggerRef.current?.focus();
              }}
            >
              {item.icon ? <span className="yuni-dropdown__item-icon">{item.icon}</span> : null}
              <span>{item.label}</span>
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
