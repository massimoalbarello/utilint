import { Check, Copy } from 'lucide-react';
import { useState } from 'react';
import { Button } from './button';
export function CopyButton({ value, label = 'Copy' }: { value: string; label?: string }) {
  const [status, setStatus] = useState<'idle' | 'copied' | 'failed'>('idle');
  return (
    <Button
      variant="ghost"
      className="copy-button"
      aria-label={label}
      onClick={() => {
        if (!navigator.clipboard) {
          setStatus('failed');
          return;
        }
        void navigator.clipboard.writeText(value).then(
          () => setStatus('copied'),
          () => setStatus('failed'),
        );
      }}
    >
      {status === 'copied' ? <Check size={14} /> : <Copy size={14} />}
      <span>{status === 'copied' ? 'Copied' : status === 'failed' ? 'Copy manually' : label}</span>
    </Button>
  );
}
export function CopyValue({ value, label }: { value: string; label?: string }) {
  return (
    <div className="copy-value">
      <code>{value}</code>
      <CopyButton value={value} label={label} />
    </div>
  );
}
export function Code({ children }: { children: string }) {
  return (
    <div className="code-wrap">
      <CopyButton value={children} />
      <pre>
        <code>{children}</code>
      </pre>
    </div>
  );
}
