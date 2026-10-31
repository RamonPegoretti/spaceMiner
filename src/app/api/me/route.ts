import { currentPilot } from '@/server/auth';
import { fail, ok, publicPilot } from '@/server/http';

export async function GET() {
  const pilot = await currentPilot();
  return pilot ? ok({ pilot: publicPilot(pilot) }) : fail(401, 'Not logged in');
}
