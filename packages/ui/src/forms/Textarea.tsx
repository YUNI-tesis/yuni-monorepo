import type { TextareaHTMLAttributes } from "react";
import { cn } from "../utils";

export type TextareaProps = TextareaHTMLAttributes<HTMLTextAreaElement> & {
  invalid?: boolean;
};

export function Textarea({ invalid = false, className, ...props }: TextareaProps) {
  return (
    <textarea className={cn("yuni-textarea", invalid && "yuni-textarea--invalid", className)} aria-invalid={invalid} {...props} />
  );
}
