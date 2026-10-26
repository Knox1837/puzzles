import { RoomError, type Room } from '@/engines/online/room';

/**
 * Persistence for rooms. Three primitives are enough to make every update
 * safe against two requests arriving at once (see updateRoom).
 */
export interface RoomStore {
  get(id: string): Promise<Room | null>;
  /** Insert a new room. Returns false if the id is already taken. */
  create(room: Room): Promise<boolean>;
  /** Save `room` only if the stored version still equals `expectedVersion`. */
  compareAndSet(room: Room, expectedVersion: number): Promise<boolean>;
}

/** Single-process store for local development and tests. Not shared between server instances. */
export class MemoryRoomStore implements RoomStore {
  private rooms = new Map<string, string>();

  async get(id: string): Promise<Room | null> {
    const raw = this.rooms.get(id);
    return raw ? (JSON.parse(raw) as Room) : null;
  }

  async create(room: Room): Promise<boolean> {
    if (this.rooms.has(room.id)) return false;
    this.rooms.set(room.id, JSON.stringify(room));
    return true;
  }

  // No awaits inside, so the check and the write cannot be interleaved.
  async compareAndSet(room: Room, expectedVersion: number): Promise<boolean> {
    const raw = this.rooms.get(room.id);
    if (!raw) return false;
    if ((JSON.parse(raw) as Room).version !== expectedVersion) return false;
    this.rooms.set(room.id, JSON.stringify(room));
    return true;
  }
}

const TTL_SECONDS = 60 * 60 * 24; // rooms expire a day after their last change

// Both scripts run atomically inside Redis.
export const CREATE_SCRIPT = `
if redis.call('EXISTS', KEYS[1]) == 1 then return 0 end
redis.call('HSET', KEYS[1], 'data', ARGV[1], 'version', ARGV[2])
redis.call('EXPIRE', KEYS[1], ARGV[3])
return 1`;

export const CAS_SCRIPT = `
if redis.call('HGET', KEYS[1], 'version') ~= ARGV[1] then return 0 end
redis.call('HSET', KEYS[1], 'data', ARGV[2], 'version', ARGV[3])
redis.call('EXPIRE', KEYS[1], ARGV[4])
return 1`;

/** The subset of the Redis clients we use. */
export interface RedisLike {
  eval(script: string, keys: string[], args: unknown[]): Promise<unknown>;
  hget(key: string, field: string): Promise<unknown>;
}

export class RedisRoomStore implements RoomStore {
  constructor(private redis: RedisLike) {}

  private key(id: string) {
    return `room:${id}`;
  }

  async get(id: string): Promise<Room | null> {
    const raw = await this.redis.hget(this.key(id), 'data');
    if (raw === null || raw === undefined) return null;
    return (typeof raw === 'string' ? JSON.parse(raw) : raw) as Room;
  }

  async create(room: Room): Promise<boolean> {
    const res = await this.redis.eval(
      CREATE_SCRIPT,
      [this.key(room.id)],
      [JSON.stringify(room), String(room.version), String(TTL_SECONDS)],
    );
    return Number(res) === 1;
  }

  async compareAndSet(room: Room, expectedVersion: number): Promise<boolean> {
    const res = await this.redis.eval(
      CAS_SCRIPT,
      [this.key(room.id)],
      [String(expectedVersion), JSON.stringify(room), String(room.version), String(TTL_SECONDS)],
    );
    return Number(res) === 1;
  }
}

const globalForStore = globalThis as unknown as { __roomStore?: RoomStore };

/** Replace the store (tests) or clear it with undefined. */
export function setStore(store: RoomStore | undefined): void {
  globalForStore.__roomStore = store;
}

export async function getStore(): Promise<RoomStore> {
  if (globalForStore.__roomStore) return globalForStore.__roomStore;

  // 1. Upstash over HTTP (Vercel Marketplace integration, either naming).
  const restUrl = process.env.UPSTASH_REDIS_REST_URL ?? process.env.KV_REST_API_URL;
  const restToken = process.env.UPSTASH_REDIS_REST_TOKEN ?? process.env.KV_REST_API_TOKEN;
  // 2. Any standard Redis server over TCP (Redis Cloud, etc.).
  const redisUrl = process.env.REDIS_URL ?? process.env.KV_URL;

  if (restUrl && restToken) {
    const { Redis } = await import('@upstash/redis');
    // Keep values as plain strings; we do our own JSON handling.
    const redis = new Redis({ url: restUrl, token: restToken, automaticDeserialization: false });
    globalForStore.__roomStore = new RedisRoomStore(redis as unknown as RedisLike);
  } else if (redisUrl) {
    const { Redis: IORedis } = await import('ioredis');
    // One connection per server instance, reused across requests.
    const client = new IORedis(redisUrl, { maxRetriesPerRequest: 3, connectTimeout: 5000 });
    client.on('error', (err: Error) => console.error('Redis connection error:', err.message));
    globalForStore.__roomStore = new RedisRoomStore({
      eval: (script, keys, args) => client.eval(script, keys.length, ...keys, ...args.map(String)),
      hget: (key, field) => client.hget(key, field),
    });
  } else if (process.env.VERCEL) {
    throw new RoomError(
      503,
      'Online play is not set up yet: connect a Redis database (Upstash or Redis Cloud) to this project and redeploy.',
    );
  } else {
    globalForStore.__roomStore = new MemoryRoomStore();
  }
  return globalForStore.__roomStore;
}

/**
 * Read-modify-write with optimistic concurrency: if someone else changed the
 * room in between, re-read and re-apply. `fn` must be pure and may run more than
 * once. Return the same object to signal "no change" and skip the write.
 */
export async function updateRoom(
  store: RoomStore,
  id: string,
  fn: (room: Room) => Room,
): Promise<Room | null> {
  for (let attempt = 0; attempt < 6; attempt++) {
    const room = await store.get(id);
    if (!room) return null;
    const next = fn(room);
    if (next === room) return room;
    if (await store.compareAndSet(next, room.version)) return next;
  }
  throw new RoomError(503, 'The game is busy, please try again');
}
