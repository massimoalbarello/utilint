import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { cancelChatGPTLogin, chatGPTLoginOptions } from '../queries/providers';
import { Button, Notice } from './ui';
export function ChatGPTLogin({ loginId, onClose }: { loginId: string; onClose: () => void }) {
  const qc = useQueryClient();
  const query = useQuery(chatGPTLoginOptions(loginId, qc));
  const cancel = useMutation({ mutationFn: () => cancelChatGPTLogin(loginId), onSuccess: onClose });
  const [copied, setCopied] = useState(false);
  if (query.error || query.data?.status === 'failed')
    return (
      <div className="stack">
        <Notice error>{query.error?.message ?? 'Sign-in failed.'}</Notice>
        <Button variant="outline" onClick={onClose}>
          Try again
        </Button>
      </div>
    );
  if (!query.data) return <p>Preparing sign-in…</p>;
  if (query.data.status === 'connected')
    return (
      <div className="actions">
        <span>ChatGPT connected.</span>
        <Button variant="outline" onClick={onClose}>
          Done
        </Button>
      </div>
    );
  const { userCode, verificationUrl } = query.data;
  return (
    <div className="stack">
      <p>Paste this code on OpenAI’s page and approve access.</p>
      <output className="device-code" aria-label="ChatGPT sign-in code">
        {userCode}
      </output>
      <div className="actions">
        <a
          className="button"
          href={verificationUrl}
          target="_blank"
          rel="noreferrer"
          onClick={() => {
            void navigator.clipboard?.writeText(userCode).then(
              () => setCopied(true),
              () => setCopied(false),
            );
          }}
        >
          Copy code &amp; open ChatGPT
        </a>
        <Button variant="ghost" pending={cancel.isPending} onClick={() => cancel.mutate()}>
          Cancel
        </Button>
      </div>
      {copied && <small role="status">Code copied. This tab connects automatically.</small>}
      <details>
        <summary>OpenAI calls this “Codex CLI”</summary>
        <p>
          It uses the Codex allowance included in your ChatGPT plan. No installation is needed. If
          asked, enable device-code login in ChatGPT Settings → Security.
        </p>
      </details>
      {cancel.error && <Notice error>{cancel.error.message}</Notice>}
    </div>
  );
}
