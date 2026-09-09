export type Actor = { ownerId: string; clientId: string };
export type LoginActor = { ownerId: string; sessionId: string };
export type Credential = { encrypted: string; connectedAt: number };
export type Connection = { clientId: string; name: string };

export class AppError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
  ) {
    super(message);
  }
}

export const textModel = (model: string) => /^[a-zA-Z0-9][a-zA-Z0-9._:-]{0,99}$/.test(model);
