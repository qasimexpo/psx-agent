# Deploying SmartSarmaya

Two things get deployed, and they are independent:

| Piece | Runs on | What it does |
| --- | --- | --- |
| The site | Vercel | Serves pages, reads Neon, runs the two AI tools |
| The pipeline | GitHub Actions | Fetches PSX data and writes to Neon on a schedule |

They only meet at the database. If the pipeline stops, the site keeps serving
the last good data. If the site is down, the pipeline still collects.

---

## 1. Push the branch

The work sits on `rebuild/halal-pipeline-and-site`. From the repository:

```bash
git push -u origin rebuild/halal-pipeline-and-site
```

Vercel deploys **production from your default branch**, which is `master`. So
either merge first:

```bash
git checkout master
git merge rebuild/halal-pipeline-and-site
git push origin master
```

or open a pull request and merge it in GitHub. Until it is on `master`, Vercel
will only build preview deployments.

---

## 2. Create the Vercel project

1. [vercel.com/new](https://vercel.com/new) and import `qasimexpo/psx-agent`.
2. **Set Root Directory to `frontend`.** This is the one setting that is easy
   to miss and it will fail the build if it is wrong. The Python pipeline lives
   at the repository root and must not be part of the site build.
3. Framework preset should auto-detect as Next.js. Leave the build and output
   settings alone.

### Environment variables

Add these under **Settings → Environment Variables**, ticking Production,
Preview and Development for each.

| Name | Value | Notes |
| --- | --- | --- |
| `DATABASE_URL` | your Neon pooled connection string, database `psx_v2` | Secret. Use the **pooled** endpoint, the one with `-pooler` in the host. |
| `GROQ_API_KEY` | `gsk_...` | Secret. Powers the portfolio audit and stock analyser. |
| `GEMINI_API_KEY` | `AIza...` | Secret, optional fallback. See the warning below. |
| `GROQ_MODEL_FAST` | `openai/gpt-oss-20b` | |
| `NEXT_PUBLIC_SITE_URL` | `https://www.smartsarmaya.com` | Must match the domain you actually serve, it drives canonical URLs and the sitemap. |
| `NEXT_PUBLIC_GA_ID` | `G-835C87WVVW` | |
| `NEXT_PUBLIC_ADSENSE_CLIENT` | `ca-pub-7107292781644653` | |
| `NEXT_PUBLIC_ADSENSE_SLOT_TOP` | `5906848623` | |
| `NEXT_PUBLIC_ADSENSE_SLOT_BOTTOM` | `8341440277` | |

> **The Gemini key currently on file is not an API key.** It begins `AQ.`,
> which is an OAuth access token, and the API rejects it with
> `401 ACCESS_TOKEN_TYPE_UNSUPPORTED`. A real key begins `AIza` and comes from
> [aistudio.google.com/apikey](https://aistudio.google.com/apikey). Until it is
> replaced there is no fallback if Groq is unavailable.

> Anything prefixed `NEXT_PUBLIC_` is embedded in the browser bundle. Never put
> a secret behind that prefix.

---

## 3. Point the domain at Vercel

### In Vercel

**Settings → Domains → Add**. Add `www.smartsarmaya.com` and
`smartsarmaya.com`. Vercel will offer to redirect the apex to `www`; accept it.

Vercel then shows a **domain card with the exact records to create**. Use those
values, not the ones below, because they are now per project.

### In Cloudflare

Delete any existing A, AAAA or CNAME records for `@` and `www` that point at
Render, then add:

| Type | Name | Content | Proxy |
| --- | --- | --- | --- |
| `A` | `@` | the IP on your Vercel domain card, commonly `76.76.21.21` | **DNS only** (grey cloud) |
| `CNAME` | `www` | the target on your Vercel domain card, e.g. `d1d4fc829fe7bc7c.vercel-dns-017.com` | **DNS only** (grey cloud) |

Three things that catch people out with Cloudflare:

1. **Turn the proxy off.** The orange cloud blocks Vercel's domain verification
   and certificate issuance. Set both records to DNS only. Leave them that way;
   Vercel already provides a global CDN, so proxying adds a second one for no
   benefit.
2. **If you insist on proxying**, first verify with the proxy off, then set
   Cloudflare **SSL/TLS mode to Full**. Flexible forces plain HTTP to the origin
   and produces `ERR_TOO_MANY_REDIRECTS`.
3. **Check for a CAA record.** If one exists and does not permit Let's Encrypt,
   the certificate will never issue. Either remove it or add
   `letsencrypt.org`.

The `www` CNAME is no longer the old shared `cname.vercel-dns.com`. Each
project gets its own hostname, so copy it from the dashboard.

### Verifying

```bash
nslookup smartsarmaya.com
nslookup www.smartsarmaya.com
```

Propagation is usually minutes on Cloudflare. Vercel's domain card turns green
when it is satisfied, and the certificate issues shortly after.

---

## 4. Schedule the pipeline

**GitHub → Settings → Secrets and variables → Actions → New repository secret:**

- `DATABASE_URL` (the same `psx_v2` string)
- `GROQ_API_KEY`
- `GEMINI_API_KEY`

Optional, to broadcast the brief and picks to a Telegram channel:

- `TELEGRAM_BOT_TOKEN` from [@BotFather](https://t.me/botfather)
- `TELEGRAM_CHANNEL_ID`, for example `@smartsarmaya`, with the bot added as an
  administrator of the channel

Then open the **Actions** tab and enable workflows. Run
**SmartSarmaya pipeline** once by hand with the job set to `health` to confirm
the secrets work.

Two things to know about the schedule:

- **GitHub disables scheduled workflows after 60 days of repository
  inactivity.** If the data goes stale, check this first.
- On a private repository the free allowance is 2,000 minutes a month and the
  current schedule uses roughly 1,100. Making the repository public removes the
  limit. No secrets live in the repository, so this is safe.

---

## 5. After the first deploy

- Visit `/` and confirm prices are present rather than the setup notice.
- Visit `/sitemap.xml` and confirm roughly 350 URLs.
- Submit the sitemap in [Google Search Console](https://search.google.com/search-console).
- Run the portfolio audit once to confirm `GROQ_API_KEY` reached the runtime.
- In AdSense, confirm `ads.txt` is still found at
  `https://www.smartsarmaya.com/ads.txt`.

### Which database

Production data currently sits in **`psx_v2`**, created during the local run.
The older `psx` database still holds the previous schema with data frozen at 13
July 2026, when the Render cron stopped. Nothing reads it any more.

Once the site is live and stable, you can drop `psx` in the Neon console. Do
that only when you are sure you want the old rows gone.

### Rolling back

Vercel keeps every deployment. **Deployments → the previous one → Promote to
Production** restores the old site in seconds without touching the database.
