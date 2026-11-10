# Security

## Reporting a problem

Found a vulnerability or a way to cheat the shared galaxy? Please email [[CONTACT_EMAIL]] instead of opening a public issue. Say what you found and how to reproduce it. We will reply as soon as we can.

## If you suspect a leak

Act first, investigate second:

1. **Rotate `SESSION_SECRET`** in the Vercel project settings (Production) and redeploy. This logs every pilot out and makes any stolen login cookie useless.
2. **Rotate the Neon database password** (Neon console, or through the Vercel Neon integration) and make sure `DATABASE_URL` in Vercel uses the new one. Redeploy.
3. **Check the logs**: Vercel runtime logs for unusual requests (many logins, `/api/account/*`, errors), and the Neon console for unexpected connections or queries.
4. If a single pilot is affected, logging out with **Log out on all devices** (or bumping their `session_version` in the `pilots` table) revokes all of their sessions.

## Do we have to tell anyone?

If account data (emails or password hashes) may have leaked:

- Notify the competent data protection authority **within 72 hours** of finding out: [[authority: FDPIC for Switzerland / EU DPA of the operator's country]].
- Email the affected players, saying what happened, what data was involved, and what they should do (for example change the password if they reused it elsewhere).

If only game data was involved (credits, claims, factories) and no personal data, no notification is needed, but still write it down.

## Keep a record

For every incident, write a short note: when it was found, what happened, what data was involved, who was affected, what was done, and whether the authority and players were told. Keep it even when no notification was needed.
