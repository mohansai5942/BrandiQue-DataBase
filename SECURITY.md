# Security notes

- Never commit `FIREBASE_SERVICE_ACCOUNT_JSON`, private keys, passwords, or tokens.
- Use Firebase Authentication verified-email accounts and set the exact administrator email allowlist in Vercel.
- Rotate a service-account key immediately if it is exposed; remove the exposed key from Google Cloud IAM.
- Keep the Vercel service-account secret server-only. Do not prefix it with `VITE_`.
- Publish `firestore.rules.example` / `storage.rules.example` in the Firebase console (they are not deployed by Vercel). Keep them consistent with the website repo's `firestore.rules`.
- Security headers and the Content-Security-Policy live in `vercel.json`. The CSP allows scripts only from this origin; Firebase Auth is initialised without the popup/redirect resolver so no Google script or iframe is needed. If you add Google sign-in popups later, extend `script-src`/`frame-src` accordingly.
- Consider disabling self sign-up in Firebase Authentication (Settings → User actions) since only allowlisted admins use this console.
- Report a suspected exposure by disabling the affected key/token and reviewing Firebase/GCP audit logs.
