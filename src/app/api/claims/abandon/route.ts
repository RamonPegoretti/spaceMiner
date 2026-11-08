import { fail } from '@/server/http';
import { gameAction } from '@/server/game-route';
import { readJson } from '@/server/http';
import { abandonClaim } from '@/server/world';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Stop mining a field you claimed: { id }. The credits are not refunded. */
export async function POST(req: Request) {
  const { id } = await readJson(req);
  if (typeof id !== 'string' || !UUID.test(id)) return fail(400, 'Unknown claim.');
  return gameAction((pilotId) => abandonClaim(pilotId, id));
}
