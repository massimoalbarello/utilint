import { useForm } from '@tanstack/react-form';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { type DeveloperApp, developerOptions } from '../../queries/dashboard';
import { updateAppStart } from '../../queries/mutations';
import { Button } from '../ui/button';
import { Notice } from '../ui/feedback';
import { Field } from '../ui/field';
import { Input } from '../ui/input';

export function ConnectionSetup({ app }: { app: DeveloperApp }) {
  const qc = useQueryClient();
  const save = useMutation({
    mutationFn: (url: string) => updateAppStart(app.client_id, url),
    onSuccess: () => qc.invalidateQueries(developerOptions),
  });
  const form = useForm({
    defaultValues: { startUrl: app.startUrl ?? '' },
    onSubmit: ({ value }) => save.mutate(value.startUrl.trim()),
  });
  return (
    <details open={!app.startUrl || undefined}>
      <summary>Connection setup</summary>
      <form
        className="form-stack"
        onSubmit={(event) => {
          event.preventDefault();
          void form.handleSubmit();
        }}
      >
        <form.Field name="startUrl">
          {(field) => (
            <Field
              label="Connection start URL"
              htmlFor={`start-${app.client_id}`}
              hint="Your backend endpoint that starts a connection for the current user. Use the same origin as a redirect URL."
            >
              <Input
                id={`start-${app.client_id}`}
                type="url"
                required
                placeholder="https://your-app.com/auth/utilint/start"
                value={field.state.value}
                onChange={(event) => field.handleChange(event.target.value)}
              />
            </Field>
          )}
        </form.Field>
        {save.error && <Notice error>{save.error.message}</Notice>}
        <Button type="submit" pending={save.isPending}>
          Save connection setup
        </Button>
      </form>
    </details>
  );
}
