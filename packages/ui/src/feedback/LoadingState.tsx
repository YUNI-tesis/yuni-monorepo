export type LoadingStateProps = {
  title?: string;
  description?: string;
};

export function LoadingState({ title = "Cargando", description = "Estamos preparando la informacion." }: LoadingStateProps) {
  return (
    <div className="yuni-state" aria-live="polite">
      <span className="yuni-loading-dots" aria-hidden="true">
        <span />
        <span />
        <span />
      </span>
      <h2 className="yuni-state__title">{title}</h2>
      <p className="yuni-state__description">{description}</p>
    </div>
  );
}
