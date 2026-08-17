"use client";

import { useId, useMemo, useState, type KeyboardEvent, type ReactNode } from "react";

export type TabItem = {
  value: string;
  label: string;
  content: ReactNode;
};

export type TabsProps = {
  items: TabItem[];
  defaultValue?: string;
  value?: string;
  onValueChange?: (value: string) => void;
  "aria-label"?: string;
};

export function Tabs({ items, defaultValue, value, onValueChange, "aria-label": ariaLabel }: TabsProps) {
  const id = useId();
  const initialValue = defaultValue ?? items[0]?.value ?? "";
  const [internalValue, setInternalValue] = useState(initialValue);
  const selectedValue = value ?? internalValue;
  const selectedItem = useMemo(
    () => items.find((item) => item.value === selectedValue) ?? items[0],
    [items, selectedValue]
  );

  function selectValue(nextValue: string) {
    if (value === undefined) {
      setInternalValue(nextValue);
    }

    onValueChange?.(nextValue);
  }

  function onTriggerKeyDown(event: KeyboardEvent<HTMLButtonElement>, currentIndex: number) {
    const keyOffsets: Record<string, number> = {
      ArrowLeft: -1,
      ArrowUp: -1,
      ArrowRight: 1,
      ArrowDown: 1,
    };
    let nextIndex: number | null = null;

    const keyOffset = keyOffsets[event.key];

    if (keyOffset !== undefined) {
      nextIndex = (currentIndex + keyOffset + items.length) % items.length;
    }

    if (event.key === "Home") {
      nextIndex = 0;
    }

    if (event.key === "End") {
      nextIndex = items.length - 1;
    }

    if (nextIndex === null) {
      return;
    }

    event.preventDefault();

    const triggers = Array.from(
      event.currentTarget.parentElement?.querySelectorAll<HTMLButtonElement>('[role="tab"]') ?? []
    );

    selectValue(items[nextIndex]?.value ?? items[currentIndex]?.value ?? "");
    triggers[nextIndex]?.focus();
  }

  const panelId = selectedItem ? `${id}-${selectedItem.value}-panel` : undefined;

  return (
    <div className="yuni-tabs">
      <div className="yuni-tabs__list" role="tablist" aria-label={ariaLabel}>
        {items.map((item, index) => {
          const isSelected = item.value === selectedItem?.value;
          const triggerId = `${id}-${item.value}-trigger`;

          return (
            <button
              key={item.value}
              id={triggerId}
              className="yuni-tabs__trigger"
              type="button"
              role="tab"
              aria-controls={isSelected ? panelId : undefined}
              aria-selected={isSelected}
              tabIndex={isSelected ? 0 : -1}
              onClick={() => selectValue(item.value)}
              onKeyDown={(event) => onTriggerKeyDown(event, index)}
            >
              {item.label}
            </button>
          );
        })}
      </div>
      <div
        id={panelId}
        className="yuni-tabs__panel"
        role="tabpanel"
        aria-labelledby={selectedItem ? `${id}-${selectedItem.value}-trigger` : undefined}
      >
        {selectedItem?.content}
      </div>
    </div>
  );
}
