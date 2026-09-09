import { Check, Copy } from 'lucide-react';
import { useState } from 'react';
import { Button } from './button';

function CopyButton({ value }: { value: string }) {
  const [status, setStatus] = useState<'idle' | 'copied' | 'failed'>('idle');
  return (
    <Button
      variant="ghost"
      aria-label="Copy"
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
      <span>{status === 'copied' ? 'Copied' : status === 'failed' ? 'Copy manually' : 'Copy'}</span>
    </Button>
  );
}
export function CopyValue({ value }: { value: string }) {
  return (
    <div className="copy-value">
      <code>{value}</code>
      <CopyButton value={value} />
    </div>
  );
}
