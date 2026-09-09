import { Button, Card, CopyValue, Field } from '../ui';
export type ClientSecret = { clientId: string; secret: string };
export function ClientSecretCard({ value, onClose }: { value: ClientSecret; onClose: () => void }) {
  return (
    <Card title="Save your client secret" className="secret-panel">
      <p>Shown once. Store it in your app’s backend.</p>
      <Field label="Client ID">
        <CopyValue value={value.clientId} />
      </Field>
      <Field label="Client secret">
        <CopyValue value={value.secret} />
      </Field>
      <div>
        <Button variant="outline" onClick={onClose}>
          I’ve saved it
        </Button>
      </div>
    </Card>
  );
}
