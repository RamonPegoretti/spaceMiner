import { gameAction } from '@/server/game-route';
import { guardPost, readJson } from '@/server/http';
import { claimField } from '@/server/world';

/** Claim a free asteroid field: { slot }. */
export async function POST(req: Request) {
  const bad = guardPost(req);
  if (bad) return bad;
  const { slot } = await readJson(req);
  return gameAction((pilotId) => claimField(pilotId, String(slot ?? '')));
}
