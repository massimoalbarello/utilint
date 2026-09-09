import { useMutation, useQueryClient, useSuspenseQuery } from '@tanstack/react-query';
import { createFileRoute } from '@tanstack/react-router';
import { Plus } from 'lucide-react';
import { useState } from 'react';
import { DeveloperAppCard } from '../components/developers/app-card';
import { AppForm } from '../components/developers/app-form';
import { type ClientSecret, ClientSecretCard } from '../components/developers/client-secret';
import { Button, Card, CopyValue, Empty, PageHeader } from '../components/ui';
import { developerOptions } from '../queries/dashboard';
import { registerApp } from '../queries/mutations';
export const Route = createFileRoute('/_workspace/developers')({
  loader: ({ context }) => context.queryClient.ensureQueryData(developerOptions),
  component: Developers,
});
function Developers() {
  const { data } = useSuspenseQuery(developerOptions);
  const [creating, setCreating] = useState(false);
  const [secret, setSecret] = useState<ClientSecret | null>(null);
  const qc = useQueryClient();
  const create = useMutation({
    mutationFn: registerApp,
    onSuccess: async (result) => {
      setSecret({ clientId: result.client_id, secret: result.client_secret ?? '' });
      setCreating(false);
      await qc.invalidateQueries(developerOptions);
    },
  });
  return (
    <>
      <PageHeader
        title="Developers"
        action={
          !creating && (
            <Button onClick={() => setCreating(true)}>
              <Plus size={16} />
              Register an app
            </Button>
          )
        }
      />
      {secret && <ClientSecretCard value={secret} onClose={() => setSecret(null)} />}
      {creating && (
        <Card title="Register an app">
          <AppForm
            onSubmit={(value) => create.mutate(value)}
            onCancel={() => setCreating(false)}
            pending={create.isPending}
            error={create.error}
          />
        </Card>
      )}
      {data?.length
        ? data.map((app) => <DeveloperAppCard key={app.client_id} app={app} onSecret={setSecret} />)
        : !creating && (
            <section className="panel">
              <Empty
                title="No registered apps"
                description="Register an app to get an OAuth client ID and secret."
              />
            </section>
          )}
      <details className="integration">
        <summary>Integration</summary>
        <div className="stack">
          <p>Use authorization code + PKCE from your app’s backend.</p>
          <div>
            Authorization endpoint
            <CopyValue value={`${window.location.origin}/api/auth/oauth2/authorize`} />
          </div>
          <div>
            Token endpoint
            <CopyValue value={`${window.location.origin}/api/auth/oauth2/token`} />
          </div>
          <div>
            Resource and OpenAI SDK base URL
            <CopyValue value={`${window.location.origin}/v1`} />
          </div>
          <div>
            Scopes
            <CopyValue value="profile ai:invoke offline_access" />
          </div>
          <p>
            Send the user’s Utilint access token as Bearer authorization. Keep your client secret on
            your backend.
          </p>
        </div>
      </details>
    </>
  );
}
