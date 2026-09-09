import { useState } from 'react';
import { Button } from './button';
import { Notice } from './feedback';
export function ConfirmAction({
  label,
  message,
  pending,
  error,
  onConfirm,
}: {
  label: string;
  message: string;
  pending: boolean;
  error?: Error | null;
  onConfirm: () => Promise<unknown>;
}) {
  const [confirm, setConfirm] = useState(false);
  if (!confirm)
    return (
      <Button variant="ghost" onClick={() => setConfirm(true)}>
        {label}
      </Button>
    );
  return (
    <div className="stack">
      <p>{message}</p>
      {error && <Notice error>{error.message}</Notice>}
      <div className="actions">
        <Button variant="outline" disabled={pending} onClick={() => setConfirm(false)}>
          Cancel
        </Button>
        <Button
          variant="destructive"
          pending={pending}
          onClick={() =>
            void onConfirm().then(
              () => setConfirm(false),
              () => {},
            )
          }
        >
          {label}
        </Button>
      </div>
    </div>
  );
}
