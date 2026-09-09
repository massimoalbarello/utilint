import { useMutation, useQueryClient, useSuspenseQuery } from '@tanstack/react-query';
import { createFileRoute } from '@tanstack/react-router';
import { useState } from 'react';
import { ChatGPTLogin } from '../components/chatgpt-login';
import { Panel } from '../components/panel';
import { Button } from '../components/ui/button';
import { ConfirmAction } from '../components/ui/confirm-action';
import { Empty, Notice } from '../components/ui/feedback';
import { dashboardOptions } from '../queries/dashboard';
import { disconnectProvider, revokeApp } from '../queries/mutations';
import { beginChatGPTLogin } from '../queries/providers';
export const Route = createFileRoute('/_workspace/dashboard')({
  loader: ({ context }) => context.queryClient.ensureQueryData(dashboardOptions),
  component: Dashboard,
});
function Dashboard() {
  const { data } = useSuspenseQuery(dashboardOptions);
  const qc = useQueryClient();
  const [loginId, setLoginId] = useState<string | null>(null);
  const begin = useMutation({
    mutationFn: beginChatGPTLogin,
    onSuccess: (attempt) => setLoginId(attempt.id),
  });
  const disconnect = useMutation({
    mutationFn: disconnectProvider,
    onSuccess: async () => {
      setLoginId(null);
      await qc.invalidateQueries(dashboardOptions);
    },
  });
  const revoke = useMutation({
    mutationFn: revokeApp,
    onSuccess: () => qc.invalidateQueries(dashboardOptions),
  });
  return (
    <>
      <Panel title="ChatGPT">
        {loginId ? (
          <ChatGPTLogin loginId={loginId} onClose={() => setLoginId(null)} />
        ) : data.provider ? (
          <div className="connection-row">
            <div>
              <strong>Connected</strong>
              <p>
                {data.provider.email || 'ChatGPT account'} · {data.provider.plan}
              </p>
            </div>
            <ConfirmAction
              label="Disconnect"
              message="Apps will no longer be able to use your ChatGPT connection."
              pending={disconnect.isPending}
              error={disconnect.error}
              onConfirm={() => disconnect.mutateAsync()}
            />
          </div>
        ) : (
          <div className="connection-row">
            <p>Connect your subscription to use it in your apps.</p>
            <Button pending={begin.isPending} onClick={() => begin.mutate()}>
              Connect ChatGPT
            </Button>
          </div>
        )}
        {begin.error && <Notice error>{begin.error.message}</Notice>}
      </Panel>
      <Panel title="Connected apps">
        {data.connections.length ? (
          data.connections.map((app) => (
            <div className="connection-row" key={app.clientId}>
              <strong>{app.name}</strong>
              <ConfirmAction
                label="Revoke access"
                message={`Revoke ${app.name}’s access?`}
                pending={revoke.isPending}
                error={revoke.error}
                onConfirm={() => revoke.mutateAsync(app.clientId)}
              />
            </div>
          ))
        ) : (
          <Empty
            title="No connected apps"
            description="Apps appear here after you authorize them."
          />
        )}
      </Panel>
    </>
  );
}
