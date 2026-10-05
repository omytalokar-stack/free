# SiteSeller Agent

SiteSeller Agent is a React + Vite dashboard with Vercel serverless APIs for discovering local businesses without listed websites, ranking them with Gemini, generating public demo sites, and sending personalized outreach through Resend.

## Initial setup

To create a fresh copy from scratch:

```powershell
npm create vite@latest siteseller-agent -- --template react-ts
cd siteseller-agent
npm install
npm install lucide-react mongoose @google/genai resend
npm install -D tailwindcss@^3 postcss autoprefixer @tailwindcss/forms @vercel/node vercel
npx tailwindcss init -p
```

This repository already includes that project setup. From its root, install the dependencies and create your local environment file:

```powershell
npm install
if (!(Test-Path .env.local)) { Copy-Item .env.example .env.local }
```

Fill in `.env.local` using the setup steps below. Do not commit it. To run the serverless API routes and Vite app together locally:

```powershell
npm run vercel:dev
```

Open the local URL printed by Vercel. `npm run dev` runs the frontend only; API-backed dashboard actions require `vercel dev`.

## Configure MongoDB Atlas

1. Create an Atlas cluster and database, create a database user, and allow network access from your deployment (use Atlas's Vercel integration or an appropriately restricted IP access list).
2. Copy the cluster's `mongodb+srv://` connection string into `MONGODB_URI` in `.env.local`, replacing the username, password, and database name. URL-encode special characters in the username or password. Never add the URI to a `VITE_` variable or browser code.
3. On first connection, Mongoose creates the four application collections and their indexes: `Prospect`, `LeadConfig`, `GeneratedSite`, and `OutreachLog`. The workspace configuration is stored as the `current` document in `LeadConfig`. Database connection settings and models live in `api/_lib/db.ts` and `api/_lib/models.ts`.

The collections use the following document fields:

- `Prospect`: `business_name`, `category`, `city`, `phone`, `email`, `website_url`, `has_website`, `lead_score`, `review_count`, `status`, `created_at`, `place_id`.
- `LeadConfig`: `target_city`, `target_country`, `business_niche`, `max_leads_per_day`, `sender_name`, `sender_email`, `physical_mailing_address`.
- `GeneratedSite`: `prospect_id`, `demo_url`, `preview_screenshot`, `generated_date`, `business_name`, `category`, `city`, `content`.
- `OutreachLog`: `prospect_id`, `email_subject`, `sent_date`, `reply_received`, `reply_text`, `status`.

## Configure AI, Places, email, and sign-in

1. Create a Gemini API key in [Google AI Studio](https://aistudio.google.com/apikey) and set `GEMINI_API_KEY`.
2. In Google Cloud Console, enable **Places API (New)**, create an API key, and set `GOOGLE_PLACES_API_KEY`. Restrict the key to Places API and suitable server-side usage.
3. Sign up at [Resend](https://resend.com/signup). In the Resend dashboard, open **API Keys**, create an API key, and copy it into `RESEND_API_KEY` in `.env.local`. Treat the key like a password. Under **Domains**, add a domain you control and follow the DNS verification instructions. Once verified, set `RESEND_FROM_EMAIL` to a sender address on that domain, for example `SiteSeller <hello@example.com>`. The configured sender must be permitted by Resend; `sender_email` in workspace settings is the reply-to address.
4. Set `APP_URL` to the public origin of your app without a trailing slash.
5. Set `SITESELLER_ADMIN_PASSWORD` to a unique password of at least 16 characters. Set `SITESELLER_SESSION_SECRET` and `OUTREACH_SECRET` to separate random secrets of at least 32 characters each. On PowerShell, generate random values with:

   ```powershell
   [Convert]::ToBase64String([Security.Cryptography.RandomNumberGenerator]::GetBytes(48))
   ```

6. `REPLY_WEBHOOK_SECRET` is required only when connecting a trusted inbound-reply service. Configure that service to POST JSON `{ "prospect_id": "...", "reply_text": "..." }` to `/api/replies` with `Authorization: Bearer <REPLY_WEBHOOK_SECRET>`. A successful callback changes the prospect to `replied` and records the reply on its latest outreach log.

Add the Resend values to `.env.local` (do not commit that file):

```dotenv
RESEND_API_KEY=re_your_actual_api_key
RESEND_FROM_EMAIL=SiteSeller <hello@your-verified-domain.com>
```

The app's admin APIs require a signed, HTTP-only, `SameSite=Strict` session cookie. Demo URLs and signed unsubscribe links are public. Keep the MongoDB URI and all provider keys in local `.env.local` and Vercel's encrypted project environment variables—never in frontend variables.

## Run the pipeline

1. Sign in with `SITESELLER_ADMIN_PASSWORD` and open **Configure**.
2. Enter the target city, country, business niche, and daily lead limit. Sender identity and a valid physical mailing address are needed only when you configure email outreach.
3. Select **Run pipeline**. It searches Google Places for up to five new businesses per run (up to the daily limit), excludes listings with a website, scores prospects with Gemini, and creates a public `/demo/:id` concept site for each new prospect.
4. Places does not provide business email addresses. Independently verify a business email, then use **+ Add verified email** in the prospect list.
5. Review a generated demo and click **Send Pitch Email** beside that specific demo. Confirm the recipient to send one email. Pipeline runs never send emails, and sent pitches cannot be sent again. Each email contains the demo link, configured mailing address, and a signed unsubscribe link. Unsubscribing changes the prospect's status to `opted-out`.
6. Replies can update the prospect through the optional trusted inbound-email webhook described above.

Pitch emails use a concise first-person note: they say the sender came across the business, could not find a website linked to its listing, and prepared a tailored concept, then invite the recipient to view the draft. The message does not mention AI or automation.

Each pipeline run processes up to five businesses to keep AI requests within the serverless runtime limit. Prospects are saved before demo generation so failed generations can be retried on later runs, including when the daily discovery limit has been reached. Gemini generation retries transient service errors and falls back from `gemini-3.8-flash` to `gemini-3.5-flash-lite` if the primary model is unavailable or overloaded. Resend and sender details are only required when you manually send an email; the pipeline never sends one. Missing credentials, provider failures, invalid settings, and per-prospect generation errors are reported.

## Deploy to Vercel

```powershell
npx vercel
```

Add all required environment variables in the Vercel project settings, including the production `APP_URL`, then deploy:

```powershell
npx vercel --prod
```

Use the same project root, Vite output (`dist`), and serverless `api/` functions. Add `MONGODB_URI` and all AI, Places, Resend, session, and unsubscribe secrets as Vercel server-side environment variables. In Atlas, allow connections from the deployed Vercel functions using an appropriately scoped network access policy.

## Useful commands

```powershell
npm run dev
npm run vercel:dev
npm run typecheck
npm run build
```

`npm run dev` serves just the Vite frontend; use `npm run vercel:dev` to exercise the MongoDB-backed APIs locally.
