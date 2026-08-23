import React from "react";
import type { CapabilityIconName } from "./content";

type CapabilityIconProps = {
  name: CapabilityIconName;
};

const sharedProps = {
  fill: "none",
  stroke: "currentColor",
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
  strokeWidth: 1.65,
  vectorEffect: "non-scaling-stroke" as const,
};

export function CapabilityIcon({ name }: CapabilityIconProps) {
  if (name === "identity") {
    return (
      <svg viewBox="0 0 48 48" aria-hidden="true" focusable="false">
        <circle cx="20" cy="17" r="6" {...sharedProps} />
        <path d="M9.5 36c1.8-6.2 5.3-9.2 10.5-9.2s8.7 3 10.5 9.2" {...sharedProps} />
        <path d="m35.5 10 1.2 3.2 3.3 1.2-3.3 1.2-1.2 3.2-1.2-3.2-3.3-1.2 3.3-1.2Z" {...sharedProps} />
      </svg>
    );
  }

  if (name === "voice") {
    return (
      <svg viewBox="0 0 48 48" aria-hidden="true" focusable="false">
        <rect x="18.5" y="8" width="11" height="22" rx="5.5" {...sharedProps} />
        <path d="M13.5 24a10.5 10.5 0 0 0 21 0M24 34.5V40M19 40h10" {...sharedProps} />
        <path d="M36.5 15.5c2.8 2.2 2.8 5.8 0 8M40 12c5.2 4.2 5.2 11.8 0 16" {...sharedProps} />
      </svg>
    );
  }

  if (name === "avatar") {
    return (
      <svg viewBox="0 0 48 48" aria-hidden="true" focusable="false">
        <rect x="8" y="9" width="32" height="30" rx="12" {...sharedProps} />
        <circle cx="18.5" cy="23" r="1.6" fill="currentColor" />
        <circle cx="29.5" cy="23" r="1.6" fill="currentColor" />
        <path d="M17.5 29.5c4.2 3.2 8.8 3.2 13 0M24 9V5.5M21 5.5h6" {...sharedProps} />
      </svg>
    );
  }

  if (name === "context") {
    return (
      <svg viewBox="0 0 48 48" aria-hidden="true" focusable="false">
        <path d="M13 6.5h15l7 7v28H13Z" {...sharedProps} />
        <path d="M28 6.5v7h7M19 22h10M19 28h10M19 34h7" {...sharedProps} />
        <path d="M9 12v32h21" {...sharedProps} />
      </svg>
    );
  }

  if (name === "sharing") {
    return (
      <svg viewBox="0 0 48 48" aria-hidden="true" focusable="false">
        <circle cx="12" cy="24" r="5" {...sharedProps} />
        <circle cx="36" cy="12" r="5" {...sharedProps} />
        <circle cx="36" cy="36" r="5" {...sharedProps} />
        <path d="m16.5 21.8 15-7.5M16.5 26.2l15 7.5" {...sharedProps} />
      </svg>
    );
  }

  if (name === "activity") {
    return (
      <svg viewBox="0 0 48 48" aria-hidden="true" focusable="false">
        <path d="M7 25h7l4-9 7.5 18 5-12 3 3H41" {...sharedProps} />
        <path d="M8 9v30h32" {...sharedProps} />
        <circle cx="40" cy="25" r="2" fill="currentColor" />
      </svg>
    );
  }

  if (name === "group") {
    return (
      <svg viewBox="0 0 48 48" aria-hidden="true" focusable="false">
        <circle cx="24" cy="14" r="5" {...sharedProps} />
        <circle cx="11" cy="30" r="5" {...sharedProps} />
        <circle cx="37" cy="30" r="5" {...sharedProps} />
        <path d="M21 18 14 26M27 18l7 8M16 32h16" {...sharedProps} />
      </svg>
    );
  }

  return (
    <svg viewBox="0 0 48 48" aria-hidden="true" focusable="false">
      <path d="M24 5.5 38 11v10.8c0 9-5.5 16.4-14 20.7-8.5-4.3-14-11.7-14-20.7V11Z" {...sharedProps} />
      <path d="m17.5 24 4.2 4.2 9-9" {...sharedProps} />
    </svg>
  );
}
