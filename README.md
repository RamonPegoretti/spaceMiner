# spaceMiner

A browser space mining and automation game: claim drifting asteroid fields, build factory lines, and haul cargo across a shared galaxy.

## Run it locally

```bash
npm install
npm run dev        # http://localhost:3000
```

With no `DATABASE_URL`, pilots live in memory and reset on restart. Use **Test pilot** on the login screen to make throwaway accounts.

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
