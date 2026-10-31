import { endSession } from '@/server/auth';
import { ok } from '@/server/http';

export async function POST() {
  await endSession();
  return ok({ ok: true });
}
