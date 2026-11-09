import { gameAction } from '@/server/game-route';
import { guardPost, readJson } from '@/server/http';
import { buyHauler } from '@/server/fleet';

/** Buy a hauler for a route: { route: [systemId, ..., home] }. */
export async function POST(req: Request) {
  const bad = guardPost(req);
  if (bad) return bad;
  const { route } = await readJson(req);
  return gameAction((pilotId) => buyHauler(pilotId, route));
}
