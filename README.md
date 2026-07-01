# Phase 1 — Auth System Deployment

## What this adds

- Local username + password accounts, linked to Patreon membership
- Returning students sign in with username/email + password (no Patreon needed)
- Password reset via Patreon re-auth (no email required)
- All session cookies are httpOnly — JS cannot read them
- Passwords hashed with PBKDF2-SHA256, 210,000 iterations (2024 OWASP recommendation)
- Real-time username availability check during setup
- Rate limiting on all /auth/* routes (10 req/IP/min via RATE_LIMIT_KV)

---

## New pages

| URL | File | Purpose |
| --- | --- | --- |
| `/` | `index.html` | Updated gate — Sign In + Patreon buttons |
| `/login` | `login.html` | Username/email + password login |
| `/setup` | `setup.html` | Username + password creation after Patreon auth |

---

## Step 1 — Create D1 database

```bash
npx wrangler d1 create ttao-academy
```

Copy the `database_id` from the output into `wrangler.toml`.

Then apply the schema:

```bash
npx wrangler d1 execute ttao-academy --file=schema.sql
```

---

## Step 2 — Create R2 bucket (used in Phase 2, bind now)

```bash
npx wrangler r2 bucket create ttao-attachments
```

---

## Step 3 — Update wrangler.toml

Replace the two placeholder IDs:
- `REPLACE_WITH_D1_DATABASE_ID` — from Step 1
- `REPLACE_WITH_YOUR_RATE_LIMIT_KV_NAMESPACE_ID` — from your existing RATE_LIMIT_KV setup

---

## Step 4 — Add bindings in Cloudflare Pages dashboard

Go to: **Pages → ttao-academy → Settings → Functions**

Add these bindings:

| Type | Variable name | Value |
|------|--------------|-------|
| D1 Database | `DB` | ttao-academy |
| R2 Bucket | `BUCKET` | ttao-attachments |
| KV Namespace | `ARTICLES_KV` | (existing) |
| KV Namespace | `RATE_LIMIT_KV` | (existing) |

---

## Step 5 — Set environment variables

Go to: **Pages → ttao-academy → Settings → Environment variables**

| Variable | Value |
|----------|-------|
| `JWT_SECRET` | Long random string (≥ 32 chars). Generate: `openssl rand -base64 32` |
| `JWT_ADMIN_SECRET` | Different long random string |
| `PATREON_CLIENT_ID` | From Patreon developer portal |
| `PATREON_CLIENT_SECRET` | From Patreon developer portal |
| `PATREON_REDIRECT_URI` | `https://ttao-academy.pages.dev/auth/patreon/callback` |
| `PATREON_REDIRECT_URI_ADMIN` | `https://ttao-academy.pages.dev/auth/admin/callback` |
| `PATREON_ADMIN_IDS` | Your Patreon user ID (comma-separated if multiple) |

Set all of the above for **both** Production and Preview environments.

---

## Step 6 — Update Patreon OAuth settings

In your Patreon developer portal, add both redirect URIs:
- `https://ttao-academy.pages.dev/auth/patreon/callback`
- `https://ttao-academy.pages.dev/auth/admin/callback`

---

## Step 7 — CSS

Append `style.additions.css` to the existing `style.css` in your repo root
(the inner academy gate stylesheet). The additions add form styles for
`login.html` and `setup.html`.

---

## Student flows

**New student:**
1. Lands on `/` → clicks "Authenticate via Patreon"
2. Patreon OAuth → `/auth/patreon/callback`
3. D1 stub record created → redirected to `/setup`
4. Chooses username + password → `/api/auth/complete-setup`
5. Session JWT issued → `/dashboard`

**Returning student:**
1. Lands on `/` → clicks "Sign In" → `/login`
2. Enters username or email + password → `POST /api/auth/login`
3. Session JWT issued → `/dashboard`

**Forgot password:**
1. On `/login` → clicks "Forgot password? Reset via Patreon"
2. Patreon OAuth with `state=reset` → `/auth/patreon/callback`
3. Existing account found → `/setup?reset=1`
4. New password chosen → session JWT issued → `/dashboard`

---

## Files changed vs previous version

| File | Change |
|------|--------|
| `functions/_shared/utils.js` | Added PBKDF2 hashing, setup JWT, username validation |
| `functions/auth/patreon.js` | Passes `state` param through for reset flow |
| `functions/auth/patreon/callback.js` | Full rewrite — D1 integration, setup JWT |
| `functions/auth/admin.js` | Unchanged logic, new file location |
| `functions/auth/admin/callback.js` | Now uses shared utils |
| `functions/auth/_middleware.js` | Rate limiting (unchanged) |
| `functions/api/me.js` | Syncs from D1 instead of STUDENTS_KV |
| `functions/api/logout.js` | Unchanged |
| `functions/api/session-refresh.js` | Syncs tier + username from D1 |
| `functions/api/auth/login.js` | **New** — password login |
| `functions/api/auth/setup-info.js` | **New** — setup page data |
| `functions/api/auth/complete-setup.js` | **New** — completes registration |
| `functions/api/auth/check-username.js` | **New** — real-time availability |
| `functions/api/admin/me.js` | Unchanged |
| `functions/api/admin/logout.js` | Unchanged |
| `index.html` | Updated — two auth options |
| `login.html` | **New** |
| `setup.html` | **New** |
| `style.additions.css` | **New** — append to style.css |
| `_redirects` | **New** — Cloudflare Pages routing |
| `_headers` | Updated — login/setup no-cache |
| `wrangler.toml` | Updated — D1 + R2 bindings |
| `schema.sql` | **New** |

## Removed

`STUDENTS_KV` is no longer used — user records now live in D1.
Remove it from `wrangler.toml` and from the Cloudflare Pages dashboard bindings
once you confirm everything is working.
