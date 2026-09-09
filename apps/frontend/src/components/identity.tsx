export function Brand() {
  return <span className="wordmark">utilint</span>;
}
export function AppIcon({ name }: { name: string }) {
  return (
    <span className="app-icon" aria-hidden="true">
      {name.slice(0, 1).toUpperCase()}
    </span>
  );
}
