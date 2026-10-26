import { RoomError } from '@/engines/online/room';

export function json(data: unknown, status = 200): Response {
  return Response.json(data, { status, headers: { 'Cache-Control': 'no-store' } });
}

export function errorResponse(e: unknown): Response {
  if (e instanceof RoomError) return json({ error: e.message }, e.status);
  console.error(e);
  return json({ error: 'Something went wrong' }, 500);
}

export async function readJson(req: Request): Promise<Record<string, unknown>> {
  try {
    const body: unknown = await req.json();
    return body && typeof body === 'object' && !Array.isArray(body)
      ? (body as Record<string, unknown>)
      : {};
  } catch {
    throw new RoomError(400, 'Invalid JSON body');
  }
}
