import { describe, it, expect } from 'vitest';
import { MemoryRoomStore, updateRoom } from '../src/lib/roomStore';
import { createRoom, joinRoom, playMove } from '../src/engines/chess/room';

function fresh() {
  return createRoom({ id: 'room0001', timeControlId: 'untimed', token: 'tok-w', color: 'w', now: 1 });
}

describe('MemoryRoomStore', () => {
  it('creates once and reads back a copy', async () => {
    const store = new MemoryRoomStore();
    expect(await store.create(fresh())).toBe(true);
    expect(await store.create(fresh())).toBe(false); // id taken
    const a = await store.get('room0001');
    const b = await store.get('room0001');
    expect(a).toEqual(b);
    expect(a).not.toBe(b);
    expect(await store.get('missing')).toBeNull();
  });

  it('compareAndSet only succeeds with the current version', async () => {
    const store = new MemoryRoomStore();
    const room = fresh();
    await store.create(room);
    const next = { ...room, version: 2 };
    expect(await store.compareAndSet(next, 1)).toBe(true);
    expect(await store.compareAndSet({ ...room, version: 3 }, 1)).toBe(false); // stale
    expect((await store.get('room0001'))!.version).toBe(2);
    expect(await store.compareAndSet({ ...room, id: 'nope', version: 2 }, 1)).toBe(false);
  });
});

describe('updateRoom', () => {
  it('applies the change and returns the new room', async () => {
    const store = new MemoryRoomStore();
    await store.create(fresh());
    const room = await updateRoom(store, 'room0001', (r) => joinRoom(r, null, 'tok-b').room);
    expect(room!.seats.b).toBe('tok-b');
    expect((await store.get('room0001'))!.version).toBe(2);
  });

  it('skips the write when the function returns the same room', async () => {
    const store = new MemoryRoomStore();
    await store.create(fresh());
    const room = await updateRoom(store, 'room0001', (r) => r);
    expect(room!.version).toBe(1);
  });

  it('returns null for a missing room', async () => {
    expect(await updateRoom(new MemoryRoomStore(), 'missing', (r) => r)).toBeNull();
  });

  it('retries when another writer gets in first', async () => {
    const store = new MemoryRoomStore();
    await store.create(fresh());
    const base = (await store.get('room0001'))!;
    const joined = joinRoom(base, null, 'tok-b').room; // version 2

    // Wrap the store so a competing write lands right after our first read.
    let interfered = false;
    const racing = {
      get: (id: string) => store.get(id),
      create: (r: typeof base) => store.create(r),
      compareAndSet: async (r: typeof base, v: number) => {
        if (!interfered) {
          interfered = true;
          await store.compareAndSet(joined, 1);
        }
        return store.compareAndSet(r, v);
      },
    };

    // Our update plays e4; it must be re-applied on top of the competing join.
    const result = await updateRoom(racing, 'room0001', (r) =>
      r.seats.b ? playMove(r, 'tok-w', { from: 'e2', to: 'e4' }, 5) : { ...r, version: r.version + 1 },
    );
    expect(result!.seats.b).toBe('tok-b'); // the competing write survived
    expect(result!.version).toBeGreaterThanOrEqual(3);
  });

  it('gives up with a 503 after too many conflicts', async () => {
    const store = new MemoryRoomStore();
    await store.create(fresh());
    const alwaysConflict = {
      get: (id: string) => store.get(id),
      create: (r: ReturnType<typeof fresh>) => store.create(r),
      compareAndSet: async () => false,
    };
    await expect(updateRoom(alwaysConflict, 'room0001', (r) => ({ ...r, version: r.version + 1 }))).rejects.toMatchObject({ status: 503 });
  });
});