import { useMutation, useQueryClient } from '@tanstack/react-query';
import { type DeveloperApp, developerOptions } from '../../queries/dashboard';
import { deleteApp, rotateAppSecret } from '../../queries/mutations';
import { Panel } from '../panel';
import { ConfirmAction } from '../ui/confirm-action';
import { CopyValue } from '../ui/copy-value';
import { Field } from '../ui/field';
import type { ClientSecret } from './client-secret';
export function DeveloperAppCard({
  app,
  onSecret,
}: {
  app: DeveloperApp;
  onSecret: (secret: ClientSecret) => void;
}) {
  const qc = useQueryClient();
  const rotate = useMutation({
    mutationFn: () => rotateAppSecret(app.client_id),
    onSuccess: (result) =>
      onSecret({ clientId: result.client_id, secret: result.client_secret ?? '' }),
  });
  const remove = useMutation({
    mutationFn: () => deleteApp(app.client_id),
    onSuccess: () => qc.invalidateQueries(developerOptions),
  });
  return (
    <Panel title={app.client_name ?? 'App'}>
      <div className="developer-app">
        <Field label="Client ID">
          <CopyValue value={app.client_id} />
        </Field>
        <Field
          label="Consent URL"
          hint="Use this link in your app, or open it here to connect your own account."
        >
          <CopyValue value={`${window.location.origin}/connect/${app.client_id}`} />
          <a href={`/connect/${app.client_id}`} target="_blank" rel="noreferrer">
            Open consent flow ↗
          </a>
        </Field>
        <Field label="Callback URLs">
          <div className="redirect-list">
            {app.redirect_uris.map((uri) => (
              <code key={uri}>{uri}</code>
            ))}
          </div>
        </Field>
        <div className="actions">
          <ConfirmAction
            label="Rotate secret"
            message="Replace the client secret? The current secret will stop working."
            pending={rotate.isPending}
            error={rotate.error}
            onConfirm={() => rotate.mutateAsync()}
          />
          <ConfirmAction
            label="Delete app"
            message="Delete this app and revoke all its connections?"
            pending={remove.isPending}
            error={remove.error}
            onConfirm={() => remove.mutateAsync()}
          />
        </div>
      </div>
    </Panel>
  );
}
