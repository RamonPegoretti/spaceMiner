import { fail, readJson } from '@/server/http';
import { gameAction } from '@/server/game-route';
import { scrapHauler } from '@/server/fleet';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Scrap a hauler for half its price: { id }. Cargo already on board still arrives. */
export async function POST(req: Request) {
  const { id } = await readJson(req);
  if (typeof id !== 'string' || !UUID.test(id)) return fail(400, 'Unknown hauler.');
  return gameAction((pilotId) => scrapHauler(pilotId, id));
}
