import { NextResponse } from 'next/server';
import { exportPilot } from '@/server/account';
import { currentPilot } from '@/server/auth';
import { fail } from '@/server/http';

export const dynamic = 'force-dynamic';

/** Downloads everything stored about the logged-in pilot as JSON. */
export async function GET() {
  const pilot = await currentPilot();
  if (!pilot) return fail(401, 'Not logged in');
  const file = pilot.name.replace(/[^A-Za-z0-9_-]+/g, '-').replace(/^-+|-+$/g, '') || 'pilot';
  return new NextResponse(JSON.stringify(await exportPilot(pilot), null, 2), {
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'content-disposition': `attachment; filename="spaceminer-${file}.json"`,
      'cache-control': 'no-store',
    },
  });
}
