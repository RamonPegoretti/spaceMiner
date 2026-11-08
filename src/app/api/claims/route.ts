import { gameAction } from '@/server/game-route';
import { readJson } from '@/server/http';
import { claimField } from '@/server/world';

/** Claim a free asteroid field: { slot }. */
export async function POST(req: Request) {
  const { slot } = await readJson(req);
  return gameAction((pilotId) => claimField(pilotId, String(slot ?? '')));
}
