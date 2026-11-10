# spaceMiner

A browser space mining and automation game: claim drifting asteroid fields, build factory lines, and haul cargo across a shared galaxy.

## Run it locally

```bash
npm install
npm run dev        # http://localhost:3000
```

With no `DATABASE_URL`, pilots live in memory and reset on restart. Use **Test pilot** on the login screen to make throwaway accounts.

## How the galaxy works

- The map is generated from a fixed seed (`src/game/galaxy.ts`), so server and client build the same 12 systems without sending them over the network.
- Each system has 3 to 4 field slots. Fields orbit the sun slowly (one lap takes 6 to 18 hours).
- A pilot claims a free field for 2,400 credits; their rig then mines 25 t/min. Ore mined is worked out from timestamps (`src/game/claims.ts`), so nothing ticks on the server.
- When a field runs dry, a new field with a new name, ore and size spawns in the same slot an hour later.
- Only claims and field generations are stored (`claims`, `field_slots` tables). A unique index allows one open claim per field.

## How haulers work

- Ore mined in Vasko's Reach goes straight into the silo at the Home Foundry. Ore mined anywhere else piles up in that system.
- On the Fleet screen a pilot plots a route by tapping systems linked by lanes, ending at Vasko's Reach, and buys a hauler for it (1,000 credits, up to 5).
- A hauler shuttles forever: load up to 500 t, fly home, unload into the silo, fly back. `src/game/haulers.ts` replays every trip in time order from timestamps, so haulers sharing a system split its ore fairly and nothing ticks on the server.

## Settings (environment variables)

| Name | What it does |
|---|---|
| `DATABASE_URL` | Neon Postgres connection string. Tables are created automatically on first use. |
| `SESSION_SECRET` | Long random string that signs login cookies. Required in production. |
| `ENABLE_DEV_LOGIN` | `true` shows the **Test pilot** button on a deployed site. |

## Layout

| Folder | Contents |
|---|---|
| `src/game` | Game rules shared by server and client (no I/O). Tested with `npm test`. |
| `src/server` | Accounts, sessions and storage (Postgres or in-memory). |
| `src/app` | Next.js pages and API routes. |
| `src/client` | PixiJS map and React HUD. `assets.ts` is the asset layer: every picture is a named slot. |
| `public/assets` | Placeholder pixel art. Swap files here to change the look. |
| `scripts/art` | Python script that regenerates the placeholder art (`npm run art`, needs Pillow + numpy). |

## Checks

```bash
npm test      # game rules
npm run lint  # type check
npm run build
```
