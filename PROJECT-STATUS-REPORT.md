# SiteSeller Agent - Project Status Report

**Checked:** October 5, 2026
**Local app:** `http://localhost:3000/` (Vercel local development server)
**Purpose:** Explain what the app does, how it is built, what has been verified, and what still needs setup.

## Executive summary

SiteSeller Agent is a local-business prospecting and demo-site tool. It can find businesses listed without a website, score them with Gemini, save prospect records, and generate a public concept website for each selected prospect.

The current local setup is working for prospect discovery and demo generation. The authenticated dashboard currently reports **10 prospects, 10 generated demo sites, and 0 outreach emails**. The demos are public at `/demo/<id>`.

Email outreach is **not currently configured**: `RESEND_API_KEY` and `RESEND_FROM_EMAIL` are absent from the local environment. Reply-webhook processing is also not configured. The demo contact form is explicitly a preview-only form and does not send submissions.

This is a status report, not a claim that the app has been deployed to production. Production deployment and its environment settings were not checked.

## What the application does

1. An administrator signs in to the workspace.
2. The administrator saves a business niche, target city/country, and daily lead limit.
3. The pipeline asks Google Places for local businesses matching that niche and location.
4. It filters out listings that already have a website and businesses already known to the app.
5. Gemini scores eligible prospects and writes concept-site copy.
6. Prospect and generated-site records are saved in MongoDB Atlas.
7. The dashboard displays prospects and demo links. A demo page is available at `/demo/<id>`.
8. An independently verified business email is added manually. After reviewing the demo, the administrator clicks **Send Pitch Email** for that demo to send exactly one personalized email through Resend.
9. An external inbound-email provider can optionally call the reply webhook to record replies.

The pipeline processes at most five businesses per run. It also retries demos for saved prospects that do not yet have a generated site.

## How it is built

| Area | Technology / location | Role |
|---|---|---|
| Frontend | React 18, TypeScript, Vite | Workspace UI, sign-in, settings, prospects, demos |
| Styling | Tailwind CSS | Responsive dashboard and demo presentation |
| Local API runtime | Vercel CLI (`npm run vercel:dev`) | Runs the frontend and serverless API routes together |
| API | TypeScript handlers in `api/` | Authentication, dashboard, pipeline, demos, prospects, unsubscribe, replies |
| Database | MongoDB Atlas with Mongoose | Stores settings, prospects, demo sites, and outreach logs |
| Business discovery | Google Places API (New) | Searches businesses and retrieves listing details |
| AI content | Google GenAI SDK | Scores prospects and generates demo-site/outreach copy |
| Email provider | Resend | Sends outreach when configured |
| Build check | `npm run build` | Type-checks with `tsc -b`, then creates the Vite production bundle |

### Main data collections

- `LeadConfig`: the saved current workspace configuration.
- `Prospect`: business listing, lead score, manually verified email, and contact status.
- `GeneratedSite`: generated copy and the public demo URL associated with a prospect.
- `OutreachLog`: sent-email and reply history.

## Verified current status

| Check | Result |
|---|---|
| Local homepage | Responds successfully at `http://localhost:3000/` |
| Authenticated dashboard API | Responds with JSON for the signed-in browser |
| Public demo API | Returns demo JSON for an existing demo |
| Direct demo route | `/demo/<id>` renders the generated business site |
| Current dashboard records | 10 prospects, 10 generated sites, 0 outreach logs |
| Places discovery | Previously completed successfully; businesses appeared in the dashboard |
| Gemini fallback | A minimal request to `gemini-3.5-flash-lite` succeeded during the previous check |
| Production build | `npm run build` passed after the application fixes |
| Resend | Not configured in local `.env.local` |
| Reply webhook | `REPLY_WEBHOOK_SECRET` not configured |
| Production deployment | Not verified |

The main Gemini model has previously returned temporary `503 UNAVAILABLE` responses. The code retries transient failures and falls back from `gemini-3.8-flash` to `gemini-3.5-flash-lite`. The fallback passed a small availability check, but external provider availability can change.

