# nyaaa.moe

Static pages and a Cloudflare Worker for the nya API, Groq translator, guide progress and certificates.

Production deploys from the `main` branch of `Falkorq/nyaaa-moe` through Cloudflare Workers Builds. Build command: `npm run build`. Deploy command: `npx wrangler deploy`.

The Worker handles `nyaaa.moe/*` and `www.nyaaa.moe/*`. Their DNS records are proxied through Cloudflare and use the originless placeholder `192.0.2.0`. Before migration both records pointed to Netlify at `75.2.60.5` with DNS-only mode.

## Local development

Run `npm ci`, `npx wrangler d1 migrations apply nyaaa-moe --local`, then `npm run dev:cloudflare`. Local D1 data stays in the ignored `.wrangler/` directory. Run `npm test` for the existing API and browser tests.

## Runtime secrets

Set `GROQ_API_KEY` in the Worker's **Settings → Variables and Secrets**, using the Secret type. The translator uses this key only on the server. Optional `CERT_ADMIN_TOKEN` permits certificate deletion. Secrets must never be committed to Git. For local testing, place them in an ignored `.dev.vars` file.

## Database

The `DB` binding points to the `nyaaa-moe` D1 database. `migrations/0001_entries.sql` creates the storage table; keys retain the original `cert/` and `progress/` prefixes. Apply future migrations with `npx wrangler d1 migrations apply nyaaa-moe --remote` before code that requires them.

The Netlify functions are retained for rollback. Public certificates imported from Netlify keep their original IDs and links. Static requests are served by Cloudflare Assets; `/api/*` requests run through the Worker.
