import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { createFileRoute } from '@tanstack/react-router';
import { Check, Fingerprint } from 'lucide-react';
import { useState } from 'react';
import { ChatGPTLogin } from '../components/chatgpt-login';
import { AuthLayout } from '../components/layout/public-layout';
import { Button } from '../components/ui/button';
import { Notice } from '../components/ui/feedback';
import { consentOptions, signInForConsent } from '../queries/consent';
import { authorizeApp } from '../queries/mutations';
import { beginChatGPTLogin } from '../queries/providers';

export const Route = createFileRoute('/authorize')({ component: Authorize });
function Authorize() {
  const qc = useQueryClient();
  const options = consentOptions(window.location.search.slice(1));
  const context = useQuery(options);
  const [signup, setSignup] = useState(false);
  const [loginId, setLoginId] = useState<string | null>(null);
  const login = useMutation({
    mutationFn: signInForConsent,
    onSuccess: (url) => {
      qc.clear();
      window.location.assign(url ?? window.location.href);
    },
  });
  const begin = useMutation({
    mutationFn: beginChatGPTLogin,
    onSuccess: (attempt) => setLoginId(attempt.id),
  });
  const consent = useMutation({
    mutationFn: (accept: boolean) =>
      authorizeApp({ accept, scope: context.data?.scopes.join(' ') ?? '' }),
    onSuccess: (url) => window.location.assign(url),
  });
  const data = context.data;
  const step = !data?.signedIn ? 0 : !data.provider ? 1 : 2;
  return (
    <AuthLayout>
      <p className="consent-eyebrow">Connect with utilint</p>
      {context.error ? (
        <>
          <h1>Connection expired or invalid</h1>
          <Notice error>Close this window and start again from the app.</Notice>
        </>
      ) : !data ? (
        <p role="status">Checking your connection…</p>
      ) : (
        <>
          <ol className="consent-steps" aria-label="Connection progress">
            {['Passkey', 'ChatGPT', 'Authorize'].map((label, index) => (
              <li key={label} aria-current={step === index ? 'step' : undefined}>
                <span>{index < step ? <Check size={13} /> : index + 1}</span>
                {label}
              </li>
            ))}
          </ol>
          {!data.signedIn ? (
            <>
              <h1>{signup ? 'Create your utilint account' : `Continue to ${data.name}`}</h1>
              <p>
                Use your ChatGPT subscription in {data.name}. Start with a passkey on your device.
              </p>
              <Button pending={login.isPending} onClick={() => login.mutate(signup)}>
                <Fingerprint size={18} />
                {signup ? 'Create account with a passkey' : 'Sign in with a passkey'}
              </Button>
              <Button variant="link" disabled={login.isPending} onClick={() => setSignup(!signup)}>
                {signup ? 'Already registered? Sign in' : 'New to utilint? Create an account'}
              </Button>
            </>
          ) : !data.provider ? (
            <>
              <h1>Connect your ChatGPT subscription</h1>
              <p>
                {data.name} will use your subscription for its AI features. Your ChatGPT credentials
                stay in utilint.
              </p>
              {loginId ? (
                <ChatGPTLogin
                  loginId={loginId}
                  onClose={() => {
                    setLoginId(null);
                    void qc.invalidateQueries(options);
                  }}
                />
              ) : (
                <Button pending={begin.isPending} onClick={() => begin.mutate()}>
                  Connect ChatGPT
                </Button>
              )}
            </>
          ) : (
            <>
              <h1>
                {data.authorized ? `${data.name} is already authorized` : `Authorize ${data.name}`}
              </h1>
              <p>
                {data.authorized
                  ? 'Your connection is ready. Continue back to the app.'
                  : 'Allow this app to use your ChatGPT subscription to power its AI features.'}
              </p>
              {!data.authorized && (
                <>
                  <ul className="permission-list">
                    {data.scopes.includes('profile') && <li>Identify your utilint account.</li>}
                    {data.scopes.includes('ai:invoke') && (
                      <li>Send model requests using your subscription allowance.</li>
                    )}
                    {data.scopes.includes('offline_access') && (
                      <li>Stay connected between visits.</li>
                    )}
                  </ul>
                  <p className="consent-note">
                    Usage counts toward your ChatGPT limits. Revoke access anytime in utilint.
                  </p>
                </>
              )}
              <Button pending={consent.isPending} onClick={() => consent.mutate(true)}>
                {data.authorized ? `Continue to ${data.name}` : 'Allow connection'}
              </Button>
            </>
          )}
          {(login.error || begin.error || consent.error) && (
            <Notice error>{(login.error || begin.error || consent.error)?.message}</Notice>
          )}
          {data.signedIn && (
            <Button
              variant="ghost"
              disabled={consent.isPending}
              onClick={() => consent.mutate(false)}
            >
              Cancel
            </Button>
          )}
          <p className="consent-footer">Your subscription. Your apps. You're in control.</p>
        </>
      )}
    </AuthLayout>
  );
}
