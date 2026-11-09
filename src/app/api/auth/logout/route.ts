import { endSession } from '@/server/auth';
import { guardPost, ok } from '@/server/http';

/** Logs out on every device: all copies of the login cookie stop working. */
export async function POST(req: Request) {
  const bad = guardPost(req);
  if (bad) return bad;
  await endSession();
  return ok({ ok: true });
}
