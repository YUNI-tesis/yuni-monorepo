"use client";

import { useMemo, useState, type ReactNode } from "react";

export type TabItem = {
  value: string;
  label: string;
  content: ReactNode;
};

export type TabsProps = {
  items: TabItem[];
  defaultValue?: string;
};

export function Tabs({ items, defaultValue }: TabsProps) {
  const initialValue = defaultValue ?? items[0]?.value ?? "";
  const [selectedValue, setSelectedValue] = useState(initialValue);
  const selectedItem = useMemo(
    () => items.find((item) => item.value === selectedValue) ?? items[0],
    [items, selectedValue]
  );

  return (
    <div className="yuni-tabs">
      <div className="yuni-tabs__list" role="tablist">
        {items.map((item) => (
          <button
            key={item.value}
            className="yuni-tabs__trigger"
            type="button"
            role="tab"
            aria-selected={item.value === selectedItem?.value}
            onClick={() => setSelectedValue(item.value)}
          >
            {item.label}
          </button>
        ))}
      </div>
      <div className="yuni-tabs__panel" role="tabpanel">
        {selectedItem?.content}
      </div>
    </div>
  );
}
