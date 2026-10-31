import 'server-only';
import { NextResponse } from 'next/server';
import type { Pilot } from './pilots';

export type PublicPilot = Pick<Pilot, 'id' | 'name' | 'credits' | 'isTest'>;
export const publicPilot = (p: Pilot): PublicPilot => ({ id: p.id, name: p.name, credits: p.credits, isTest: p.isTest });

export const ok = (data: unknown) => NextResponse.json(data);
export const fail = (status: number, error: string) => NextResponse.json({ error }, { status });

export async function readJson(req: Request): Promise<Record<string, unknown>> {
  try {
    const body = await req.json();
    return body && typeof body === 'object' ? body : {};
  } catch {
    return {};
  }
}
