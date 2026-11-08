import { gameAction } from '@/server/game-route';

export const dynamic = 'force-dynamic';

/** The changing state of the galaxy and the pilot's ore. The client polls this. */
export const GET = () => gameAction();
