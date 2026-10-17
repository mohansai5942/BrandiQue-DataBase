# BrandiQue Data Console

A standalone, responsive database management dashboard for BrandiQue Web Solutions. This repository is intentionally separate from the public BrandiQue website.

## What is included

- React + TypeScript dashboard with collection navigation, search, project showcase cards, detailed leads, editing, soft delete/recycle bin, restore, and JSON/CSV export.
- Firebase Authentication sign-in for administrators.
- Vercel Node.js API functions protected by verified Firebase ID tokens and an explicit administrator email allowlist.
- Firebase Admin SDK usage on the server only; no service-account credentials in browser code.
- An allowlist of collections: `messages`, `projects`, `settings`, `websites`, `n8n_projects`, `n8n_project_forms`, and `prompts`.
- A per-record size guard, a 100-record fetch limit, exact-origin CORS checks, and security headers.
- Project image/video URL entry, Firebase Storage uploads, and live media previews.
- n8n workflow JSON validation and a node/connection diagram preview.

## Services

Enquiries store the service name as free text in `messages.service` (max 200 characters in the Firestore rules), so a new website service needs no schema change or migration. The core services (`CORE_SERVICES` in `api/_security.ts`: Web Development, AI Agents & Automations, Graphic Design, Voice Calling AI Agents) are always offered in the Contact Form → Services filter, followed by any other service names found in records. Voice enquiries carry `serviceDetails` keys `Voice Goal` and `Voice Languages & Volume`.

Voice Calling AI Agents plans live in `api/_catalog.ts` (one-time setup fee ₹1,999 (`setupFeeInr: 1999`, `setupFeeType: 'one-time'`), then billed only per connected minute, no monthly or agent fee: Voice Starter ₹5/min, Voice Growth ₹8/min (most popular), Voice Premium ₹11/min, each with its own tagline and features). `seed/voice-ai-agents-plans.json` is the same record in the console's backup format: **Import Data** writes only `settings/service-voice-ai-agents` (additive; settings documents other than `contact` are server-only under the Firestore rules).

## Lead notifications (while the dashboard is open)

- The header bell polls the secure server API (`/api/data`) every 20 seconds for the
  `messages`, `n8n_project_forms`, `projects` and `websites` collections. When a new document
  appears: an in-app toast fires, a subtle beep plays (WebAudio, mutable in the panel), the
  bell badge increments, and the event is appended to the notification slide-over panel.
- With the one-time permission banner accepted, a native OS notification also fires for new leads.
- Seen-state and per-collection last-seen timestamps live in `localStorage`, so the badge clears
  when the panel is opened and old documents never re-notify after a reload.
- Client-side Firestore listeners are intentionally not used: the Firestore rules deny direct
  browser reads on submissions, so polling the Admin-SDK-backed API keeps the admin email
  allowlist enforcement intact.
- Push-when-closed is separate and already exists: `brandique.in` calls `POST /api/notify-submission`
  after each form submit, delivered via the Web Push subscription in `src/pwa.ts`.

## Important integration note

Deploying this repository by itself does **not** automatically connect it to the live website. The current public site has its own Firebase client configuration and direct Firestore reads/writes. For edits made here to appear on `brandique.in`, the public site must be migrated to the same Firebase project/database (or its data access must be switched to this API) and tested. That integration is intentionally not performed from this repository, to avoid unexpected changes to the live website.

Do not delete the old Firebase project or its databases until a verified backup/migration and public-site cutover are complete.

## Deploy to Vercel

1. Open Vercel and choose **Add New → Project**.
2. Import `mohansai5942/BrandiQue-DataBase`.
3. Framework preset: **Vite**. Build command: `npm run build`. Output directory: `dist`. Install command: `npm install`.
4. Add the environment variables below in Vercel **Project → Settings → Environment Variables** for Preview and Production as appropriate.
5. Deploy. First test on the Vercel-provided deployment domain.
6. In Firebase Console for project `brandique-web-solutions`, enable **Authentication → Sign-in method → Email/Password**. Add the administrator account under **Authentication → Users** and verify its email.
7. Under **Authentication → Settings → Authorized domains**, add the Vercel deployment domain. Later, add `data.brandique.in` when the custom domain is attached.
8. Once staging checks succeed, add `data.brandique.in` under Vercel **Settings → Domains**, then configure the DNS record Vercel displays. Do not change the main `brandique.in` DNS records.

### Environment variables

Client config (these are Firebase web-app config fields; they are not server credentials):

- `VITE_FIREBASE_API_KEY` — use the real web-app API key from Firebase Project Settings; do not use a masked placeholder.
- `VITE_FIREBASE_AUTH_DOMAIN=brandique-web-solutions.firebaseapp.com`
- `VITE_FIREBASE_PROJECT_ID=brandique-web-solutions`
- `VITE_FIREBASE_STORAGE_BUCKET=brandique-web-solutions.firebasestorage.app`
- `VITE_FIREBASE_MESSAGING_SENDER_ID=392875307100`
- `VITE_FIREBASE_APP_ID=1:392875307100:web:aef3ff9e70023d9b363699`

