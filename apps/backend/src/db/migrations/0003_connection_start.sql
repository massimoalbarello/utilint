CREATE TABLE developer_connection_start (
  clientId TEXT PRIMARY KEY REFERENCES auth_oauthClient(clientId) ON DELETE CASCADE,
  url TEXT NOT NULL
);
