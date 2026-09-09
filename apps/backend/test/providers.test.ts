import { expect, test } from 'bun:test';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fixture } from './support/fixture';

test('device sign-in is owner/session-bound; provider credentials only reach encrypted storage', async () => {
  const f = await fixture();
  try {
    const alice = await f.user('alice');
    const bob = await f.user('bob');
    const attempt = await f.providers.begin(alice);
    expect(JSON.stringify(attempt)).not.toContain('fixture-private-device-id');
    f.state.now += 6000;
    await expect(f.providers.poll(bob, attempt.id)).rejects.toThrow();
    await expect(f.providers.poll({ ...alice, sessionId: 'wrong' }, attempt.id)).rejects.toThrow();
    expect((await f.providers.poll(alice, attempt.id)).status).toBe('connected');
    const record = await f.repository.credential(alice.ownerId);
    expect(record?.encrypted).toStartWith('v1.');
    expect(f.vault.open(alice.ownerId, record?.encrypted ?? '')).toContain(f.access);
    const disk = (await readFile(join(f.folder, 'app.db'))).toString('utf8');
    for (const value of [f.access, f.refresh, f.secret]) expect(disk).not.toContain(value);
    const publicData = await f.providers.overview(alice.ownerId);
    expect(JSON.stringify(publicData)).not.toContain(f.access);
    expect(await f.providers.overview(bob.ownerId)).toBeNull();
    await f.providers.disconnect(alice.ownerId);
    expect(await f.repository.credential(alice.ownerId)).toBeNull();
    await expect(f.providers.connection(alice.ownerId)).rejects.toThrow('Connect ChatGPT');
    const reconnect = await f.providers.begin(alice);
    f.state.now += 6000;
    expect((await f.providers.poll(alice, reconnect.id)).status).toBe('connected');
  } finally {
    await f.close();
  }
});

test('refresh is serialized and disconnect cannot restore credentials during an in-flight refresh', async () => {
  const f = await fixture();
  try {
    const actor = await f.user('alice');
    const attempt = await f.providers.begin(actor);
    f.state.now += 6000;
    await f.providers.poll(actor, attempt.id);
    f.state.now += 3_600_000;
    // Move the fixture clock to the refreshed token's real expiry basis during the first exchange.
    f.state.onRefresh = async () => {
      f.state.now = Date.now();
    };
    await Promise.all([
      f.providers.connection(actor.ownerId),
      f.providers.connection(actor.ownerId),
    ]);
    expect(f.state.refreshes).toBe(1);
    f.state.now += 3_600_000;
    let release!: () => void;
    let started!: () => void;
    const gate = new Promise<void>((r) => {
      release = r;
    });
    const entered = new Promise<void>((r) => {
      started = r;
    });
    f.state.onRefresh = async () => {
      started();
      await gate;
    };
    const refreshing = f.providers.connection(actor.ownerId);
    await entered;
    const disconnecting = f.providers.disconnect(actor.ownerId);
    release();
    await Promise.all([refreshing, disconnecting]);
    expect(await f.repository.credential(actor.ownerId)).toBeNull();
  } finally {
    await f.close();
  }
});

test('cancelled and expired device authorizations cannot save a connection', async () => {
  const f = await fixture();
  try {
    const actor = await f.user('alice');
    const attempt = await f.providers.begin(actor);
    f.state.now += 6000;
    let release!: () => void;
    let started!: () => void;
    const gate = new Promise<void>((r) => {
      release = r;
    });
    const entered = new Promise<void>((r) => {
      started = r;
    });
    f.state.onPoll = async () => {
      started();
      await gate;
    };
    const polling = f.providers.poll(actor, attempt.id);
    await entered;
    await f.providers.cancelLogin(actor, attempt.id);
    release();
    await expect(polling).rejects.toThrow();
    expect(await f.repository.credential(actor.ownerId)).toBeNull();
    const expired = await f.providers.begin(actor);
    f.state.now += 16 * 60_000;
    await expect(f.providers.poll(actor, expired.id)).rejects.toThrow();
  } finally {
    await f.close();
  }
});
