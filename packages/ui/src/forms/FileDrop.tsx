"use client";

import { useId, useState, type ChangeEvent, type DragEvent, type InputHTMLAttributes } from "react";
import { YuniIcon } from "../icons/YuniIcon";
import { cn } from "../utils";

export type FileDropProps = Omit<InputHTMLAttributes<HTMLInputElement>, "type" | "onChange"> & {
  title?: string;
  description?: string;
  files?: File[];
  onFilesSelected?: (files: File[]) => void;
};

export function FileDrop({
  title = "Arrastra archivos aca",
  description = "Tambien podes seleccionarlos desde tu dispositivo.",
  files,
  onFilesSelected,
  id,
  className,
  ...props
}: FileDropProps) {
  const generatedId = useId();
  const inputId = id ?? generatedId;
  const [isDragging, setIsDragging] = useState(false);
  const [internalFiles, setInternalFiles] = useState<File[]>([]);
  const selectedFiles = files ?? internalFiles;

  function applyFiles(files: File[]) {
    const nextFiles = [...selectedFiles, ...files];
    setInternalFiles(nextFiles);
    onFilesSelected?.(nextFiles);
  }

  function onChange(event: ChangeEvent<HTMLInputElement>) {
    applyFiles(Array.from(event.currentTarget.files ?? []));
    event.currentTarget.value = "";
  }

  function onDragOver(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    setIsDragging(true);
  }

  function onDragLeave() {
    setIsDragging(false);
  }

  function onDrop(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    setIsDragging(false);
    applyFiles(Array.from(event.dataTransfer.files));
  }

  function removeFile(indexToRemove: number) {
    const nextFiles = selectedFiles.filter((_, index) => index !== indexToRemove);
    setInternalFiles(nextFiles);
    onFilesSelected?.(nextFiles);
  }

  return (
    <div
      className={cn("yuni-file-drop", isDragging && "yuni-file-drop--dragging", className)}
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
    >
      <label className="yuni-file-drop__target" htmlFor={inputId}>
        <span className="yuni-file-drop__icon" aria-hidden="true">
          <YuniIcon name="upload" size={28} />
        </span>
        <span className="yuni-file-drop__title">{title}</span>
        <span className="yuni-file-drop__description">{description}</span>
        <span className="yuni-file-drop__action">Seleccionar archivos</span>
      </label>
      {selectedFiles.length > 0 ? (
        <ul className="yuni-file-drop__files" aria-label="Archivos seleccionados">
          {selectedFiles.map((file, index) => (
            <li className="yuni-file-drop__file" key={`${file.name}-${file.size}-${file.lastModified}-${index}`}>
              <span className="yuni-file-drop__file-icon" aria-hidden="true">
                <YuniIcon name="file" size={20} />
              </span>
              <span className="yuni-file-drop__file-info">
                <strong>{file.name}</strong>
                <span>{formatFileSize(file.size)}</span>
              </span>
              <button
                className="yuni-file-drop__remove"
                type="button"
                aria-label={`Eliminar ${file.name}`}
                onClick={() => removeFile(index)}
              >
                <YuniIcon name="close" size={16} />
              </button>
            </li>
          ))}
        </ul>
      ) : null}
      <input
        id={inputId}
        className="yuni-file-drop__input"
        type="file"
        multiple
        onChange={onChange}
        {...props}
      />
    </div>
  );
}

function formatFileSize(size: number): string {
  if (size < 1024) {
    return `${size} B`;
  }

  if (size < 1024 * 1024) {
    return `${(size / 1024).toFixed(1)} KB`;
  }

  return `${(size / 1024 / 1024).toFixed(1)} MB`;
}
