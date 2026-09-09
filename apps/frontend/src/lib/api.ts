import { type Treaty, treaty } from '@elysiajs/eden';
import type { App } from '@repo/backend/types';
export const api: Treaty.Create<App> = treaty<App>(window.location.origin);
export async function unwrap<T>(promise: Promise<{ data: T | null; error: unknown }>): Promise<T> {
  const { data, error } = await promise;
  if (error) {
    const problem = error as { value?: { error?: { message?: string }; message?: string } };
    throw new Error(
      problem.value?.error?.message ??
        problem.value?.message ??
        'This request could not be completed.',
    );
  }
  return data as T;
}
