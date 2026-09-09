import { useQueryClient } from '@tanstack/react-query';
import { Link, Outlet, useNavigate } from '@tanstack/react-router';
import { authClient } from '../lib/auth';
import { Brand } from './identity';
import { Button } from './ui/button';
export function Shell() {
  const qc = useQueryClient();
  const navigate = useNavigate();
  return (
    <div className="workspace">
      <header className="workspace-header">
        <Link to="/dashboard">
          <Brand />
        </Link>
        <Button
          variant="ghost"
          onClick={async () => {
            const result = await authClient.signOut();
            if (result.error) return;
            qc.clear();
            await navigate({ to: '/login' });
          }}
        >
          Sign out
        </Button>
      </header>
      <main className="page-content">
        <Outlet />
      </main>
    </div>
  );
}
