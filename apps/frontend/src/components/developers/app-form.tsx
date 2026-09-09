import { useForm } from '@tanstack/react-form';
import { Button } from '../ui/button';
import { Notice } from '../ui/feedback';
import { Field } from '../ui/field';
import { Input } from '../ui/input';
import { Textarea } from '../ui/textarea';
export function AppForm({
  onSubmit,
  onCancel,
  pending,
  error,
}: {
  onSubmit: (value: { name: string; redirectUris: string[] }) => void;
  onCancel: () => void;
  pending: boolean;
  error: Error | null;
}) {
  const form = useForm({
    defaultValues: { name: '', redirectUris: '' },
    onSubmit: ({ value }) =>
      onSubmit({
        name: value.name.trim(),
        redirectUris: value.redirectUris
          .split('\n')
          .map((line) => line.trim())
          .filter(Boolean),
      }),
  });
  return (
    <form
      className="form-stack"
      onSubmit={(event) => {
        event.preventDefault();
        void form.handleSubmit();
      }}
    >
      <form.Field name="name">
        {(field) => (
          <Field label="Application name" htmlFor="application-name">
            <Input
              id="application-name"
              required
              maxLength={80}
              value={field.state.value}
              onChange={(event) => field.handleChange(event.target.value)}
            />
          </Field>
        )}
      </form.Field>
      <form.Field name="redirectUris">
        {(field) => (
          <Field
            label="Redirect URLs"
            htmlFor="redirect-uris"
            hint="One per line. HTTPS, or HTTP localhost for development."
          >
            <Textarea
              id="redirect-uris"
              aria-describedby="redirect-uris-hint"
              required
              rows={3}
              placeholder="https://your-app.com/auth/utilint/callback"
              value={field.state.value}
              onChange={(event) => field.handleChange(event.target.value)}
            />
          </Field>
        )}
      </form.Field>
      {error && <Notice error>{error.message}</Notice>}
      <div className="form-actions">
        <Button variant="outline" onClick={onCancel}>
          Cancel
        </Button>
        <Button type="submit" pending={pending}>
          Create application
        </Button>
      </div>
    </form>
  );
}
