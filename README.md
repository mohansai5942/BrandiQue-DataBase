# BrandiQue Data Console

A standalone, responsive database management dashboard for BrandiQue Web Solutions. This repository is intentionally separate from the public BrandiQue website.

## What is included

- React + TypeScript dashboard with collection navigation, search, editing, soft delete/recycle bin, restore, and JSON/CSV export.
- Firebase Authentication sign-in for administrators.
- Vercel Node.js API functions protected by verified Firebase ID tokens and an explicit administrator email allowlist.
- Firebase Admin SDK usage on the server only; no service-account credentials in browser code.
- An allowlist of collections: `messages`, `projects`, `settings`, `websites`, `n8n_projects`, `n8n_project_forms`, and `prompts`.
- A per-record size guard, a 100-record fetch limit, and basic security headers.

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

- `FIREBASE_SERVICE_ACCOUNT_JSON` — paste the **entire JSON contents** of a service account created for the **new** Firebase project. Store this as a Vercel secret/environment variable only. Never commit it, place it in a VITE variable, or paste it into chat. Prefer a dedicated service account with only required Firestore data access; do not reuse the Firebase Admin SDK service-agent identity.
- `ADMIN_EMAILS` — comma-separated exact email addresses permitted to sign in, e.g. `your-admin@example.com`. Use the account's actual email and ensure Firebase Auth email verification is complete.
- `DASHBOARD_ORIGIN` — exact deployed dashboard origin, e.g. `https://your-project.vercel.app` during staging, then `https://data.brandique.in`.
- `ALLOWED_ORIGINS` — optional comma-separated cross-origin callers. Leave blank for same-origin dashboard-only access; later add `https://brandique.in,https://www.brandique.in` only if the public site is intentionally configured to call this API from the browser.

Changing Vercel environment variables requires a new deployment to take effect.

## API

- `GET /api/health` — returns service status and whether the server configuration appears to be present. Does not return secrets.
- `GET /api/data?collection=projects` — list up to 100 records.
- `GET /api/data?collection=projects&id=DOCUMENT_ID` — fetch one record.
- `POST /api/data?collection=projects` — create a record.
- `PATCH /api/data?collection=projects&id=DOCUMENT_ID` — merge updates into a record.
- `DELETE /api/data?collection=projects&id=DOCUMENT_ID` — reversible soft delete by setting `isDeleted` and `deletedAt`.

All `/api/data` routes require `Authorization: Bearer <Firebase ID token>`, a verified Firebase-authenticated email, and membership in `ADMIN_EMAILS`. Collection names are allowlisted. The UI does not expose permanent-delete functionality.

## Firebase permissions and data safety

- The API uses Firebase Admin SDK on the server; the SDK bypasses Firestore Security Rules. Therefore the API's authentication and collection allowlist are critical.
- Firestore rules should still protect direct browser access. Do not deploy public `allow read, write: if true` rules.
- The live website currently has existing direct Firestore operations. Do not apply restrictive rules or change its Firebase config until those flows are migrated and staging-tested, or some website features may stop working.
- Back up existing records before migrating. Test contact submissions, project listing, settings, website links, automation listings, and error/denied-access paths before production cutover.
- This dashboard returns at most 100 records per collection in the first version. For larger collections, add cursor-based pagination before relying on it as a complete export tool.
- This version does not upload binary assets. Keep images and videos in a dedicated file store and save URLs in Firestore; avoid Base64 files in documents.

## Local development

```bash
npm install
cp .env.example .env.local
npm run dev
```

Vite serves the UI locally; the Vercel API functions require `vercel dev` for a complete local end-to-end run. Never put the service-account JSON in the frontend environment. Run `npm run typecheck` and `npm run build` before production deployment.
