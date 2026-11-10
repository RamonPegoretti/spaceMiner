import 'server-only';
import { NextResponse } from 'next/server';
import type { Pilot } from './pilots';

export type PublicPilot = Pick<Pilot, 'id' | 'name' | 'credits' | 'isTest'>;
export const publicPilot = (p: Pilot): PublicPilot => ({ id: p.id, name: p.name, credits: p.credits, isTest: p.isTest });

export const ok = (data: unknown) => NextResponse.json(data);
export const fail = (status: number, error: string) => NextResponse.json({ error }, { status });

/**
 * Checks a POST came from our own pages: the body must be declared as JSON (a plain
 * cross-site HTML form cannot send that), and if the browser says where the request
 * came from, it must be this site. Returns an error response, or null when fine.
 */
export function guardPost(req: Request): Response | null {
  const type = req.headers.get('content-type') ?? '';
  if (!/^application\/json\b/i.test(type.trim())) return fail(415, 'Send JSON.');
  const origin = req.headers.get('origin');
  if (origin) {
    const host = req.headers.get('x-forwarded-host') ?? req.headers.get('host') ?? new URL(req.url).host;
    let from = '';
    try {
      from = new URL(origin).host;
    } catch {
      /* "null" or junk */
    }
    if (from !== host) return fail(403, 'Requests must come from this site.');
  }
  return null;
}

export async function readJson(req: Request): Promise<Record<string, unknown>> {
  try {
    const body = await req.json();
    return body && typeof body === 'object' && !Array.isArray(body) ? body : {};
  } catch {
    return {};
  }
}
