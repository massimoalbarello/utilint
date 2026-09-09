CREATE TABLE provider_credential (
  ownerId TEXT PRIMARY KEY REFERENCES auth_user(id) ON DELETE CASCADE,
  encrypted TEXT NOT NULL CHECK (encrypted LIKE 'v1.%'),
  connectedAt INTEGER NOT NULL
);