## What is working

- Admin login and signed session-cookie authentication.
- Dashboard settings and MongoDB-backed dashboard data.
- Google Places prospect discovery.
- Gemini lead scoring and demo-content generation, including fallback handling.
- Persistent prospect records and retrying demo generation for prospects without a site.
- Public demo API and direct `/demo/<id>` links.
- Adding an independently verified business email to a prospect.
- Manually sending one pitch email for a reviewed demo through the dedicated button. The discovery pipeline never sends email.
- Safe frontend handling of non-JSON and failed API responses.
- Clearer display of per-business pipeline failures.
- Unsubscribe endpoint with a signed token, provided `OUTREACH_SECRET` is configured.

## What is not working or is not configured

### Email outreach

Local configuration checks before the manual-send feature found:

- `RESEND_API_KEY`: not configured.
- `RESEND_FROM_EMAIL`: not configured.
- `OUTREACH_SECRET`: not configured.

At the time of the configuration check, **no outreach email could be sent**, matching the dashboard's 0 outreach logs. Email now requires the administrator to click **Send Pitch Email** for a specific demo and confirm the recipient; pipeline runs never send email. To enable sending, configure `RESEND_API_KEY`, `RESEND_FROM_EMAIL`, and `OUTREACH_SECRET` in the server environment, verify the sender domain with Resend, set `APP_URL` to a public HTTPS URL, and fill in the sender name, reply-to email, and physical mailing address in workspace settings. Add only independently verified business email addresses. The send flow records a send claim and blocks sending a second pitch to the same prospect.

### Replies

`REPLY_WEBHOOK_SECRET` is not configured and no inbound email provider integration was verified. Replies will not automatically appear in the dashboard until a trusted provider is configured to call `/api/replies`.

### Demo contact form

The contact form on generated demos is a visual preview only. Its submit action displays a note; it does **not** deliver form submissions to the business or workspace.

### Public deployment and external sharing

The app currently runs locally using Vercel's development server. Public demo URLs built from a local `APP_URL` are only useful on this machine. For sharing demos externally, deploy the app and set `APP_URL` to its public HTTPS origin in the deployment environment. Production deployment was not tested as part of this check.

## Security and data notes

- Provider keys, MongoDB URI, and signing secrets are server-side settings and must never be moved into `VITE_` variables or browser code.
- The administrator password was shared in chat. Rotate it in `.env.local` and in any deployed environment where it is reused. Also rotate the session signing secret to invalidate existing sessions.
- Do not paste credentials into chat, screenshots, or source files.
- Gemini-generated descriptions are draft marketing copy, not independently verified business facts. Review generated claims before publishing or sending them.
- Google Places does not provide verified email addresses. The app intentionally requires the operator to add one manually.
- Confirm applicable email and privacy requirements before enabling outreach.

## How to run and use it

### Start locally

From the project directory:

```powershell
npm run vercel:dev
```

Use the local URL printed by Vercel, currently `http://localhost:3000/`. `npm run dev` starts Vite only and does not provide the API routes required by dashboard actions.

### Run discovery and create demos

1. Sign in using the configured workspace password.
2. Open **Configure** and set the target niche, city, country, and daily lead limit.
3. Save the settings. Sender details and mailing address are optional for demo generation.
4. Select **Run pipeline**.
5. Open a generated site from **Generated sites**, or follow a `/demo/<id>` link.

### Enable outreach later

1. Configure and verify Resend.
2. Add `RESEND_API_KEY`, `RESEND_FROM_EMAIL`, and a unique `OUTREACH_SECRET` of at least 32 characters to the server environment.
3. Set the sender name, reply-to address, and physical mailing address in workspace settings.
4. Add an independently verified email to a prospect.
5. Open the generated demo, then click **Send Pitch Email** next to that demo and confirm its recipient. Running the pipeline does not send mail.

## Useful verification commands

```powershell
npm run typecheck
npm run build
```

The most recent production build passed. No pipeline run was initiated solely for this report.