Server-only:

- `FIREBASE_PROJECT_ID=brandique-web-solutions`
- `FIREBASE_SERVICE_ACCOUNT_JSON` — paste the **entire JSON contents** of a service account created for the **new** Firebase project. Store this as a Vercel secret/environment variable only. Never commit it, place it in a VITE variable, or paste it into chat. Prefer a dedicated service account. Grant `Cloud Datastore User` for Firestore record access and `Firebase Authentication Viewer` for the token revocation/disabled-user check; do not reuse the Firebase Admin SDK service-agent identity.
- `ADMIN_EMAILS` — comma-separated exact email addresses permitted to sign in, e.g. `your-admin@example.com`. Use the account's actual email and ensure Firebase Auth email verification is complete.
- `DASHBOARD_ORIGIN` — exact deployed dashboard origin, e.g. `https://your-project.vercel.app` during staging, then `https://data.brandique.in`.
- `ALLOWED_ORIGINS` — optional comma-separated extra origins allowed to call `/api/notify-submission` only. `https://brandique.in` and `https://www.brandique.in` are built in for that route; every other route accepts only the dashboard's own origin.

Changing Vercel environment variables requires a new deployment to take effect.

## API

Public routes (no sign-in):

- `GET /api/public-profile` — returns only `{ ok, avatarUrl }` for the login screen.
- `POST /api/notify-submission` — called by brandique.in after a form submission with `{ collection, id }` only. The server re-reads the document and sends one push per fresh (under 15 minutes old) submission; the text is built server-side with capped lengths. Rate-limited per IP.

Admin routes (everything else):

- `GET /api/health` — returns service status and whether the server configuration appears to be present. Does not return secrets.
- `GET /api/data?collection=projects` — list up to 100 records.
- `GET /api/data?collection=projects&id=DOCUMENT_ID` — fetch one record.
- `POST /api/data?collection=projects` — create a record.
- `PATCH /api/data?collection=projects&id=DOCUMENT_ID` — merge updates into a record.
- `DELETE /api/data?collection=projects&id=DOCUMENT_ID` — reversible soft delete by setting `isDeleted` and `deletedAt`.

- `POST /api/permanent-delete`, `GET|POST /api/backup`, `GET /api/push-public-key`, `POST /api/push-subscribe|push-unsubscribe|push-test`.

Every admin route requires `Authorization: Bearer <Firebase ID token>` (verified, not revoked), an enabled account whose email is in `ADMIN_EMAILS`, and Firebase email verification. Collection names are allowlisted, document IDs are validated (no `/`, `.`/`..`, or reserved `__x__` names), record shapes and sizes are capped, and server errors return generic messages. Helper modules in `api/` are prefixed with `_` so Vercel never deploys them as functions.

## Firebase permissions and data safety

- The API uses Firebase Admin SDK on the server; the SDK bypasses Firestore Security Rules. Therefore the API's authentication and collection allowlist are critical.
- Firestore rules should still protect direct browser access. Do not deploy public `allow read, write: if true` rules.
- `firestore.rules.example` is the recommended ruleset: public create-only, validated form submissions; public read of published content and `settings/contact` only; everything else (push_subscriptions, system_config, prompts) server-only. Keep it in step with the website repo's `firestore.rules` and publish one ruleset in the Firebase console.
- Back up existing records before migrating. Test contact submissions, project listing, settings, website links, automation listings, and error/denied-access paths before production cutover.
- This dashboard returns at most 100 records per collection in the first version. For larger collections, add cursor-based pagination before relying on it as a complete export tool.
- Project images and videos upload directly to Firebase Storage after Firebase Authentication. Before enabling uploads, create/verify the Storage bucket in the new project and deploy the rules in `storage.rules.example` after replacing its admin email placeholder with every exact email in `ADMIN_EMAILS`. The rules keep writes limited to verified admin accounts, cap each project file at 25 MB and the admin avatar (`dashboard/admin/`) at 2 MB, and allow public reads for portfolio media and the avatar. Firebase will deny browser uploads until those exact rules are configured. Do not store Base64 media in Firestore.
- The editor accepts up to 10 project images and 5 videos. Video playback depends on the Storage bucket and the browser's codec support.

## Local development

```bash
npm install
cp .env.example .env.local
npm run dev
```

Vite serves the UI locally; the Vercel API functions require `vercel dev` for a complete local end-to-end run. Never put the service-account JSON in the frontend environment. Run `npm run typecheck` and `npm run build` before production deployment.
