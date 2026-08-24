"use client";

import {
  Children,
  isValidElement,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
  type ReactElement,
  type ReactNode,
  type ButtonHTMLAttributes,
} from "react";
import { YuniIcon } from "../icons/YuniIcon";
import { cn } from "../utils";

type SelectOption = {
  value: string;
  label: string;
  disabled?: boolean;
};

type OptionElementProps = {
  value?: string | number;
  disabled?: boolean;
  children?: ReactNode;
};

export type SelectProps = Omit<
  ButtonHTMLAttributes<HTMLButtonElement>,
  "children" | "value" | "defaultValue"
> & {
  invalid?: boolean;
  children: ReactNode;
  value?: string;
  defaultValue?: string;
  placeholder?: string;
  onValueChange?: (value: string) => void;
  name?: string;
  required?: boolean;
};

export function Select({
  invalid = false,
  className,
  children,
  value,
  defaultValue,
  placeholder = "Seleccionar",
  disabled,
  name,
  id,
  required,
  onValueChange,
  ...props
}: SelectProps) {
  const generatedId = useId();
  const buttonId = id ?? generatedId;
  const rootRef = useRef<HTMLDivElement>(null);
  const options = useMemo(() => getOptions(children), [children]);
  const firstEnabledOption = options.find((option) => !option.disabled);
  const [internalValue, setInternalValue] = useState(defaultValue ?? firstEnabledOption?.value ?? "");
  const [isOpen, setIsOpen] = useState(false);
  const selectedValue = value ?? internalValue;
  const selectedOption = options.find((option) => option.value === selectedValue);

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    function onPointerDown(event: PointerEvent) {
      if (!rootRef.current?.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }

    function onKeyDown(event: globalThis.KeyboardEvent) {
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

  function selectValue(nextValue: string) {
    setInternalValue(nextValue);
    onValueChange?.(nextValue);
    setIsOpen(false);
  }

  function onTriggerKeyDown(event: KeyboardEvent<HTMLButtonElement>) {
    if (event.key === "ArrowDown" || event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      setIsOpen(true);
    }
  }

  return (
    <div className="yuni-select-root" ref={rootRef}>
      <button
        id={buttonId}
        className={cn("yuni-select", invalid && "yuni-select--invalid", className)}
        type="button"
        aria-invalid={invalid}
        aria-haspopup="listbox"
        aria-expanded={isOpen}
        disabled={disabled}
        onClick={() => setIsOpen((currentValue) => !currentValue)}
        onKeyDown={onTriggerKeyDown}
        {...props}
      >
        <span>{selectedOption?.label ?? placeholder}</span>
        <span className="yuni-select__chevron" aria-hidden="true">
          <YuniIcon name="chevronDown" size={16} />
        </span>
      </button>
      <input name={name} value={selectedValue} required={required} type="hidden" />
      {isOpen ? (
        <div className="yuni-select__menu" role="listbox" aria-labelledby={buttonId}>
          {options.map((option) => (
            <button
              key={option.value}
              className="yuni-select__option"
              type="button"
              role="option"
              aria-selected={option.value === selectedValue}
              disabled={option.disabled}
              onClick={() => selectValue(option.value)}
            >
              {option.label}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function getOptions(children: ReactNode): SelectOption[] {
  return Children.toArray(children).flatMap((child) => {
    if (!isValidElement(child)) {
      return [];
    }

    const element = child as ReactElement<OptionElementProps>;
    const rawValue = element.props.value ?? element.props.children;

    return [
      {
        value: String(rawValue ?? ""),
        label: String(element.props.children ?? rawValue ?? ""),
        ...(element.props.disabled !== undefined ? { disabled: element.props.disabled } : {}),
      },
    ];
  });
}
